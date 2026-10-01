import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authorize, writeAudit } from "./lib";

export const DEFAULTS = { orgName: "TF Commodities", accent: "#e0a100", defaultHours: 4, maxHours: 72 };

export const get = query({
  args: {},
  handler: async ctx => {
    const s = await ctx.db.query("settings").first();
    return s
      ? { orgName: s.orgName, accent: s.accent, defaultHours: s.defaultHours, maxHours: s.maxHours }
      : DEFAULTS;
  },
});

export const update = mutation({
  args: { orgName: v.string(), accent: v.string(), defaultHours: v.number(), maxHours: v.number() },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "settings.update", "branding");
    if (!me) return { ok: false as const, error: "Not permitted" };
    if (!/^#[0-9a-fA-F]{6}$/.test(a.accent)) {
      return { ok: false as const, error: "Accent must be a hex colour like #e0a100" };
    }
    const rawMax = Number.isFinite(a.maxHours) ? Math.round(a.maxHours) : DEFAULTS.maxHours;
    const maxHours = Math.min(Math.max(rawMax, 1), 168);
    const rawDefault = Number.isFinite(a.defaultHours) ? Math.round(a.defaultHours) : DEFAULTS.defaultHours;
    const defaultHours = Math.min(Math.max(rawDefault, 1), maxHours);
    const doc = {
      orgName: a.orgName.trim().slice(0, 60) || DEFAULTS.orgName,
      accent: a.accent,
      maxHours,
      defaultHours,
    };
    const s = await ctx.db.query("settings").first();
    if (s) await ctx.db.patch(s._id, doc);
    else await ctx.db.insert("settings", doc);
    await writeAudit(ctx, me, "settings.update", true, `${doc.orgName} (default ${defaultHours}h, max ${maxHours}h)`);
    return { ok: true as const };
  },
});
