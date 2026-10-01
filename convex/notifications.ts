import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
export const mine = query({
  args: {},
  handler: async ctx => { const u = await getAuthUserId(ctx); return u ? ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", u)).order("desc").take(30) : []; },
});
export const markAllRead = mutation({
  args: {},
  handler: async ctx => { const u = await getAuthUserId(ctx); if (!u) return; for (const n of await ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", u)).order("desc").take(30)) if (!n.read) await ctx.db.patch(n._id, { read: true }); },
});
