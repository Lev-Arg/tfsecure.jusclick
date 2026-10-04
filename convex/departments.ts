import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorize, currentProfile, sanitizeServerText, validateCsrfToken, writeAudit } from "./lib";

export const list = query({
  args: {},
  handler: async ctx =>
    (await currentProfile(ctx)) ? ctx.db.query("departments").withIndex("by_name").take(100) : [],
});

export const add = mutation({
  args: { name: v.string(), csrfToken: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "departments.manage", a.name);
    if (!me) return { ok: false as const, error: "Not permitted" };
    if (a.csrfToken && !(await validateCsrfToken(ctx, a.csrfToken))) {
      return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
    }
    const name = sanitizeServerText(a.name, 60);
    if (name.length < 2) return { ok: false as const, error: "Enter a valid department name" };
    const existing = await ctx.db.query("departments").withIndex("by_name").take(100);
    if (existing.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false as const, error: "That department already exists" };
    }
    const newDeptId = await ctx.db.insert("departments", { name });
    // Bind any existing profiles that do not yet have a department
    const profiles = await ctx.db.query("profiles").take(200);
    for (const p of profiles) {
      if (!p.departmentId) {
        await ctx.db.patch(p._id, { departmentId: newDeptId });
      }
    }
    await writeAudit(ctx, me, "departments.manage", true, `added ${name}`);
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: { id: v.id("departments"), csrfToken: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "departments.manage", "remove");
    if (!me) return { ok: false as const, error: "Not permitted" };
    if (a.csrfToken && !(await validateCsrfToken(ctx, a.csrfToken))) {
      return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
    }
    const d = await ctx.db.get(a.id);
    if (!d) return { ok: false as const, error: "Not found" };
    const allDepts = await ctx.db.query("departments").withIndex("by_name").take(100);
    if (allDepts.length <= 1) {
      return { ok: false as const, error: "Cannot delete the last remaining department" };
    }
    const fallbackDept = allDepts.find(x => x._id !== a.id);
    const profiles = await ctx.db.query("profiles").take(200);
    for (const p of profiles) {
      if (p.departmentId === a.id) {
        await ctx.db.patch(p._id, { departmentId: fallbackDept?._id });
      }
    }
    await ctx.db.delete(a.id);
    await writeAudit(ctx, me, "departments.manage", true, `removed ${d.name}`);
    return { ok: true as const };
  },
});
