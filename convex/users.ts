import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { role } from "./schema";
import { authorize, can, currentProfile, notifyRoles, sanitizeServerText, validateCsrfToken, writeAudit } from "./lib";

async function hashInviteCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function generateInviteCode(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function hasOtherActiveAdmin(ctx: MutationCtx, profileId: Id<"profiles">): Promise<boolean> {
  const admins = await ctx.db
    .query("profiles")
    .withIndex("by_role_and_active", q => q.eq("role", "admin").eq("active", true))
    .take(2);
  return admins.some(profile => profile._id !== profileId);
}

async function getPrimaryActiveAdmin(ctx: MutationCtx) {
  const primary = await ctx.db
    .query("profiles")
    .withIndex("by_role_and_active", q => q.eq("role", "admin").eq("active", true))
    .first();
  if (primary && !primary.isPrimaryAdmin) {
    await ctx.db.patch(primary._id, { isPrimaryAdmin: true });
  }
  return primary;
}

export const me = query({ args: {}, handler: ctx => currentProfile(ctx) });

// Called after sign-in. First account becomes active admin; all subsequent new users start inactive (active: false)
// and require explicit administrator approval before they can log in or use the system.
export const ensureProfile = mutation({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    await getPrimaryActiveAdmin(ctx);
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
    if (!user) {
      throw new Error("User document not found. Auth account exists but user table is empty.");
    }
    const email = sanitizeServerText(user.email ?? "", 120).toLowerCase();
    const invitation = email
      ? await ctx.db.query("invitations").withIndex("by_email", q => q.eq("email", email)).first()
      : null;
    const validInvitation = invitation && invitation.acceptedAt === undefined && invitation.expiresAt > Date.now()
      ? invitation
      : null;
    const firstProfile = await ctx.db.query("profiles").first();
    const isPrimaryAdmin = !firstProfile && !validInvitation;
    const defaultDept = await ctx.db.query("departments").first();
    const cleanName = sanitizeServerText(user?.name || user?.email || "User", 80);
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: cleanName,
      email,
      role: validInvitation?.role ?? (isPrimaryAdmin ? "admin" : "staff"),
      active: Boolean(validInvitation) || isPrimaryAdmin,
      departmentId: validInvitation?.departmentId ?? defaultDept?._id,
      isPrimaryAdmin,
    });
    if (validInvitation) await ctx.db.patch(validInvitation._id, { acceptedAt: Date.now() });
    const createdProfile = await ctx.db.get(profileId);
    await writeAudit(
      ctx,
      createdProfile,
      "profile.create",
      true,
      isPrimaryAdmin ? "first user -> primary active admin" : `pending/accepted signup (${email})`
    );
    if (!isPrimaryAdmin && !validInvitation) {
      await notifyRoles(
        ctx,
        ["admin"],
        "security",
        `New user registration pending approval: ${cleanName} (${email})`
      );
    }
    return null;
  },
});

export const list = query({
  args: {},
  handler: async ctx => (can(await currentProfile(ctx), "users.manage") ? ctx.db.query("profiles").take(200) : []),
});

export const invitations = query({
  args: {},
  handler: async ctx => {
    if (!can(await currentProfile(ctx), "users.manage")) return [];
    const now = Date.now();
    const rows = await ctx.db.query("invitations").take(200);
    return rows
      .filter(invitation => invitation.acceptedAt === undefined && invitation.expiresAt > now)
      .map(({ codeHash: _codeHash, ...invitation }) => invitation);
  },
});

async function adminEdit(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  detail: string,
  patch: (t: Doc<"profiles">, me: Doc<"profiles">) => Promise<string | null> | string | null,
  allowSelf = false,
  csrfToken: string
) {
  const me = await authorize(ctx, "users.manage", detail);
  if (!me) return { ok: false as const, error: "Not permitted" };
  if (!(await validateCsrfToken(ctx, csrfToken))) {
    return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
  }
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
  args: { profileId: v.id("profiles"), role, csrfToken: v.string() },
  handler: (ctx, a) =>
    adminEdit(
      ctx,
      a.profileId,
      `role -> ${a.role}`,
      async t => {
        const primary = await getPrimaryActiveAdmin(ctx);
        if ((t.isPrimaryAdmin || primary?._id === t._id) && a.role !== "admin") {
          return "Cannot change the primary system admin role";
        }
        if (t.role === "admin" && t.active === true && a.role !== "admin" && !(await hasOtherActiveAdmin(ctx, t._id))) {
          return "Cannot demote the last active administrator";
        }
        await ctx.db.patch(t._id, { role: a.role });
        return null;
      },
      false,
      a.csrfToken
    ),
});

export const setActive = mutation({
  args: { profileId: v.id("profiles"), active: v.boolean(), csrfToken: v.string() },
  handler: (ctx, a) =>
    adminEdit(
      ctx,
      a.profileId,
      a.active ? "approved / activated" : "deactivated",
      async t => {
        const primary = await getPrimaryActiveAdmin(ctx);
        if ((t.isPrimaryAdmin || primary?._id === t._id) && !a.active) {
          return "Cannot deactivate the primary system admin";
        }
        if (t.role === "admin" && t.active === true && !a.active && !(await hasOtherActiveAdmin(ctx, t._id))) {
          return "Cannot deactivate the last active administrator";
        }
        await ctx.db.patch(t._id, { active: a.active });
        return null;
      },
      false,
      a.csrfToken
    ),
});

  export const createInvitation = mutation({
    args: {
      email: v.string(),
      name: v.string(),
      role,
      departmentId: v.optional(v.id("departments")),
      csrfToken: v.string(),
    },
    handler: async (ctx, args) => {
      const actor = await authorize(ctx, "users.manage", `invite ${args.email}`);
      if (!actor) return { ok: false as const, error: "Not permitted" };
      if (!(await validateCsrfToken(ctx, args.csrfToken))) {
        return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
      }
      const email = sanitizeServerText(args.email, 120).toLowerCase();
      const name = sanitizeServerText(args.name, 80);
      if (!email.includes("@") || name.length < 2) {
        return { ok: false as const, error: "Enter a valid email address and full name." };
      }
      if (args.departmentId && !(await ctx.db.get(args.departmentId))) {
        return { ok: false as const, error: "Department not found." };
      }
      const existingProfile = await ctx.db
        .query("profiles")
        .withIndex("by_email", q => q.eq("email", email))
        .first();
      const primaryAdmin = await getPrimaryActiveAdmin(ctx);
      if (
        existingProfile &&
        (existingProfile.isPrimaryAdmin || primaryAdmin?._id === existingProfile._id) &&
        args.role !== "admin"
      ) {
        return { ok: false as const, error: "Cannot change the primary system admin role." };
      }
      if (
        existingProfile?.role === "admin" &&
        existingProfile.active === true &&
        args.role !== "admin" &&
        !(await hasOtherActiveAdmin(ctx, existingProfile._id))
      ) {
        return { ok: false as const, error: "Cannot demote the last active administrator." };
      }

      const previousInvitation = await ctx.db
        .query("invitations")
        .withIndex("by_email", q => q.eq("email", email))
        .first();
      if (previousInvitation) await ctx.db.delete(previousInvitation._id);
      if (existingProfile) {
        await ctx.db.patch(existingProfile._id, {
          name,
          role: args.role,
          active: true,
          departmentId: args.departmentId,
        });
        await writeAudit(ctx, actor, "users.invite", true, `${email}: ${args.role}`);
        return { ok: true as const, inviteCode: null };
      }
      const inviteCode = generateInviteCode();
      const now = Date.now();
      await ctx.db.insert("invitations", {
        email,
        name,
        role: args.role,
        departmentId: args.departmentId,
        invitedBy: actor.userId,
        codeHash: await hashInviteCode(inviteCode),
        createdAt: now,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      });
      await writeAudit(ctx, actor, "users.invite", true, `${email}: ${args.role}`);
      return { ok: true as const, inviteCode };
    },
  });

  export const revokeInvitation = mutation({
    args: { invitationId: v.id("invitations"), csrfToken: v.string() },
    handler: async (ctx, args) => {
      const actor = await authorize(ctx, "users.manage", "revoke invitation");
      if (!actor) return { ok: false as const, error: "Not permitted" };
      if (!(await validateCsrfToken(ctx, args.csrfToken))) {
        return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
      }
      const invitation = await ctx.db.get(args.invitationId);
      if (!invitation) return { ok: false as const, error: "Invitation not found." };
      await ctx.db.delete(invitation._id);
      await writeAudit(ctx, actor, "users.invite.revoke", true, invitation.email);
      return { ok: true as const };
    },
  });

  export const claimInvitation = mutation({
    args: { inviteCode: v.string(), csrfToken: v.string() },
    handler: async (ctx, args) => {
      const userId = await getAuthUserId(ctx);
      if (!userId) return { ok: false as const, error: "Sign in before claiming an invitation." };
      if (!(await validateCsrfToken(ctx, args.csrfToken))) {
        return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
      }
      const profile = await currentProfile(ctx);
      if (!profile) return { ok: false as const, error: "User profile is not ready yet." };
      const codeHash = await hashInviteCode(args.inviteCode.trim().toUpperCase());
      const invitation = await ctx.db
        .query("invitations")
        .withIndex("by_code_hash", q => q.eq("codeHash", codeHash))
        .first();
      if (
        !invitation ||
        invitation.acceptedAt !== undefined ||
        invitation.expiresAt <= Date.now() ||
        invitation.email !== profile.email.toLowerCase()
      ) {
        return { ok: false as const, error: "Invitation is invalid, expired, already used, or belongs to another email." };
      }
      await ctx.db.patch(profile._id, {
        name: invitation.name,
        role: invitation.role,
        active: true,
        departmentId: invitation.departmentId,
      });
      await ctx.db.patch(invitation._id, { acceptedAt: Date.now() });
      await writeAudit(ctx, { ...profile, role: invitation.role, active: true }, "users.invite.claim", true, invitation.email);
      return { ok: true as const };
    },
  });

export const setDepartment = mutation({
  args: { profileId: v.id("profiles"), departmentId: v.optional(v.id("departments")), csrfToken: v.string() },
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
      true,
      a.csrfToken
    ),
});
