import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { role } from "./schema";
import { authorize, can, currentProfile, writeAudit } from "./lib";

export const me = query({ args: {}, handler: ctx => currentProfile(ctx) });

// Called after sign-in. First account becomes admin; everyone else starts as read-only "report".
export const ensureProfile = mutation({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (await currentProfile(ctx)) return null;
    const user = await ctx.db.get(userId) as any;
    const first = (await ctx.db.query("profiles").first()) === null;
    await ctx.db.insert("profiles", { userId, name: (user?.name || user?.email || "User").slice(0, 80), email: user?.email ?? "", role: first ? "admin" : "report", active: true });
    await writeAudit(ctx, await currentProfile(ctx), "profile.create", true, first ? "first user -> admin" : "default role: report");
    return null;
  },
});
export const list = query({
  args: {},
  handler: async ctx => (can(await currentProfile(ctx), "users.manage") ? ctx.db.query("profiles").collect() : []),
});
async function adminEdit(ctx: any, profileId: any, detail: string, patch: (t: any, me: any) => Promise<string | null> | string | null) {
  const me = await authorize(ctx, "users.manage", detail);
  if (!me) return { ok: false as const, error: "Not permitted" };
  const t = await ctx.db.get(profileId);
  if (!t) return { ok: false as const, error: "User not found" };
  if (t.userId === me.userId) return { ok: false as const, error: "You cannot change your own account here" };
  const err = await patch(t, me);
  if (err) return { ok: false as const, error: err };
  await writeAudit(ctx, me, "users.manage", true, `${t.email}: ${detail}`);
  return { ok: true as const };
}
export const setRole = mutation({ args: { profileId: v.id("profiles"), role }, handler: (ctx, a) => adminEdit(ctx, a.profileId, `role -> ${a.role}`, async t => { await ctx.db.patch(t._id, { role: a.role }); return null; }) });
export const setActive = mutation({ args: { profileId: v.id("profiles"), active: v.boolean() }, handler: (ctx, a) => adminEdit(ctx, a.profileId, a.active ? "activated" : "deactivated", async t => { await ctx.db.patch(t._id, { active: a.active }); return null; }) });
export const setDepartment = mutation({ args: { profileId: v.id("profiles"), departmentId: v.optional(v.id("departments")) }, handler: (ctx, a) => adminEdit(ctx, a.profileId, "department changed", async t => { await ctx.db.patch(t._id, { departmentId: a.departmentId }); return null; }) });
