import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Strips HTML tags, script vectors, and control characters to prevent stored XSS.
 */
export function sanitizeServerText(raw: string | undefined, maxLen = 120): string {
  if (!raw) return "";
  return raw
    .replace(/[<>"'`]/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLen);
}

// Single source of truth for RBAC. Enforced server-side in every function.
// - "admin": Full access, only role permitted to view system audit logs ("audit.read")
// - "security": Gate operations, all-department passcode & on-site logs ("passcode.list.all"), CSV export
// - "report" (Department Head): Scoped strictly to their bound department ("passcode.list.dept")
// - "staff": Scoped strictly to their individual passcodes within their bound department
export const PERMS = {
  "passcode.issue": ["admin", "security", "report", "staff"],
  "passcode.read": ["admin", "security", "report", "staff"],
  "passcode.validate": ["admin", "security"],
  "passcode.revoke": ["admin", "security", "report", "staff"],
  "passcode.list.all": ["admin", "security"],
  "passcode.list.dept": ["report"],
  "reports.export": ["admin", "security"],
  "audit.read": ["admin"],
  "metrics.read": ["admin", "security", "report"],
  "users.manage": ["admin"],
  "departments.manage": ["admin"],
  "settings.update": ["admin"],
} as const;

export type Action = keyof typeof PERMS;
const SENSITIVE: Action[] = ["users.manage", "departments.manage", "settings.update", "audit.read"];

export async function currentProfile(ctx: QueryCtx): Promise<Doc<"profiles"> | null> {
  const userId = await getAuthUserId(ctx); // identity from the session, never from args
  if (!userId) return null;
  return ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
}

export const can = (p: Doc<"profiles"> | null, a: Action) =>
  !!p && p.active === true && (PERMS[a] as readonly string[]).includes(p.role);

export async function writeAudit(
  ctx: MutationCtx,
  p: Doc<"profiles"> | null,
  action: string,
  ok: boolean,
  detail = ""
) {
  await ctx.db.insert("audit", {
    userId: p?.userId,
    name: sanitizeServerText(p?.name, 80) || "anonymous",
    action: sanitizeServerText(action, 60),
    detail: sanitizeServerText(detail, 240),
    ok,
    at: Date.now(),
  });
}

export async function notifyRoles(ctx: MutationCtx, roles: string[], kind: string, message: string) {
  const all = await ctx.db.query("profiles").take(200);
  const now = Date.now();
  const cleanMsg = sanitizeServerText(message, 240);
  for (const p of all) {
    if (p.active === true && roles.includes(p.role)) {
      await ctx.db.insert("notifications", {
        userId: p.userId,
        kind: sanitizeServerText(kind, 40),
        message: cleanMsg,
        at: now,
        read: false,
      });
    }
  }
}

export async function notifyUser(ctx: MutationCtx, userId: Id<"users">, kind: string, message: string) {
  await ctx.db.insert("notifications", {
    userId,
    kind: sanitizeServerText(kind, 40),
    message: sanitizeServerText(message, 240),
    at: Date.now(),
    read: false,
  });
}

// Mutation guard: logs denials (no throw, so the log commits). Alerts admins on denied admin-only actions.
export async function authorize(ctx: MutationCtx, a: Action, detail = "") {
  const p = await currentProfile(ctx);
  const ok = can(p, a);
  if (!ok) {
    await writeAudit(ctx, p, a, false, detail);
    if (SENSITIVE.includes(a)) {
      await notifyRoles(ctx, ["admin"], "security", `${p?.name ?? "Unknown user"} was denied ${a}`);
    }
  }
  return ok ? p! : null;
}

// CSRF validation helper - validates token and deletes it (one-time use)
export async function validateCsrfToken(ctx: MutationCtx, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;

  const stored = await ctx.db.query("csrfTokens")
    .withIndex("by_token", q => q.eq("token", token))
    .first();

  if (!stored) return false;
  if (stored.userId !== userId) return false;
  if (stored.expiresAt < Date.now()) {
    await ctx.db.delete(stored._id);
    return false;
  }

  // One-time use: delete after validation
  await ctx.db.delete(stored._id);
  return true;
}

// Rate limiting helper - checks and enforces rate limits
// Returns true if the action is allowed, false if rate limited
export async function checkRateLimit(
  ctx: MutationCtx,
  identifier: string,
  action: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Clean up expired entries
  const expired = await ctx.db
    .query("rateLimits")
    .withIndex("by_identifier_action", (q) =>
      q.eq("identifier", identifier).eq("action", action)
    )
    .collect();

  for (const entry of expired) {
    if (entry.expiresAt < now) {
      await ctx.db.delete(entry._id);
    }
  }

  // Get current attempts within the window
  const recent = await ctx.db
    .query("rateLimits")
    .withIndex("by_identifier_action", (q) =>
      q.eq("identifier", identifier).eq("action", action)
    )
    .collect();

  const validAttempts = recent.filter(
    (entry) => entry.windowStart >= windowStart && entry.expiresAt >= now
  );

  if (validAttempts.length >= maxAttempts) {
    // Find the oldest entry to calculate retry time
    let oldest = validAttempts[0];
    for (const entry of validAttempts) {
      if (entry.windowStart < oldest.windowStart) {
        oldest = entry;
      }
    }
    const retryAfter = Math.ceil((oldest.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Record this attempt
  await ctx.db.insert("rateLimits", {
    identifier,
    action,
    attempts: validAttempts.length + 1,
    windowStart: now,
    expiresAt: now + windowMs,
  });

  return { allowed: true };
}

// Rate limit configuration for authentication actions
export const AUTH_RATE_LIMITS = {
  signIn: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
  signUp: { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 attempts per hour
  passwordReset: { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 attempts per hour
  emailVerify: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
} as const;
