import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { kind } from "./schema";
import { authorize, can, currentProfile, notifyRoles, notifyUser, writeAudit } from "./lib";
import { DEFAULTS } from "./settings";

const LOCK_WINDOW = 10 * 60_000;
const LOCK_LIMIT = 15; // 15 unknown codes in 10 minutes locks the gate for everyone

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

export const issue = mutation({
  args: {
    visitorName: v.string(),
    kind,
    hours: v.number(),
    company: v.optional(v.string()),
    hostDepartmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.issue", a.visitorName);
    if (!me) return { ok: false as const, error: "Your role cannot issue passcodes" };

    const name = a.visitorName.trim().slice(0, 80);
    if (name.length < 2) return { ok: false as const, error: "Enter a valid visitor full name (at least 2 characters)" };

    const s = (await ctx.db.query("settings").first()) ?? DEFAULTS;
    const rawHours = Number.isFinite(a.hours) ? Math.round(a.hours) : s.defaultHours;
    const hours = Math.min(Math.max(rawHours, 1), s.maxHours);

    // Server-enforced department binding: never trust arbitrary client departmentId for non-admins.
    let resolvedDepartmentId = me.departmentId;
    if (resolvedDepartmentId) {
      const deptDoc = await ctx.db.get(resolvedDepartmentId);
      if (!deptDoc) resolvedDepartmentId = undefined;
    }
    if (!resolvedDepartmentId) {
      const fallbackDept = await ctx.db.query("departments").first();
      resolvedDepartmentId = fallbackDept?._id;
      if (resolvedDepartmentId) {
        await ctx.db.patch(me._id, { departmentId: resolvedDepartmentId });
      }
    }

    const hostName = me.name;
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      const code = String(100000 + (r[0] % 900000));
      const codeHash = await sha256(code);
      if (await ctx.db.query("passcodes").withIndex("by_hash", q => q.eq("codeHash", codeHash)).first()) continue;
      await ctx.db.insert("passcodes", {
        codeHash,
        visitorName: name,
        kind: a.kind,
        company: a.company?.trim().slice(0, 80) || undefined,
        hostDepartmentId: resolvedDepartmentId,
        hostName,
        issuedBy: me.userId,
        expiresAt: now + hours * 3600_000,
      });
      await writeAudit(ctx, me, "passcode.issue", true, `${a.kind}: ${name} (host: ${hostName}), ${hours}h`);
      return { ok: true as const, code }; // plaintext shown once; only the hash is stored
    }
    return { ok: false as const, error: "Could not generate a unique code, try again" };
  },
});

export const validate = mutation({
  args: { code: v.string() },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.validate", "gate check");
    if (!me) return { ok: false as const, error: "Your role cannot validate passcodes" };

    const cleanCode = a.code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return { ok: false as const, error: "Passcode must be a 6-digit number" };
    }

    const now = Date.now();
    const recent = await ctx.db
      .query("failures")
      .withIndex("by_at", q => q.gt("at", now - LOCK_WINDOW))
      .take(LOCK_LIMIT + 1);
    if (recent.length >= LOCK_LIMIT) {
      await writeAudit(ctx, me, "gate.check", false, "locked out");
      return { ok: true as const, result: "locked" };
    }

    const hash = await sha256(cleanCode);
    const p = await ctx.db.query("passcodes").withIndex("by_hash", q => q.eq("codeHash", hash)).first();
    let result = "granted";
    if (!p) result = "unknown";
    else if (p.revokedAt) result = "revoked";
    else if (p.usedAt) result = "already_used";
    else if (p.expiresAt < now) result = "expired";

    if (result === "unknown") {
      await ctx.db.insert("failures", { at: now });
      if (recent.length + 1 === LOCK_LIMIT) {
        await notifyRoles(
          ctx,
          ["admin", "security"],
          "security",
          `Gate locked for 10 minutes after ${LOCK_LIMIT} unknown passcodes`
        );
      }
    }

    if (p && result === "granted") {
      await ctx.db.patch(p._id, { usedAt: now });
      await notifyUser(ctx, p.issuedBy, "arrival", `${p.visitorName} (${p.kind}) has arrived at the gate`);
    }

    await ctx.db.insert("gateEvents", { passcodeId: p?._id, guardId: me.userId, result, at: now });
    await writeAudit(
      ctx,
      me,
      "gate.check",
      result === "granted",
      p ? `${result}: ${p.visitorName} (host: ${p.hostName ?? "Staff"})` : result
    );
    return {
      ok: true as const,
      result,
      visitor: result === "granted" ? p!.visitorName : undefined,
    };
  },
});

export const revoke = mutation({
  args: { id: v.id("passcodes") },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.revoke", "revoke");
    const p = await ctx.db.get(a.id);
    if (!me || !p) return { ok: false as const, error: me ? "Not found" : "Your role cannot revoke passcodes" };
    // Staff can only revoke passcodes they issued themselves; Admin and Security can revoke any active passcode
    if (me.role === "staff" && p.issuedBy !== me.userId) {
      await writeAudit(ctx, me, "passcode.revoke", false, `unauthorized revoke attempt on ${p.visitorName}`);
      return { ok: false as const, error: "Staff can only revoke passcodes they issued" };
    }
    if (p.usedAt || p.revokedAt) return { ok: false as const, error: "Already used or revoked" };
    await ctx.db.patch(a.id, { revokedAt: Date.now() });
    await writeAudit(ctx, me, "passcode.revoke", true, `${p.visitorName} (host: ${p.hostName ?? me.name})`);
    return { ok: true as const };
  },
});

export const list = query({
  args: {},
  handler: async ctx => {
    const me = await currentProfile(ctx);
    if (!can(me, "passcode.read")) return [];
    const all = await ctx.db.query("passcodes").order("desc").take(100);
    const rows = can(me, "passcode.list.all") ? all : all.filter(p => p.issuedBy === me!.userId);
    const profiles = await ctx.db.query("profiles").take(200);
    const profileByUserId = new Map(profiles.map(pr => [pr.userId, pr]));
    return rows.map(({ codeHash: _h, ...rest }) => {
      const issuer = profileByUserId.get(rest.issuedBy);
      return {
        ...rest,
        hostName: rest.hostName ?? issuer?.name ?? "Staff",
        hostDepartmentId: rest.hostDepartmentId ?? issuer?.departmentId,
      };
    }); // hashes never reach the browser
  },
});
