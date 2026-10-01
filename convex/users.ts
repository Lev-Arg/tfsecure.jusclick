import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { role } from "./schema";
import { authorize, can, currentProfile, notifyRoles, sanitizeServerText, writeAudit } from "./lib";

export const me = query({ args: {}, handler: ctx => currentProfile(ctx) });

// Called after sign-in. First account becomes active admin; all subsequent new users start inactive (active: false)
// and require explicit administrator approval before they can log in or use the system.
export const ensureProfile = mutation({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const existing = await currentProfile(ctx);
    if (existing) {
      if (!existing.departmentId) {
        const defaultDept = await ctx.db.query("departments").first();
        if (defaultDept) {
          await ctx.db.patch(existing._id, { departmentId: defaultDept._id });
        }
      }
      return null;
    }
    const user = (await ctx.db.get(userId)) as { name?: string; email?: string } | null;
    const first = (await ctx.db.query("profiles").first()) === null;
    const defaultDept = await ctx.db.query("departments").first();
    const cleanName = sanitizeServerText(user?.name || user?.email || "User", 80);
    const cleanEmail = sanitizeServerText(user?.email ?? "", 120).toLowerCase();

    await ctx.db.insert("profiles", {
      userId,
      name: cleanName,
      email: cleanEmail,
      role: first ? "admin" : "staff",
      // Security Control: New users (except initial bootstrap admin) remain inactive until approved by Admin
      active: first ? true : false,
      departmentId: defaultDept?._id,
    });

    const createdProfile = await currentProfile(ctx);
    await writeAudit(
      ctx,
      createdProfile,
      "profile.create",
      true,
      first ? "first user -> active admin" : `pending admin approval (${cleanEmail})`
    );
    if (!first) {
      await notifyRoles(
        ctx,
        ["admin"],
        "security",
        `New user registration pending approval: ${cleanName} (${cleanEmail})`
      );
    }
    return null;
  },
});

export const list = query({
  args: {},
  handler: async ctx => (can(await currentProfile(ctx), "users.manage") ? ctx.db.query("profiles").take(200) : []),
});

async function adminEdit(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  detail: string,
  patch: (t: Doc<"profiles">, me: Doc<"profiles">) => Promise<string | null> | string | null,
  allowSelf = false
) {
  const me = await authorize(ctx, "users.manage", detail);
  if (!me) return { ok: false as const, error: "Not permitted" };
  const t = await ctx.db.get(profileId);
  if (!t) return { ok: false as const, error: "User not found" };
  if (!allowSelf && t.userId === me.userId) {
    return { ok: false as const, error: "You cannot change your own role or active status" };
  }
  const err = await patch(t, me);
  if (err) return { ok: false as const, error: err };
  await writeAudit(ctx, me, "users.manage", true, `${t.email}: ${detail}`);
  return { ok: true as const };
}

export const setRole = mutation({
  args: { profileId: v.id("profiles"), role },
  handler: (ctx, a) =>
    adminEdit(ctx, a.profileId, `role -> ${a.role}`, async t => {
      if (t.role === "admin" && a.role !== "admin") {
        const allProfiles = await ctx.db.query("profiles").take(200);
        const activeAdmins = allProfiles.filter(p => p.role === "admin" && p.active === true);
        if (activeAdmins.length <= 1) {
          return "Cannot demote the last active administrator";
        }
      }
      await ctx.db.patch(t._id, { role: a.role });
      return null;
    }),
});

export const setActive = mutation({
  args: { profileId: v.id("profiles"), active: v.boolean() },
  handler: (ctx, a) =>
    adminEdit(ctx, a.profileId, a.active ? "approved / activated" : "deactivated", async t => {
      if (t.role === "admin" && !a.active) {
        const allProfiles = await ctx.db.query("profiles").take(200);
        const activeAdmins = allProfiles.filter(p => p.role === "admin" && p.active === true);
        if (activeAdmins.length <= 1) {
          return "Cannot deactivate the last active administrator";
        }
      }
      await ctx.db.patch(t._id, { active: a.active });
      return null;
    }),
});

export const setDepartment = mutation({
  args: { profileId: v.id("profiles"), departmentId: v.optional(v.id("departments")) },
  handler: (ctx, a) =>
    adminEdit(
      ctx,
      a.profileId,
      "department changed",
      async t => {
        if (a.departmentId) {
          const dept = await ctx.db.get(a.departmentId);
          if (!dept) return "Selected department does not exist";
        }
        await ctx.db.patch(t._id, { departmentId: a.departmentId });
        return null;
      },
      true
    ),
});
