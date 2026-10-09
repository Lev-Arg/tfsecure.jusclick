import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { kind } from "./schema";
import { authorize, can, currentProfile, notifyRoles, notifyUser, sanitizeServerText, validateCsrfToken, writeAudit } from "./lib";
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
    phone: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    vehiclePlate: v.optional(v.string()),
    purpose: v.optional(v.string()),
    csrfToken: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.issue", a.visitorName);
    if (!me) return { ok: false as const, error: "Your role cannot issue passcodes" };
    if (a.csrfToken && !(await validateCsrfToken(ctx, a.csrfToken))) {
      return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
    }

    const name = sanitizeServerText(a.visitorName, 80);
    if (name.length < 2) return { ok: false as const, error: "Enter a valid visitor full name (at least 2 characters)" };
    const cleanCompany = sanitizeServerText(a.company, 80) || undefined;

    const s = (await ctx.db.query("settings").first()) ?? DEFAULTS;
    const rawHours = Number.isFinite(a.hours) ? Math.round(a.hours) : s.defaultHours;
    const hours = Math.min(Math.max(rawHours, 1), s.maxHours);

    // Server-enforced department binding (BOLA prevention: never trust client-supplied departmentId)
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

    const hostName = sanitizeServerText(me.name, 80);
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
        company: cleanCompany,
        phone: sanitizeServerText(a.phone, 32) || undefined,
        idNumber: sanitizeServerText(a.idNumber, 40) || undefined,
        vehiclePlate: sanitizeServerText(a.vehiclePlate, 24).toUpperCase() || undefined,
        purpose: sanitizeServerText(a.purpose, 120) || undefined,
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

export const inspect = mutation({
  args: { code: v.string() },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.validate", "gate check");
    if (!me) return { ok: false as const, error: "Your role cannot inspect passcodes" };

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
    else if (p.checkedOutAt) result = "already_checked_out";
    else if (p.usedAt || p.checkedInAt) result = "already_used";
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

    // Notice: inspecting code does NOT mark usedAt and does NOT send arrival notification to host.
    // The arrival notification is triggered only when check-in is actually completed.
    return {
      ok: true as const,
      result,
      passcode: p && result === "granted" ? {
        _id: p._id,
        visitorName: p.visitorName,
        kind: p.kind,
        company: p.company,
        hostName: p.hostName,
        hostDepartmentId: p.hostDepartmentId,
        issuedBy: p.issuedBy,
        expiresAt: p.expiresAt,
        phone: p.phone,
        idNumber: p.idNumber,
        vehiclePlate: p.vehiclePlate,
        purpose: p.purpose,
      } : undefined,
      visitor: result === "granted" ? p!.visitorName : undefined,
    };
  },
});

export const checkIn = mutation({
  args: {
    code: v.optional(v.string()),
    passcodeId: v.optional(v.id("passcodes")),
    badgeNumber: v.string(),
    idType: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    vehiclePlate: v.optional(v.string()),
    guardNotes: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.validate", "gate check-in");
    if (!me) return { ok: false as const, error: "Your role cannot check in visitors" };

    let p: any = null;
    if (a.passcodeId) {
      p = await ctx.db.get(a.passcodeId);
    } else if (a.code) {
      const hash = await sha256(a.code.trim());
      p = await ctx.db.query("passcodes").withIndex("by_hash", q => q.eq("codeHash", hash)).first();
    }

    if (!p) return { ok: false as const, error: "Passcode record not found" };
    if (p.revokedAt) return { ok: false as const, error: "Passcode has been revoked" };
    if (p.checkedOutAt) return { ok: false as const, error: "Passcode was already checked out" };
    if (p.usedAt || p.checkedInAt) return { ok: false as const, error: "Passcode was already checked in" };
    const now = Date.now();
    if (p.expiresAt < now) return { ok: false as const, error: "Passcode has expired" };

    const cleanBadge = sanitizeServerText(a.badgeNumber, 24).toUpperCase();
    if (!cleanBadge) return { ok: false as const, error: "Badge number is required" };
    const badgeHolder = await ctx.db
      .query("passcodes")
      .withIndex("by_badge_number", q => q.eq("badgeNumber", cleanBadge))
      .first();
    if (badgeHolder && badgeHolder._id !== p._id && !badgeHolder.checkedOutAt) {
      return { ok: false as const, error: `Badge ${cleanBadge} is already assigned to another visitor` };
    }

    await ctx.db.patch(p._id, {
      usedAt: now,
      checkedInAt: now,
      checkedInBy: me.name,
      badgeNumber: cleanBadge,
      idType: sanitizeServerText(a.idType, 40) || "Verified at Gate",
      idNumber: sanitizeServerText(a.idNumber, 40) || undefined,
      vehiclePlate: sanitizeServerText(a.vehiclePlate, 24).toUpperCase() || undefined,
      notes: sanitizeServerText(a.guardNotes, 160) || undefined,
    });

    await ctx.db.insert("gateEvents", { passcodeId: p._id, guardId: me.userId, result: "granted", at: now });
    await writeAudit(
      ctx,
      me,
      "gate.checkin",
      true,
      `Checked in: ${p.visitorName} (${p.kind}, badge: ${cleanBadge}, host: ${p.hostName ?? "Staff"})`
    );

    // NOTIFY THE HOST THAT GUEST HAS CHECKED IN!
    await notifyUser(
      ctx,
      p.issuedBy,
      "arrival",
      `${p.visitorName} (${p.kind}) has checked in at the gate (Badge: ${cleanBadge})`
    );

    return {
      ok: true as const,
      passcodeId: p._id,
      visitorName: p.visitorName,
    };
  },
});

export const checkOut = mutation({
  args: {
    passcodeId: v.id("passcodes"),
    checkoutNotes: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.validate", "gate checkout");
    if (!me) return { ok: false as const, error: "Your role cannot check out visitors" };

    const p = await ctx.db.get(a.passcodeId);
    if (!p) return { ok: false as const, error: "Passcode record not found" };
    if (!p.checkedInAt && !p.usedAt) return { ok: false as const, error: "Visitor has not been checked in" };
    if (p.checkedOutAt) return { ok: false as const, error: "Visitor was already checked out" };

    const now = Date.now();
    const cleanNotes = sanitizeServerText(a.checkoutNotes, 160) || "Checked out";

    await ctx.db.patch(a.passcodeId, {
      checkedOutAt: now,
      checkedOutBy: me.name,
      checkoutNotes: cleanNotes,
    });
    await ctx.db.insert("gateEvents", { passcodeId: p._id, guardId: me.userId, result: "checked_out", at: now });

    await writeAudit(
      ctx,
      me,
      "gate.checkout",
      true,
      `Checked out: ${p.visitorName} (${p.kind}) by ${me.name}`
    );

    // NOTIFY THE HOST THAT GUEST HAS CHECKED OUT!
    await notifyUser(
      ctx,
      p.issuedBy,
      "checkout",
      `${p.visitorName} (${p.kind}) has checked out and departed the facility.`
    );

    return { ok: true as const };
  },
});

export const reject = mutation({
  args: {
    passcodeId: v.id("passcodes"),
    reason: v.string(),
  },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.validate", "gate identity mismatch");
    if (!me) return { ok: false as const, error: "Your role cannot reject gate entry" };
    const passcode = await ctx.db.get(a.passcodeId);
    if (!passcode) return { ok: false as const, error: "Passcode record not found" };
    if (passcode.revokedAt) return { ok: false as const, error: "Passcode was already revoked" };
    if (passcode.usedAt || passcode.checkedInAt || passcode.checkedOutAt) {
      return { ok: false as const, error: "Passcode is no longer eligible for rejection" };
    }

    const now = Date.now();
    const reason = sanitizeServerText(a.reason, 160) || "Identity mismatch at gate";
    await ctx.db.patch(passcode._id, { revokedAt: now });
    await ctx.db.insert("gateEvents", {
      passcodeId: passcode._id,
      guardId: me.userId,
      result: "identity_mismatch",
      at: now,
    });
    await writeAudit(ctx, me, "gate.deny", false, `${passcode.visitorName}: ${reason}`);
    return { ok: true as const };
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
    else if (p.checkedOutAt) result = "already_checked_out";
    else if (p.usedAt || p.checkedInAt) result = "already_used";
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

    await ctx.db.insert("gateEvents", { passcodeId: p?._id, guardId: me.userId, result, at: now });
    await writeAudit(
      ctx,
      me,
      "gate.check",
      result === "granted",
      p ? `${result}: ${p.visitorName} (host: ${p.hostName ?? "Staff"})` : result
    );

    // Inspecting/verifying a passcode at the gate:
    // DOES NOT mark usedAt or checkedInAt and DOES NOT send arrival notification to host.
    // The arrival notification is triggered only when check-in is actually completed.
    return {
      ok: true as const,
      result,
      passcode: p && result === "granted" ? {
        _id: p._id,
        visitorName: p.visitorName,
        kind: p.kind,
        company: p.company,
        hostName: p.hostName,
        hostDepartmentId: p.hostDepartmentId,
        issuedBy: p.issuedBy,
        expiresAt: p.expiresAt,
      } : undefined,
      visitor: result === "granted" ? p!.visitorName : undefined,
    };
  },
});

export const revoke = mutation({
  args: {
    id: v.id("passcodes"),
    csrfToken: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await authorize(ctx, "passcode.revoke", "revoke");
    const p = await ctx.db.get(a.id);
    if (!me || !p) return { ok: false as const, error: me ? "Not found" : "Your role cannot revoke passcodes" };
    if (a.csrfToken && !(await validateCsrfToken(ctx, a.csrfToken))) {
      return { ok: false as const, error: "Invalid or expired CSRF token. Refresh and try again." };
    }

    // BOLA Prevention:
    // - "staff": can ONLY revoke passcodes they individually issued within their department
    // - "report" (Department Head): can ONLY revoke passcodes belonging to their bound department
    // - "admin" & "security": can revoke any active passcode
    if (me.role === "staff" && (p.issuedBy !== me.userId || (me.departmentId && p.hostDepartmentId && p.hostDepartmentId !== me.departmentId))) {
      await writeAudit(ctx, me, "passcode.revoke", false, `BOLA blocked: staff attempted to revoke ${p.visitorName}`);
      return { ok: false as const, error: "Access denied: you can only manage passcodes you individually issued" };
    }
    if (me.role === "report" && (!me.departmentId || p.hostDepartmentId !== me.departmentId)) {
      await writeAudit(ctx, me, "passcode.revoke", false, `BOLA blocked: dept head attempted cross-dept revoke on ${p.visitorName}`);
      return { ok: false as const, error: "Access denied: department heads can only manage their own department's passcodes" };
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
    const profiles = await ctx.db.query("profiles").take(200);
    const profileByUserId = new Map(profiles.map(pr => [pr.userId, pr]));

    // Hydrate hostName and hostDepartmentId first so BOLA filtering is exact
    const hydrated = all.map(({ codeHash: _h, ...rest }) => {
      const issuer = profileByUserId.get(rest.issuedBy);
      return {
        ...rest,
        hostName: rest.hostName ?? issuer?.name ?? "Staff",
        hostDepartmentId: rest.hostDepartmentId ?? issuer?.departmentId,
      };
    });

    // Strict Server-Side Object-Level Filtering (BOLA Prevention):
    // 1. Admin & Security: see all departments' passcodes
    if (can(me, "passcode.list.all")) {
      return hydrated;
    }
    // 2. Department Head ("report"): see ONLY passcodes belonging to their bound department
    if (can(me, "passcode.list.dept")) {
      if (!me!.departmentId) return [];
      return hydrated.filter(p => p.hostDepartmentId === me!.departmentId);
    }
    // 3. Staff ("staff"): see ONLY passcodes they individually issued within their bound department
    return hydrated.filter(
      p => p.issuedBy === me!.userId && (!me!.departmentId || !p.hostDepartmentId || p.hostDepartmentId === me!.departmentId)
    );
  },
});
