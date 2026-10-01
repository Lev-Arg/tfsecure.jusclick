import { query } from "./_generated/server";
import { can, currentProfile } from "./lib";

export const overview = query({
  args: {},
  handler: async ctx => {
    const me = await currentProfile(ctx);
    if (!can(me, "metrics.read") || !me) return null;
    const now = Date.now();
    const day = now - 864e5;
    const allPcs = await ctx.db.query("passcodes").order("desc").take(500);
    const allGate = await ctx.db.query("gateEvents").order("desc").take(500);

    // Department Head ("report") only sees metrics for their own bound department
    const isAllDepts = can(me, "passcode.list.all");
    const pcs = isAllDepts
      ? allPcs
      : me.departmentId
      ? allPcs.filter(p => p.hostDepartmentId === me.departmentId)
      : [];

    const allowedPasscodeIds = new Set(pcs.map(p => String(p._id)));
    const gate = isAllDepts
      ? allGate
      : allGate.filter(g => g.passcodeId && allowedPasscodeIds.has(String(g.passcodeId)));

    // System audit logs are restricted strictly to Admin
    const aud = can(me, "audit.read")
      ? await ctx.db.query("audit").withIndex("by_time").order("desc").take(500)
      : [];

    const byKind = { visitor: 0, contractor: 0, supplier: 0 };
    for (const p of pcs) {
      if (p._creationTime > day) byKind[p.kind]++;
    }

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
