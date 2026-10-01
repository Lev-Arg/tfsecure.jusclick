import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorize, currentProfile, writeAudit } from "./lib";
export const list = query({ args: {}, handler: async ctx => ((await currentProfile(ctx)) ? ctx.db.query("departments").withIndex("by_name").collect() : []) });
export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "departments.manage", a.name);
    if (!me) return { ok: false as const, error: "Not permitted" };
    const name = a.name.trim().slice(0, 60);
    if (!name) return { ok: false as const, error: "Enter a department name" };
    if (await ctx.db.query("departments").withIndex("by_name", q => q.eq("name", name)).first()) return { ok: false as const, error: "That department already exists" };
    await ctx.db.insert("departments", { name });
    await writeAudit(ctx, me, "departments.manage", true, `added ${name}`);
    return { ok: true as const };
  },
});
export const remove = mutation({
  args: { id: v.id("departments") },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "departments.manage", "remove");
    if (!me) return { ok: false as const, error: "Not permitted" };
    const d = await ctx.db.get(a.id);
    if (!d) return { ok: false as const, error: "Not found" };
    for (const p of await ctx.db.query("profiles").collect()) if (p.departmentId === a.id) await ctx.db.patch(p._id, { departmentId: undefined });
    await ctx.db.delete(a.id);
    await writeAudit(ctx, me, "departments.manage", true, `removed ${d.name}`);
    return { ok: true as const };
  },
});
