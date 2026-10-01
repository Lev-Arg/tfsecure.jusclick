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
