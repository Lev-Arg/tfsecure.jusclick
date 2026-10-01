import { query } from "./_generated/server";
import { can, currentProfile } from "./lib";
export const overview = query({
  args: {},
  handler: async ctx => {
    if (!can(await currentProfile(ctx), "metrics.read")) return null;
    const now = Date.now(), day = now - 864e5;
    const pcs = await ctx.db.query("passcodes").order("desc").take(500);
    const gate = await ctx.db.query("gateEvents").order("desc").take(500);
    const aud = await ctx.db.query("audit").withIndex("by_time").order("desc").take(500);
    const byKind = { visitor: 0, contractor: 0, supplier: 0 };
    for (const p of pcs) if (p._creationTime > day) byKind[p.kind]++;
    return {
      issued24h: pcs.filter(p => p._creationTime > day).length,
      active: pcs.filter(p => !p.usedAt && !p.revokedAt && p.expiresAt > now).length,
      granted24h: gate.filter(g => g.at > day && g.result === "granted").length,
      rejected24h: gate.filter(g => g.at > day && g.result !== "granted").length,
      denied24h: aud.filter(a => a.at > day && !a.ok && a.action !== "gate.check").length,
      byKind,
    };
  },
});
