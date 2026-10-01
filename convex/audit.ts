import { query } from "./_generated/server";
import { can, currentProfile } from "./lib";
export const recent = query({ args: {}, handler: async ctx => (can(await currentProfile(ctx), "audit.read") ? ctx.db.query("audit").withIndex("by_time").order("desc").take(200) : []) });
