import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Single source of truth for RBAC. Enforced server-side in every function.
export const PERMS = {
  "passcode.issue": ["admin", "security", "staff"],
  "passcode.validate": ["admin", "security"],
  "passcode.revoke": ["admin", "security"],
  "passcode.list.all": ["admin", "security"],
  "audit.read": ["admin", "security", "report"],
  "metrics.read": ["admin", "security", "report"],
  "users.manage": ["admin"],
  "departments.manage": ["admin"],
  "settings.update": ["admin"],
} as const;
export type Action = keyof typeof PERMS;
const SENSITIVE: Action[] = ["users.manage", "departments.manage", "settings.update"];

export async function currentProfile(ctx: QueryCtx): Promise<Doc<"profiles"> | null> {
  const userId = await getAuthUserId(ctx); // identity from the session, never from args
  if (!userId) return null;
  return ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
}
export const can = (p: Doc<"profiles"> | null, a: Action) => !!p && p.active !== false && (PERMS[a] as readonly string[]).includes(p.role);

export async function writeAudit(ctx: MutationCtx, p: Doc<"profiles"> | null, action: string, ok: boolean, detail = "") {
  await ctx.db.insert("audit", { userId: p?.userId, name: p?.name ?? "anonymous", action, detail, ok, at: Date.now() });
}
export async function notifyRoles(ctx: MutationCtx, roles: string[], kind: string, message: string) {
  const all = await ctx.db.query("profiles").collect();
  for (const p of all) if (p.active !== false && roles.includes(p.role)) await ctx.db.insert("notifications", { userId: p.userId, kind, message, at: Date.now(), read: false });
}
export async function notifyUser(ctx: MutationCtx, userId: Id<"users">, kind: string, message: string) {
  await ctx.db.insert("notifications", { userId, kind, message, at: Date.now(), read: false });
}
// Mutation guard: logs denials (no throw, so the log commits). Alerts admins on denied admin-only actions.
export async function authorize(ctx: MutationCtx, a: Action, detail = "") {
  const p = await currentProfile(ctx);
  const ok = can(p, a);
  if (!ok) {
    await writeAudit(ctx, p, a, false, detail);
    if (SENSITIVE.includes(a)) await notifyRoles(ctx, ["admin"], "security", `${p?.name ?? "Unknown user"} was denied ${a}`);
  }
  return ok ? p! : null;
}
