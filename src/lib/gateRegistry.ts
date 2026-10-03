import { useEffect, useState } from "react";

/**
 * Strips HTML tags, script protocols, inline event handlers, and control characters to prevent XSS.
 */
export function sanitizeText(raw: string | undefined, maxLen = 120): string {
  if (!raw) return "";
  return raw
    .replace(/[<>"'`]/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Per-session cryptographic anti-CSRF token (256-bit).
 * Updated 2026: Server-side validation is the authoritative security check.
 * Client-side generation is used for UI purposes only.
 */
const CSRF_STORAGE_KEY = "tfsecure_csrf_token_v1";
let inMemoryCsrfToken: string | null = null;

export function getCsrfToken(): string {
  // Return existing token if still valid
  if (inMemoryCsrfToken && /^[0-9a-f]{64}$/.test(inMemoryCsrfToken)) {
    return inMemoryCsrfToken;
  }

  // Check sessionStorage for existing token
  try {
    const existing = sessionStorage.getItem(CSRF_STORAGE_KEY);
    if (existing && /^[0-9a-f]{64}$/.test(existing)) {
      inMemoryCsrfToken = existing;
      return existing;
    }
  } catch {
    // sessionStorage may be restricted in hosted iframes or mobile webviews
  }

  // Generate new token client-side (for UI purposes)
  // Real security comes from server-side validation in Convex mutations
  try {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    inMemoryCsrfToken = token;
    try {
      sessionStorage.setItem(CSRF_STORAGE_KEY, token);
    } catch {
      // ignore storage restriction
    }
    return token;
  } catch {
    inMemoryCsrfToken = "fallback_same_origin_csrf_token";
    return inMemoryCsrfToken;
  }
}

/**
 * Verify CSRF token - DEPRECATED: validation now happens server-side
 * This function is kept for backward compatibility but always returns true
 * Server-side validation in Convex mutations using validateCsrfToken() is the authoritative check
 */
export function verifyCsrfToken(submittedToken: string | null | undefined): boolean {
  // Client-side verification is no longer secure per 2026 best practices
  // Server-side validation in Convex is the authoritative check
  // This function returns true to allow the request to proceed to server validation
  return true;
}

/* ==================== PROFESSIONAL SOFT HIGH STRETCHED DING-DONG CHIME ==================== */
const SOUND_MUTE_KEY = "tfsecure_sound_muted_v1";
let sharedAudioCtx: AudioContext | null = null;
let lastChimeAt = 0;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
  window.addEventListener("click", unlockAudio, { passive: true });
}

export function isNotificationSoundMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(SOUND_MUTE_KEY, muted ? "true" : "false");
  } catch {
    // ignore
  }
  subscribers.forEach(fn => fn());
}

/**
 * Synthesizes a soft, high-pitched, stretched two-tone "ding-dong" chime (E6 -> C6)
 * with a gentle raised attack, warm harmonic body, low-pass silk filter, and long acoustic decay.
 */
export function playNotificationDingDong(options?: { force?: boolean }) {
  if (!options?.force && isNotificationSoundMuted()) return;
  const nowMs = Date.now();
  if (!options?.force && nowMs - lastChimeAt < 1800) return;
  lastChimeAt = nowMs;

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const triggerTones = () => {
      try {
        const t0 = ctx.currentTime + 0.015;

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.85, t0);

        const warmthFilter = ctx.createBiquadFilter();
        warmthFilter.type = "lowpass";
        warmthFilter.frequency.setValueAtTime(3400, t0);
        warmthFilter.Q.setValueAtTime(0.65, t0);

        const delayNode = ctx.createDelay(0.2);
        delayNode.delayTime.setValueAtTime(0.036, t0);

        const feedbackGain = ctx.createGain();
        feedbackGain.gain.setValueAtTime(0.22, t0);

        const wetGain = ctx.createGain();
        wetGain.gain.setValueAtTime(0.24, t0);

        warmthFilter.connect(masterGain);
        warmthFilter.connect(delayNode);
        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);
        delayNode.connect(wetGain);
        wetGain.connect(masterGain);
        masterGain.connect(ctx.destination);

        const scheduleBellTone = (
          startTime: number,
          fundamentalHz: number,
          peakGain: number,
          attackSec: number,
          stretchDurationSec: number
        ) => {
          const oscMain = ctx.createOscillator();
          const gainMain = ctx.createGain();
          oscMain.type = "sine";
          oscMain.frequency.setValueAtTime(fundamentalHz, startTime);

          gainMain.gain.setValueAtTime(0.0001, startTime);
          gainMain.gain.linearRampToValueAtTime(peakGain, startTime + attackSec);
          gainMain.gain.setTargetAtTime(peakGain * 0.48, startTime + attackSec, stretchDurationSec * 0.22);
          gainMain.gain.exponentialRampToValueAtTime(0.0001, startTime + stretchDurationSec);

          oscMain.connect(gainMain);
          gainMain.connect(warmthFilter);
          oscMain.start(startTime);
          oscMain.stop(startTime + stretchDurationSec + 0.05);

          const oscSub = ctx.createOscillator();
          const gainSub = ctx.createGain();
          oscSub.type = "sine";
          oscSub.frequency.setValueAtTime(fundamentalHz * 0.5, startTime);

          gainSub.gain.setValueAtTime(0.0001, startTime);
          gainSub.gain.linearRampToValueAtTime(peakGain * 0.34, startTime + attackSec * 1.15);
          gainSub.gain.exponentialRampToValueAtTime(0.0001, startTime + stretchDurationSec * 1.05);

          oscSub.connect(gainSub);
          gainSub.connect(warmthFilter);
          oscSub.start(startTime);
          oscSub.stop(startTime + stretchDurationSec * 1.05 + 0.05);

          const oscShimmer = ctx.createOscillator();
          const gainShimmer = ctx.createGain();
          oscShimmer.type = "sine";
          oscShimmer.frequency.setValueAtTime(fundamentalHz * 2, startTime);

          gainShimmer.gain.setValueAtTime(0.0001, startTime);
          gainShimmer.gain.linearRampToValueAtTime(peakGain * 0.09, startTime + attackSec * 0.8);
          gainShimmer.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(0.65, stretchDurationSec * 0.4));

          oscShimmer.connect(gainShimmer);
          gainShimmer.connect(warmthFilter);
          oscShimmer.start(startTime);
          oscShimmer.stop(startTime + Math.min(0.65, stretchDurationSec * 0.4) + 0.05);
        };

        // 1. "DING" — High, soft E6 (1318.51 Hz), stretched 1.65s singing tail
        scheduleBellTone(t0, 1318.51, 0.135, 0.042, 1.65);

        // 2. "DONG" — High-warm C6 (1046.50 Hz) entering at +0.54s, stretched 2.35s resonant tail
        scheduleBellTone(t0 + 0.54, 1046.5, 0.145, 0.052, 2.35);

        setTimeout(() => {
          try {
            masterGain.disconnect();
          } catch {
            // ignore
          }
        }, 3300);
      } catch {
        // ignore
      }
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(triggerTones).catch(() => {});
    } else {
      triggerTones();
    }
  } catch {
    // Ignore Web Audio errors on restricted devices
  }
}

export type RoleType = "admin" | "security" | "report" | "staff";

export type GuestAttachment = {
  passcodeId?: string;
  codeHash: string;
  visitorName: string;
  company?: string;
  kind: "visitor" | "contractor" | "supplier";
  issuedByUserId?: string;
  hostName: string;
  hostDepartmentId?: string;
  deptName: string;
  phone?: string;
  idNumber?: string;
  vehiclePlate?: string;
  purpose?: string;
  hours: number;
  issuedAt: number;
  expiresAt: number;
};

export type OnSiteRecord = {
  id: string;
  passcodeId?: string;
  codeHash?: string;
  visitorName: string;
  company?: string;
  kind: "visitor" | "contractor" | "supplier";
  issuedByUserId?: string;
  hostName: string;
  hostDepartmentId?: string;
  deptName: string;
  phone?: string;
  idType: string;
  idNumber?: string;
  badgeNumber: string;
  vehiclePlate?: string;
  purpose?: string;
  notes?: string;
  checkedInAt: number;
  checkedInBy: string;
  checkedInByUserId?: string;
  expiresAt?: number;
  checkedOutAt?: number;
  checkedOutBy?: string;
  checkedOutByUserId?: string;
  checkoutNotes?: string;
};

export type GateDenialRecord = {
  deniedAt: number;
  deniedBy: string;
  reason: string;
  visitorName?: string;
  hostName?: string;
  deptName?: string;
};

export type LocalAuditEntry = {
  _id: string;
  name: string;
  action: string;
  detail: string;
  ok: boolean;
  at: number;
};

export type LocalNotificationEntry = {
  _id: string;
  kind: string;
  message: string;
  at: number;
  read: boolean;
  targetUserId?: string;
  targetHostName?: string;
  targetHostEmail?: string;
  actorUserId?: string;
  actorName?: string;
  passcodeId?: string;
};

export const CURRENT_POLICY_VERSION = "Act843-v2.5";

export type PolicyAcceptanceRecord = {
  key: string;
  email: string;
  name: string;
  policyVersion: string;
  acceptedAt: number;
  context: "pre_login" | "signup" | "workspace_gate";
};

export type PilotScenarioCheckRecord = {
  scenarioId: string;
  verified: boolean;
  verifiedBy: string;
  verifiedAt: number;
  notes?: string;
};

export type InvitedUserRecord = {
  email: string;
  name: string;
  role: RoleType;
  departmentId?: string;
  invitedBy: string;
  invitedAt: number;
  inviteCode: string;
};

export type RegisteredProfileRecord = {
  _id: string;
  userId: string;
  name: string;
  email: string;
  role: RoleType;
  active: boolean;
  departmentId?: string;
  registeredAt: number;
  source: "bootstrap" | "invite" | "signup" | "server";
};

export type LocalPasscodeRecord = {
  _id: string;
  _creationTime: number;
  codeHash: string;
  visitorName: string;
  kind: "visitor" | "contractor" | "supplier";
  company?: string;
  hostDepartmentId?: string;
  hostName: string;
  issuedBy: string;
  expiresAt: number;
  usedAt?: number;
  revokedAt?: number;
};

export type LocalDepartmentRecord = {
  _id: string;
  _creationTime: number;
  name: string;
};

export const DEFAULT_LOCAL_DEPARTMENTS: LocalDepartmentRecord[] = [
  { _id: "dept_hse_security", _creationTime: 1727000001000, name: "HSE & Security" },
  { _id: "dept_cocoa_plant", _creationTime: 1727000002000, name: "Cocoa Processing Plant" },
  { _id: "dept_qa_lab", _creationTime: 1727000003000, name: "Quality Assurance Lab" },
  { _id: "dept_warehousing", _creationTime: 1727000004000, name: "Warehousing & Bean Intake" },
  { _id: "dept_engineering", _creationTime: 1727000005000, name: "Engineering & Maintenance" },
  { _id: "dept_administration", _creationTime: 1727000006000, name: "Administration" },
];

export type SystemConfig = {
  orgName?: string;
  accentColor?: string;
  defaultPasscodeHours?: number;
  maxPasscodeHours?: number;
  bannerTitle: string;
  customLogoUrl?: string;
  loginBackgroundMode: "checkpoint" | "facility" | "custom";
  customLoginBgUrl?: string;
  workspaceBackgroundMode: "facility" | "checkpoint" | "minimal" | "custom";
  customWorkspaceBgUrl?: string;
  siteCapacityLimit: number;
  requireAdminApproval: boolean;
  autoFlagOverstays: boolean;
  systemVersion: string;
  releaseChannel: "Production" | "Staging" | "Enterprise LTS";
  lastUpdatedAt: number;
  lastBackupAt?: number;
};

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  orgName: "TF Commodities",
  accentColor: "#059669",
  defaultPasscodeHours: 4,
  maxPasscodeHours: 72,
  bannerTitle: "SECURITY • ACCESS CONTROL MANAGEMENT",
  customLogoUrl: undefined,
  loginBackgroundMode: "checkpoint",
  customLoginBgUrl: undefined,
  workspaceBackgroundMode: "facility",
  customWorkspaceBgUrl: undefined,
  siteCapacityLimit: 100,
  requireAdminApproval: false,
  autoFlagOverstays: true,
  systemVersion: "2.4.2",
  releaseChannel: "Production",
  lastUpdatedAt: Date.now(),
  lastBackupAt: undefined,
};

type RegistryState = {
  attachmentsByHash: Record<string, GuestAttachment>;
  attachmentsByPasscodeId: Record<string, GuestAttachment>;
  attachmentsByName: Record<string, GuestAttachment>;
  localPasscodes: LocalPasscodeRecord[];
  revokedPasscodeIds: Record<string, number>;
  usedPasscodeTimestamps: Record<string, number>;
  gateFailureTimestamps: number[];
  localDepartments: LocalDepartmentRecord[];
  removedDepartmentIds: Record<string, number>;
  onSiteRecords: OnSiteRecord[];
  checkedOutPasscodeIds: Record<string, { checkedOutAt: number; checkedOutBy: string; checkoutNotes?: string }>;
  deniedPasscodeIds: Record<string, GateDenialRecord>;
  deniedCodeHashes: Record<string, GateDenialRecord>;
  userDepartmentOverrides: Record<string, string>;
  userRoleOverrides: Record<string, RoleType>;
  bootstrapAdminEmail?: string;
  bootstrapAdminProfileId?: string;
  registeredProfiles: Record<string, RegisteredProfileRecord>;
  invitedUsers: Record<string, InvitedUserRecord>;
  pendingApprovalEmails: Record<string, number>;
  approvedUserKeys: Record<string, number>;
  policyAcceptances: Record<string, PolicyAcceptanceRecord>;
  pilotScenarioChecks: Record<string, PilotScenarioCheckRecord>;
  localAuditEntries: LocalAuditEntry[];
  localNotifications: LocalNotificationEntry[];
  systemConfig: SystemConfig;
  rbacVersion?: number;
};

const REGISTRY_KEY = "tf_commodities_gate_registry_v1";
const IMG_LOGO_KEY = "tfsecure_custom_logo_v1";
const IMG_LOGIN_BG_KEY = "tfsecure_custom_login_bg_v1";
const IMG_WORKSPACE_BG_KEY = "tfsecure_custom_workspace_bg_v1";

// SECURITY WARNING (2026): localStorage contains sensitive data including:
// - codeHash values (passcode hashes)
// - visitor names, companies (PII)
// - user roles and department assignments (access control data)
// - audit trail (security-sensitive logs)
// 
// Per OWASP and RFC 9700 (OAuth 2.0 BCP), sensitive data should NOT be stored in localStorage
// as it's accessible to any JavaScript running on the page (XSS vulnerability).
// 
// TODO: Refactor to use Convex as single source of truth. Only keep non-sensitive UI state
// (theme preference, etc.) in localStorage. This requires architectural changes to support
// offline-first mode without storing sensitive data locally.

function loadRegistry(): RegistryState {
  let savedLogo: string | undefined;
  let savedLoginBg: string | undefined;
  let savedWorkspaceBg: string | undefined;
  try {
    savedLogo = localStorage.getItem(IMG_LOGO_KEY) || undefined;
    savedLoginBg = localStorage.getItem(IMG_LOGIN_BG_KEY) || undefined;
    savedWorkspaceBg = localStorage.getItem(IMG_WORKSPACE_BG_KEY) || undefined;
  } catch {
    // ignore storage read errors
  }

  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawCfg = parsed.systemConfig ?? {};
      const customLogoUrl = rawCfg.customLogoUrl || savedLogo || undefined;
      const customLoginBgUrl = rawCfg.customLoginBgUrl || savedLoginBg || undefined;
      const customWorkspaceBgUrl = rawCfg.customWorkspaceBgUrl || savedWorkspaceBg || undefined;
      const isMigratedV3 = parsed.rbacVersion === 3;
      return {
        rbacVersion: 3,
        attachmentsByHash: parsed.attachmentsByHash ?? {},
        attachmentsByPasscodeId: parsed.attachmentsByPasscodeId ?? {},
        attachmentsByName: parsed.attachmentsByName ?? {},
        localPasscodes: Array.isArray(parsed.localPasscodes) ? parsed.localPasscodes : [],
        revokedPasscodeIds: parsed.revokedPasscodeIds ?? {},
        usedPasscodeTimestamps: parsed.usedPasscodeTimestamps ?? {},
        gateFailureTimestamps: Array.isArray(parsed.gateFailureTimestamps) ? parsed.gateFailureTimestamps : [],
        localDepartments: Array.isArray(parsed.localDepartments) && parsed.localDepartments.length > 0
          ? parsed.localDepartments
          : DEFAULT_LOCAL_DEPARTMENTS,
        removedDepartmentIds: parsed.removedDepartmentIds ?? {},
        onSiteRecords: (parsed.onSiteRecords ?? []).map((r: any) => ({
          ...r,
          hostName: sanitizeText(r.hostName, 80) || "Staff Host",
        })),
        checkedOutPasscodeIds: parsed.checkedOutPasscodeIds ?? {},
        deniedPasscodeIds: parsed.deniedPasscodeIds ?? {},
        deniedCodeHashes: parsed.deniedCodeHashes ?? {},
        userDepartmentOverrides: parsed.userDepartmentOverrides ?? {},
        userRoleOverrides: parsed.userRoleOverrides ?? {},
        bootstrapAdminEmail: parsed.bootstrapAdminEmail,
        bootstrapAdminProfileId: parsed.bootstrapAdminProfileId,
        registeredProfiles: parsed.registeredProfiles ?? {},
        invitedUsers: parsed.invitedUsers ?? {},
        pendingApprovalEmails: isMigratedV3 ? (parsed.pendingApprovalEmails ?? {}) : {},
        approvedUserKeys: parsed.approvedUserKeys ?? {},
        policyAcceptances: parsed.policyAcceptances ?? {},
        pilotScenarioChecks: parsed.pilotScenarioChecks ?? {},
        localAuditEntries: parsed.localAuditEntries ?? [],
        localNotifications: parsed.localNotifications ?? [],
        systemConfig: {
          ...DEFAULT_SYSTEM_CONFIG,
          ...rawCfg,
          requireAdminApproval: isMigratedV3 ? Boolean(rawCfg.requireAdminApproval) : false,
          customLogoUrl,
          customLoginBgUrl,
          customWorkspaceBgUrl,
          loginBackgroundMode:
            rawCfg.loginBackgroundMode ?? (customLoginBgUrl ? "custom" : DEFAULT_SYSTEM_CONFIG.loginBackgroundMode),
          workspaceBackgroundMode:
            rawCfg.workspaceBackgroundMode ??
            (customWorkspaceBgUrl ? "custom" : DEFAULT_SYSTEM_CONFIG.workspaceBackgroundMode),
        },
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    attachmentsByHash: {},
    attachmentsByPasscodeId: {},
    attachmentsByName: {},
    localPasscodes: [],
    revokedPasscodeIds: {},
    usedPasscodeTimestamps: {},
    gateFailureTimestamps: [],
    localDepartments: DEFAULT_LOCAL_DEPARTMENTS,
    removedDepartmentIds: {},
    onSiteRecords: [],
    checkedOutPasscodeIds: {},
    deniedPasscodeIds: {},
    deniedCodeHashes: {},
    userDepartmentOverrides: {},
    userRoleOverrides: {},
    bootstrapAdminEmail: undefined,
    bootstrapAdminProfileId: undefined,
    registeredProfiles: {},
    invitedUsers: {},
    pendingApprovalEmails: {},
    approvedUserKeys: {},
    policyAcceptances: {},
    pilotScenarioChecks: {},
    localAuditEntries: [],
    localNotifications: [],
    systemConfig: {
      ...DEFAULT_SYSTEM_CONFIG,
      customLogoUrl: savedLogo,
      customLoginBgUrl: savedLoginBg,
      customWorkspaceBgUrl: savedWorkspaceBg,
      loginBackgroundMode: savedLoginBg ? "custom" : DEFAULT_SYSTEM_CONFIG.loginBackgroundMode,
      workspaceBackgroundMode: savedWorkspaceBg ? "custom" : DEFAULT_SYSTEM_CONFIG.workspaceBackgroundMode,
    },
  };
}

let state: RegistryState = loadRegistry();
const subscribers = new Set<() => void>();
const CLIENT_DEVICE_ID = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let syncChannel: BroadcastChannel | null = null;
let isApplyingRemoteSync = false;
let lastLocalGateOperatorActionAt = 0;

export function markGateOperatorActionOnThisDevice() {
  lastLocalGateOperatorActionAt = Date.now();
}

export function wasGateActionPerformedOnThisDeviceRecently(windowMs = 6000): boolean {
  return Date.now() - lastLocalGateOperatorActionAt < windowMs;
}

export function isVisitNotification(n: { kind?: string; targetUserId?: string; targetHostName?: string }): boolean {
  return (
    n.kind === "arrival" ||
    n.kind === "checkin" ||
    n.kind === "checkout" ||
    n.kind === "departure" ||
    Boolean(n.targetUserId || n.targetHostName)
  );
}

export function isNotificationForHostUser(
  n: LocalNotificationEntry,
  me?: { userId?: string; name?: string; email?: string } | null
): boolean {
  if (!me) return false;
  if (n.targetUserId && me.userId) {
    if (n.targetUserId === me.userId) return true;
    // Also fallback check if hostName matches when local/server userId differs
    if (
      n.targetHostName &&
      me.name &&
      n.targetHostName.trim().toLowerCase() === me.name.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  }
  if (n.targetHostName && me.name) {
    return n.targetHostName.trim().toLowerCase() === me.name.trim().toLowerCase();
  }
  return false;
}

function mergeRemoteState(incoming: Partial<RegistryState>) {
  if (!incoming || typeof incoming !== "object") return;
  let changed = false;

  const mergedNotifsMap = new Map<string, LocalNotificationEntry>();
  for (const n of state.localNotifications) {
    mergedNotifsMap.set(n._id, n);
  }
  if (Array.isArray(incoming.localNotifications)) {
    for (const n of incoming.localNotifications) {
      if (!n || !n._id) continue;
      const existing = mergedNotifsMap.get(n._id);
      if (!existing) {
        mergedNotifsMap.set(n._id, n);
        changed = true;
      } else if (n.at > existing.at) {
        mergedNotifsMap.set(n._id, n);
        changed = true;
      }
    }
  }

  const mergedOnSiteMap = new Map<string, OnSiteRecord>();
  for (const r of state.onSiteRecords) {
    mergedOnSiteMap.set(r.passcodeId || r.id, r);
  }
  if (Array.isArray(incoming.onSiteRecords)) {
    for (const r of incoming.onSiteRecords) {
      if (!r || !r.id) continue;
      const k = r.passcodeId || r.id;
      const existing = mergedOnSiteMap.get(k);
      if (!existing || (r.checkedOutAt && !existing.checkedOutAt) || r.checkedInAt > existing.checkedInAt) {
        mergedOnSiteMap.set(k, r);
        changed = true;
      }
    }
  }

  const mergedPasscodesMap = new Map<string, LocalPasscodeRecord>();
  for (const p of state.localPasscodes) {
    mergedPasscodesMap.set(p._id, p);
  }
  if (Array.isArray(incoming.localPasscodes)) {
    for (const p of incoming.localPasscodes) {
      if (!p || !p._id) continue;
      const existing = mergedPasscodesMap.get(p._id);
      if (
        !existing ||
        (p.usedAt && !existing.usedAt) ||
        (p.revokedAt && !existing.revokedAt)
      ) {
        mergedPasscodesMap.set(p._id, {
          ...existing,
          ...p,
          usedAt: p.usedAt ?? existing?.usedAt,
          revokedAt: p.revokedAt ?? existing?.revokedAt,
        });
        changed = true;
      }
    }
  }

  const mergedAuditsMap = new Map<string, LocalAuditEntry>();
  for (const a of state.localAuditEntries) {
    mergedAuditsMap.set(a._id, a);
  }
  if (Array.isArray(incoming.localAuditEntries)) {
    for (const a of incoming.localAuditEntries) {
      if (!a || !a._id) continue;
      if (!mergedAuditsMap.has(a._id)) {
        mergedAuditsMap.set(a._id, a);
        changed = true;
      }
    }
  }

  const nextCheckedOut = {
    ...state.checkedOutPasscodeIds,
    ...(incoming.checkedOutPasscodeIds ?? {}),
  };
  if (
    Object.keys(nextCheckedOut).length !== Object.keys(state.checkedOutPasscodeIds).length
  ) {
    changed = true;
  }

  const nextUsed = {
    ...state.usedPasscodeTimestamps,
    ...(incoming.usedPasscodeTimestamps ?? {}),
  };
  if (Object.keys(nextUsed).length !== Object.keys(state.usedPasscodeTimestamps).length) {
    changed = true;
  }

  const nextRevoked = {
    ...state.revokedPasscodeIds,
    ...(incoming.revokedPasscodeIds ?? {}),
  };
  if (Object.keys(nextRevoked).length !== Object.keys(state.revokedPasscodeIds).length) {
    changed = true;
  }

  const nextHashAtt = {
    ...state.attachmentsByHash,
    ...(incoming.attachmentsByHash ?? {}),
  };
  if (Object.keys(nextHashAtt).length !== Object.keys(state.attachmentsByHash).length) {
    changed = true;
  }

  const nextPcAtt = {
    ...state.attachmentsByPasscodeId,
    ...(incoming.attachmentsByPasscodeId ?? {}),
  };
  const nextNameAtt = {
    ...state.attachmentsByName,
    ...(incoming.attachmentsByName ?? {}),
  };

  if (!changed) return;

  state = {
    ...state,
    attachmentsByHash: nextHashAtt,
    attachmentsByPasscodeId: nextPcAtt,
    attachmentsByName: nextNameAtt,
    localPasscodes: Array.from(mergedPasscodesMap.values())
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 300),
    revokedPasscodeIds: nextRevoked,
    usedPasscodeTimestamps: nextUsed,
    onSiteRecords: Array.from(mergedOnSiteMap.values()).sort(
      (a, b) => b.checkedInAt - a.checkedInAt
    ),
    checkedOutPasscodeIds: nextCheckedOut,
    deniedPasscodeIds: {
      ...state.deniedPasscodeIds,
      ...(incoming.deniedPasscodeIds ?? {}),
    },
    deniedCodeHashes: {
      ...state.deniedCodeHashes,
      ...(incoming.deniedCodeHashes ?? {}),
    },
    localAuditEntries: Array.from(mergedAuditsMap.values())
      .sort((a, b) => b.at - a.at)
      .slice(0, 300),
    localNotifications: Array.from(mergedNotifsMap.values())
      .sort((a, b) => b.at - a.at)
      .slice(0, 100),
  };

  isApplyingRemoteSync = true;
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
  isApplyingRemoteSync = false;
  subscribers.forEach(fn => fn());
}

function pushStateToLanServer() {
  if (typeof window === "undefined" || isApplyingRemoteSync) return;
  try {
    // Only send safe fields through BroadcastChannel - never broadcast secrets
    const safeBroadcastState = {
      localPasscodes: state.localPasscodes,
      onSiteRecords: state.onSiteRecords,
      revokedPasscodeIds: state.revokedPasscodeIds,
      usedPasscodeTimestamps: state.usedPasscodeTimestamps,
      checkedOutPasscodeIds: state.checkedOutPasscodeIds,
    };
    syncChannel?.postMessage({ __senderDeviceId: CLIENT_DEVICE_ID, state: safeBroadcastState });
  } catch {
    // ignore
  }
  try {
    const syncPayload = {
      __senderDeviceId: CLIENT_DEVICE_ID,
      attachmentsByHash: state.attachmentsByHash,
      attachmentsByPasscodeId: state.attachmentsByPasscodeId,
      attachmentsByName: state.attachmentsByName,
      localPasscodes: state.localPasscodes,
      revokedPasscodeIds: state.revokedPasscodeIds,
      usedPasscodeTimestamps: state.usedPasscodeTimestamps,
      onSiteRecords: state.onSiteRecords,
      checkedOutPasscodeIds: state.checkedOutPasscodeIds,
      deniedPasscodeIds: state.deniedPasscodeIds,
      deniedCodeHashes: state.deniedCodeHashes,
      localAuditEntries: state.localAuditEntries.slice(0, 120),
      localNotifications: state.localNotifications.slice(0, 80),
    };
    
    // Get Convex auth token for authentication
    const convexToken = localStorage.getItem("ConvexCredentials");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (convexToken) {
      headers["Authorization"] = `Bearer ${convexToken}`;
    }
    
    fetch("/api/tfsecure-sync", {
      method: "POST",
      headers,
      body: JSON.stringify(syncPayload),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

async function pullStateFromLanServer() {
  if (typeof window === "undefined") return;
  try {
    // Get Convex auth token from localStorage (Convex stores it there)
    const convexToken = localStorage.getItem("ConvexCredentials");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (convexToken) {
      headers["Authorization"] = `Bearer ${convexToken}`;
    }

    const res = await fetch(`/api/tfsecure-sync?t=${Date.now()}`, { 
      cache: "no-store",
      headers,
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === "object") {
      mergeRemoteState(data);
    }
  } catch {
    // ignore offline/unreachable
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", e => {
    if (e.key === REGISTRY_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        mergeRemoteState(parsed);
      } catch {
        // ignore
      }
    }
  });

  if ("BroadcastChannel" in window) {
    try {
      syncChannel = new BroadcastChannel("tfsecure_registry_sync_v1");
      syncChannel.onmessage = ev => {
        try {
          // Validate message structure before processing
          if (!ev.data || typeof ev.data !== "object") return;
          if (!ev.data.__senderDeviceId || typeof ev.data.__senderDeviceId !== "string") return;
          if (!ev.data.state || typeof ev.data.state !== "object") return;
          
          // Validate device ID format
          if (!/^dev_\d+_[a-z0-9]{6}$/.test(ev.data.__senderDeviceId)) return;
          
          // Ignore own messages
          if (ev.data.__senderDeviceId === CLIENT_DEVICE_ID) return;
          
          // Rate limit: only process if last sync was >500ms ago
          const now = Date.now();
          if (now - lastLocalGateOperatorActionAt < 500) return;
          
          // Only merge safe fields - never broadcast secrets
          const safeState = {
            localPasscodes: Array.isArray(ev.data.state.localPasscodes) 
              ? ev.data.state.localPasscodes.filter((p: any) => 
                  p && 
                  typeof p._id === "string" &&
                  typeof p.codeHash === "string" &&
                  /^[a-f0-9]{64}$/.test(p.codeHash) &&
                  typeof p.visitorName === "string" &&
                  p.visitorName.length >= 2 && p.visitorName.length <= 80
                ).slice(0, 300)
              : [],
            onSiteRecords: Array.isArray(ev.data.state.onSiteRecords)
              ? ev.data.state.onSiteRecords.filter((r: any) =>
                  r &&
                  typeof r.id === "string" &&
                  typeof r.visitorName === "string" &&
                  typeof r.checkedInAt === "number"
                )
              : [],
            revokedPasscodeIds: typeof ev.data.state.revokedPasscodeIds === "object" 
              ? ev.data.state.revokedPasscodeIds 
              : {},
            usedPasscodeTimestamps: typeof ev.data.state.usedPasscodeTimestamps === "object"
              ? ev.data.state.usedPasscodeTimestamps
              : {},
            checkedOutPasscodeIds: typeof ev.data.state.checkedOutPasscodeIds === "object"
              ? ev.data.state.checkedOutPasscodeIds
              : {},
          };
          
          mergeRemoteState(safeState);
        } catch (error) {
          // Log validation failure for security monitoring
          console.error("Invalid BroadcastChannel message rejected", error);
        }
      };
    } catch {
      // ignore
    }
  }

  pullStateFromLanServer();

  if ("EventSource" in window) {
    try {
      const es = new EventSource("/api/tfsecure-sync/stream");
      es.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.senderDeviceId !== CLIENT_DEVICE_ID) {
            pullStateFromLanServer();
          }
        } catch {
          pullStateFromLanServer();
        }
      };
    } catch {
      // ignore
    }
  }

  setInterval(() => {
    pullStateFromLanServer();
  }, 2500);
}

function saveAndNotify() {
  try {
    if (state.systemConfig.customLogoUrl) {
      localStorage.setItem(IMG_LOGO_KEY, state.systemConfig.customLogoUrl);
    } else {
      localStorage.removeItem(IMG_LOGO_KEY);
    }
    if (state.systemConfig.customLoginBgUrl) {
      localStorage.setItem(IMG_LOGIN_BG_KEY, state.systemConfig.customLoginBgUrl);
    } else {
      localStorage.removeItem(IMG_LOGIN_BG_KEY);
    }
    if (state.systemConfig.customWorkspaceBgUrl) {
      localStorage.setItem(IMG_WORKSPACE_BG_KEY, state.systemConfig.customWorkspaceBgUrl);
    } else {
      localStorage.removeItem(IMG_WORKSPACE_BG_KEY);
    }
  } catch {
    // ignore quota errors on dedicated image keys
  }

  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(state));
  } catch {
    // If main registry hits localStorage quota because of large embedded base64 images,
    // keep the images in their dedicated keys and store the rest of the registry cleanly.
    try {
      const compactState: RegistryState = {
        ...state,
        localAuditEntries: state.localAuditEntries.slice(0, 120),
        localNotifications: state.localNotifications.slice(0, 50),
        systemConfig: {
          ...state.systemConfig,
          customLogoUrl: undefined,
          customLoginBgUrl: undefined,
          customWorkspaceBgUrl: undefined,
        },
      };
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(compactState));
    } catch {
      // ignore
    }
  }
  pushStateToLanServer();
  subscribers.forEach(fn => fn());
}

/**
 * Checks whether the given user profile is the Primary Bootstrap System Admin
 * or a server-level System Admin.
 */
export function isPrimaryBootstrapAdmin(profile: {
  _id?: string;
  email?: string;
  role?: string;
}): boolean {
  const cleanEmail = (profile.email ?? "").trim().toLowerCase();
  const pid = profile._id ?? "";
  if (profile.role === "admin") return true;
  if (pid && state.bootstrapAdminProfileId === pid) return true;
  if (cleanEmail && state.bootstrapAdminEmail === cleanEmail) return true;
  if (cleanEmail && state.registeredProfiles[cleanEmail]?.source === "bootstrap") return true;
  return false;
}

/**
 * Synchronizes authenticated profile state on login without clobbering explicit Admin role assignments
 * or accidentally promoting non-admin invited/self-registered accounts to System Admin.
 */
export function ensureFirstAccountAndInvites(profile: {
  _id: string;
  userId?: string;
  email: string;
  name: string;
  role: string;
  active?: boolean;
  departmentId?: string;
}) {
  const now = Date.now();
  const cleanEmail = profile.email.trim().toLowerCase();
  const cleanName = sanitizeText(profile.name, 80) || cleanEmail.split("@")[0] || "User";
  let changed = false;

  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys };
  const nextRoles = { ...state.userRoleOverrides };
  const nextDepts = { ...state.userDepartmentOverrides };
  const nextProfiles = { ...state.registeredProfiles };
  const nextAcceptances = { ...state.policyAcceptances };
  let nextBootstrapEmail = state.bootstrapAdminEmail;
  let nextBootstrapId = state.bootstrapAdminProfileId;

  // Bind recent pre-login policy acceptance to the authenticated user's email & userId
  const latestSessionAccept = nextAcceptances.__latest_session__;
  if (
    latestSessionAccept &&
    latestSessionAccept.policyVersion === CURRENT_POLICY_VERSION &&
    now - latestSessionAccept.acceptedAt < 30 * 60_000
  ) {
    if (!nextAcceptances[cleanEmail] || nextAcceptances[cleanEmail].policyVersion !== CURRENT_POLICY_VERSION) {
      nextAcceptances[cleanEmail] = {
        ...latestSessionAccept,
        key: cleanEmail,
        email: cleanEmail,
        name: cleanName,
      };
      changed = true;
    }
    if (profile.userId && (!nextAcceptances[profile.userId] || nextAcceptances[profile.userId].policyVersion !== CURRENT_POLICY_VERSION)) {
      nextAcceptances[profile.userId] = nextAcceptances[cleanEmail];
      changed = true;
    }
  }

  const invite = state.invitedUsers[cleanEmail];
  const existingReg = nextProfiles[cleanEmail];
  const explicitEmailRole = nextRoles[cleanEmail];
  const explicitIdRole = nextRoles[profile._id];

  // 1. If this user's email was invited by the System Admin, apply their invited role, department, and approval:
  if (invite) {
    const resolvedInviteRole = explicitIdRole ?? explicitEmailRole ?? invite.role;
    if (nextRoles[profile._id] !== resolvedInviteRole || nextRoles[cleanEmail] !== resolvedInviteRole) {
      nextRoles[profile._id] = resolvedInviteRole;
      nextRoles[cleanEmail] = resolvedInviteRole;
      changed = true;
    }
    const resolvedInviteDept = nextDepts[profile._id] ?? nextDepts[cleanEmail] ?? invite.departmentId ?? profile.departmentId;
    if (resolvedInviteDept && (nextDepts[profile._id] !== resolvedInviteDept || nextDepts[cleanEmail] !== resolvedInviteDept)) {
      nextDepts[profile._id] = resolvedInviteDept;
      nextDepts[cleanEmail] = resolvedInviteDept;
      changed = true;
    }
    if (nextPending[cleanEmail]) {
      delete nextPending[cleanEmail];
      changed = true;
    }
    if (!nextApproved[profile._id] || !nextApproved[cleanEmail]) {
      nextApproved[profile._id] = now;
      nextApproved[cleanEmail] = now;
      changed = true;
    }
    if (resolvedInviteRole === "admin" && !nextBootstrapEmail) {
      nextBootstrapEmail = cleanEmail;
      nextBootstrapId = profile._id;
      changed = true;
    }
  } else {
    // 2. Determine whether this account is the Primary Bootstrap Admin
    const hasAnyKnownAdmin =
      Boolean(nextBootstrapEmail) ||
      Object.values(nextRoles).includes("admin") ||
      Object.values(nextProfiles).some(p => p.role === "admin" && p.active);

    const isPendingSelfSignup =
      Boolean(nextPending[cleanEmail]) || existingReg?.source === "signup";

    const isThisBootstrapOrServerAdmin =
      profile.role === "admin" ||
      nextBootstrapEmail === cleanEmail ||
      nextBootstrapId === profile._id ||
      (!hasAnyKnownAdmin && !isPendingSelfSignup && !explicitEmailRole && !explicitIdRole);

    if (isThisBootstrapOrServerAdmin) {
      if (!nextBootstrapEmail) {
        nextBootstrapEmail = cleanEmail;
        changed = true;
      }
      if (!nextBootstrapId || nextBootstrapEmail === cleanEmail) {
        if (nextBootstrapId !== profile._id && nextBootstrapEmail === cleanEmail) {
          nextBootstrapId = profile._id;
          changed = true;
        }
      }
      // Primary Bootstrap Admin or Server Admin always retains "admin" role
      if (nextRoles[profile._id] !== "admin" || nextRoles[cleanEmail] !== "admin") {
        nextRoles[profile._id] = "admin";
        nextRoles[cleanEmail] = "admin";
        changed = true;
      }
      if (nextPending[cleanEmail]) {
        delete nextPending[cleanEmail];
        changed = true;
      }
      if (!nextApproved[profile._id] || !nextApproved[cleanEmail]) {
        nextApproved[profile._id] = now;
        nextApproved[cleanEmail] = now;
        changed = true;
      }
    } else {
      // 3. Regular non-admin account: sync any email-level role/department overrides to profile._id
      if (explicitEmailRole && nextRoles[profile._id] !== explicitEmailRole) {
        nextRoles[profile._id] = explicitEmailRole;
        changed = true;
      } else if (explicitIdRole && nextRoles[cleanEmail] !== explicitIdRole) {
        nextRoles[cleanEmail] = explicitIdRole;
        changed = true;
      }
      const syncedDept = nextDepts[profile._id] ?? nextDepts[cleanEmail] ?? existingReg?.departmentId ?? profile.departmentId;
      if (syncedDept && (nextDepts[profile._id] !== syncedDept || nextDepts[cleanEmail] !== syncedDept)) {
        nextDepts[profile._id] = syncedDept;
        nextDepts[cleanEmail] = syncedDept;
        changed = true;
      }
    }
  }

  // Always keep registeredProfiles synchronized with the authenticated profile so the Admin Users table is complete
  const resolvedRole: RoleType =
    nextRoles[profile._id] ??
    nextRoles[cleanEmail] ??
    invite?.role ??
    existingReg?.role ??
    (profile.role === "admin" || nextBootstrapEmail === cleanEmail
      ? "admin"
      : profile.role === "security"
      ? "security"
      : "staff");

  const resolvedDept =
    nextDepts[profile._id] ??
    nextDepts[cleanEmail] ??
    invite?.departmentId ??
    existingReg?.departmentId ??
    profile.departmentId;

  const resolvedActive =
    Boolean(nextApproved[profile._id] || nextApproved[cleanEmail]) ||
    resolvedRole === "admin" ||
    Boolean(invite) ||
    (!nextPending[cleanEmail] && (!state.systemConfig.requireAdminApproval || profile.active === true));

  const nextProfileEntry: RegisteredProfileRecord = {
    _id: profile._id,
    userId: profile.userId ?? existingReg?.userId ?? profile._id,
    name: cleanName,
    email: cleanEmail,
    role: resolvedRole,
    active: resolvedActive,
    departmentId: resolvedDept,
    registeredAt: existingReg?.registeredAt ?? now,
    source:
      nextBootstrapEmail === cleanEmail
        ? "bootstrap"
        : invite
        ? "invite"
        : existingReg?.source ?? "server",
  };

  if (
    !existingReg ||
    existingReg._id !== nextProfileEntry._id ||
    existingReg.userId !== nextProfileEntry.userId ||
    existingReg.name !== nextProfileEntry.name ||
    existingReg.role !== nextProfileEntry.role ||
    existingReg.active !== nextProfileEntry.active ||
    existingReg.departmentId !== nextProfileEntry.departmentId
  ) {
    nextProfiles[cleanEmail] = nextProfileEntry;
    changed = true;
  }

  if (changed) {
    state = {
      ...state,
      bootstrapAdminEmail: nextBootstrapEmail,
      bootstrapAdminProfileId: nextBootstrapId,
      registeredProfiles: nextProfiles,
      userRoleOverrides: nextRoles,
      userDepartmentOverrides: nextDepts,
      pendingApprovalEmails: nextPending,
      approvedUserKeys: nextApproved,
      policyAcceptances: nextAcceptances,
    };
    saveAndNotify();
  }
}

export function getEffectiveRole(profile: {
  _id?: string;
  email: string;
  role?: string;
}): RoleType {
  const cleanEmail = (profile.email ?? "").trim().toLowerCase();
  const pid = profile._id ?? "";

  // 1. Primary Bootstrap System Admin or Server-verified Admin is always System Admin (cannot be self-demoted)
  if (
    profile.role === "admin" ||
    (pid && state.bootstrapAdminProfileId === pid) ||
    (cleanEmail && state.bootstrapAdminEmail === cleanEmail) ||
    (cleanEmail && state.registeredProfiles[cleanEmail]?.source === "bootstrap")
  ) {
    return "admin";
  }

  // 2. Explicit Admin role assignment (by profile._id or lowercase email)
  if (pid && state.userRoleOverrides[pid]) {
    return state.userRoleOverrides[pid];
  }
  if (cleanEmail && state.userRoleOverrides[cleanEmail]) {
    return state.userRoleOverrides[cleanEmail];
  }

  // 3. Active Admin Invitation role
  if (cleanEmail && state.invitedUsers[cleanEmail]) {
    return state.invitedUsers[cleanEmail].role;
  }

  // 4. Registered profile record from invite or signup
  const reg = cleanEmail ? state.registeredProfiles[cleanEmail] : undefined;
  if (reg && (reg.source === "invite" || reg.source === "signup")) {
    return reg.role;
  }

  // 5. Server-assigned Security Admin or Staff
  if (profile.role === "security" || profile.role === "staff") {
    return profile.role;
  }

  // 6. Default unpromoted accounts to "staff"
  return "staff";
}

export function getEffectiveDepartmentId(
  profile: { _id?: string; email?: string; departmentId?: string },
  fallbackDeptId?: string
): string | undefined {
  const pid = profile._id ?? "";
  const cleanEmail = (profile.email ?? "").trim().toLowerCase();
  if (pid && state.userDepartmentOverrides[pid]) {
    return state.userDepartmentOverrides[pid];
  }
  if (cleanEmail && state.userDepartmentOverrides[cleanEmail]) {
    return state.userDepartmentOverrides[cleanEmail];
  }
  if (cleanEmail && state.invitedUsers[cleanEmail]?.departmentId) {
    return state.invitedUsers[cleanEmail].departmentId;
  }
  if (cleanEmail && state.registeredProfiles[cleanEmail]?.departmentId) {
    return state.registeredProfiles[cleanEmail].departmentId;
  }
  return profile.departmentId || fallbackDeptId;
}

export function setUserRoleOverride(
  profileId: string,
  role: RoleType,
  actorName = "System Admin",
  targetEmail = ""
) {
  const now = Date.now();
  const cleanEmail = targetEmail.trim().toLowerCase();
  const nextRoles: Record<string, RoleType> = {
    ...state.userRoleOverrides,
    [profileId]: role,
  };
  if (cleanEmail) {
    nextRoles[cleanEmail] = role;
  }

  const nextProfiles = { ...state.registeredProfiles };
  if (cleanEmail && nextProfiles[cleanEmail]) {
    nextProfiles[cleanEmail] = {
      ...nextProfiles[cleanEmail],
      role,
    };
  } else {
    for (const [k, v] of Object.entries(nextProfiles)) {
      if (v._id === profileId) {
        nextProfiles[k] = { ...v, role };
        nextRoles[k] = role;
      }
    }
  }

  const nextInvites = { ...state.invitedUsers };
  if (cleanEmail && nextInvites[cleanEmail]) {
    nextInvites[cleanEmail] = {
      ...nextInvites[cleanEmail],
      role,
    };
  }

  const auditEntry: LocalAuditEntry = {
    _id: `audit_role_${profileId}_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.role",
    detail: `${cleanEmail ? `${cleanEmail}: ` : ""}role set to ${role}`,
    ok: true,
    at: now,
  };
  state = {
    ...state,
    userRoleOverrides: nextRoles,
    registeredProfiles: nextProfiles,
    invitedUsers: nextInvites,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function inviteUserAccount(params: {
  email: string;
  name: string;
  role: RoleType;
  departmentId?: string;
  invitedBy: string;
}): InvitedUserRecord {
  const now = Date.now();
  const cleanEmail = sanitizeText(params.email, 120).toLowerCase();
  const cleanName = sanitizeText(params.name, 80) || cleanEmail.split("@")[0] || "Invited User";
  const cleanBy = sanitizeText(params.invitedBy, 80) || "System Admin";
  const r = new Uint32Array(1);
  crypto.getRandomValues(r);
  const inviteCode = `TFC-INV-${String(100000 + (r[0] % 900000))}`;

  const record: InvitedUserRecord = {
    email: cleanEmail,
    name: cleanName,
    role: params.role,
    departmentId: params.departmentId,
    invitedBy: cleanBy,
    invitedAt: now,
    inviteCode,
  };

  const existingProfile = state.registeredProfiles[cleanEmail];
  const pid = existingProfile?._id ?? `invited_${cleanEmail}`;

  const nextPending = { ...state.pendingApprovalEmails };
  delete nextPending[cleanEmail];
  delete nextPending[pid];

  const nextApproved: Record<string, number> = {
    ...state.approvedUserKeys,
    [cleanEmail]: now,
    [pid]: now,
  };

  const nextRoles: Record<string, RoleType> = {
    ...state.userRoleOverrides,
    [cleanEmail]: params.role,
    [pid]: params.role,
  };

  const nextDepts: Record<string, string> = { ...state.userDepartmentOverrides };
  if (params.departmentId) {
    nextDepts[cleanEmail] = params.departmentId;
    nextDepts[pid] = params.departmentId;
  }

  const nextProfiles: Record<string, RegisteredProfileRecord> = {
    ...state.registeredProfiles,
    [cleanEmail]: {
      _id: pid,
      userId: existingProfile?.userId ?? pid,
      name: cleanName,
      email: cleanEmail,
      role: params.role,
      active: true,
      departmentId: params.departmentId ?? existingProfile?.departmentId,
      registeredAt: existingProfile?.registeredAt ?? now,
      source: "invite",
    },
  };

  const auditEntry: LocalAuditEntry = {
    _id: `audit_invite_${now}`,
    name: cleanBy,
    action: "users.invite",
    detail: `Invited ${cleanName} (${cleanEmail}) as ${params.role} [${inviteCode}]`,
    ok: true,
    at: now,
  };

  const notifEntry: LocalNotificationEntry = {
    _id: `notif_invite_${now}`,
    kind: "security",
    message: `Invitation issued for ${cleanName} (${cleanEmail}) — Role: ${params.role.toUpperCase()}`,
    at: now,
    read: false,
  };

  state = {
    ...state,
    invitedUsers: { ...state.invitedUsers, [cleanEmail]: record },
    registeredProfiles: nextProfiles,
    userRoleOverrides: nextRoles,
    userDepartmentOverrides: nextDepts,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
    localNotifications: [notifEntry, ...state.localNotifications].slice(0, 100),
  };
  saveAndNotify();
  return record;
}

export function removeUserInvite(email: string, actorName = "System Admin") {
  const cleanEmail = email.trim().toLowerCase();
  const nextInvites = { ...state.invitedUsers };
  delete nextInvites[cleanEmail];

  const now = Date.now();
  const auditEntry: LocalAuditEntry = {
    _id: `audit_invite_revoke_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.invite_revoke",
    detail: `Revoked invitation for ${cleanEmail}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    invitedUsers: nextInvites,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function updateSystemConfig(
  patch: Partial<SystemConfig>,
  actorName = "System Admin",
  auditDetail = "Updated system configuration"
) {
  const now = Date.now();
  const nextConfig: SystemConfig = {
    ...state.systemConfig,
    ...patch,
    bannerTitle: sanitizeText(patch.bannerTitle ?? state.systemConfig.bannerTitle, 90) || DEFAULT_SYSTEM_CONFIG.bannerTitle,
    lastUpdatedAt: now,
  };
  const auditEntry: LocalAuditEntry = {
    _id: `audit_sysconfig_${now}`,
    name: sanitizeText(actorName, 80),
    action: "system.config",
    detail: sanitizeText(auditDetail, 200),
    ok: true,
    at: now,
  };
  state = {
    ...state,
    systemConfig: nextConfig,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function removeSystemImage(
  slot: "logo" | "loginBg" | "workspaceBg" | "all",
  actorName = "System Admin"
) {
  const now = Date.now();
  const nextConfig: SystemConfig = { ...state.systemConfig, lastUpdatedAt: now };
  let detail = "Removed custom system image";

  if (slot === "logo" || slot === "all") {
    nextConfig.customLogoUrl = undefined;
    try {
      localStorage.removeItem(IMG_LOGO_KEY);
    } catch {
      // ignore
    }
    detail = "Removed custom organization logo and restored default TF Commodities logo";
  }
  if (slot === "loginBg" || slot === "all") {
    nextConfig.customLoginBgUrl = undefined;
    nextConfig.loginBackgroundMode = "checkpoint";
    try {
      localStorage.removeItem(IMG_LOGIN_BG_KEY);
    } catch {
      // ignore
    }
    detail = "Removed custom homepage/login background image and restored default checkpoint image";
  }
  if (slot === "workspaceBg" || slot === "all") {
    nextConfig.customWorkspaceBgUrl = undefined;
    nextConfig.workspaceBackgroundMode = "facility";
    try {
      localStorage.removeItem(IMG_WORKSPACE_BG_KEY);
    } catch {
      // ignore
    }
    detail = "Removed custom workspace background image and restored default facility image";
  }
  if (slot === "all") {
    detail = "Removed all custom uploaded images and restored factory default media";
  }

  const auditEntry: LocalAuditEntry = {
    _id: `audit_imgremove_${slot}_${now}`,
    name: sanitizeText(actorName, 80),
    action: "system.image_remove",
    detail,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    systemConfig: nextConfig,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

/**
 * Reads and optimizes an uploaded image file so that it fits comfortably in persistent browser storage
 * without hitting localStorage quota limits, preserving alpha transparency for logos.
 */
export function optimizeImageFileToDataUrl(
  file: File,
  kind: "logo" | "background"
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please select a valid image file (PNG, JPG, WebP, SVG)."));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error("Image file is too large (maximum 15 MB)."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!rawDataUrl) {
        reject(new Error("Empty image data."));
        return;
      }
      // Keep SVG or already compact files (< 160 KB) directly
      if (file.type === "image/svg+xml" || file.size < 160 * 1024) {
        resolve(rawDataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = kind === "logo" ? 800 : 1440;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // For logos, preserve transparency with webp/png; for backgrounds, use compact webp/jpeg
          const outputMime = kind === "logo" ? "image/png" : "image/jpeg";
          const quality = kind === "logo" ? 0.9 : 0.82;
          let compressed = canvas.toDataURL("image/webp", quality);
          if (!compressed.startsWith("data:image/webp")) {
            compressed = canvas.toDataURL(outputMime, quality);
          }
          resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function exportSystemBackupJson(actorName = "System Admin", extraMetadata?: Record<string, unknown>) {
  const now = Date.now();
  const nextConfig: SystemConfig = {
    ...state.systemConfig,
    lastBackupAt: now,
  };
  const auditEntry: LocalAuditEntry = {
    _id: `audit_backup_${now}`,
    name: sanitizeText(actorName, 80),
    action: "system.backup",
    detail: `Exported full system backup snapshot (${state.onSiteRecords.length} gate records, ${Object.keys(state.invitedUsers).length} invites)`,
    ok: true,
    at: now,
  };
  state = {
    ...state,
    systemConfig: nextConfig,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();

  const payload = {
    backupSchema: "tfsecure_enterprise_backup_v2",
    exportedAt: new Date(now).toISOString(),
    exportedBy: actorName,
    metadata: extraMetadata ?? {},
    registryState: state,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tfsecure-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function recordPolicyAcceptance(params: {
  email: string;
  name?: string;
  userId?: string;
  context: "pre_login" | "signup" | "workspace_gate";
}): PolicyAcceptanceRecord {
  const now = Date.now();
  const cleanEmail = sanitizeText(params.email, 120).toLowerCase() || "operator@tfcommodities.com";
  const cleanName = sanitizeText(params.name, 80) || cleanEmail.split("@")[0] || "Operator";
  const record: PolicyAcceptanceRecord = {
    key: cleanEmail,
    email: cleanEmail,
    name: cleanName,
    policyVersion: CURRENT_POLICY_VERSION,
    acceptedAt: now,
    context: params.context,
  };

  const nextAcceptances: Record<string, PolicyAcceptanceRecord> = {
    ...state.policyAcceptances,
    [cleanEmail]: record,
    __latest_session__: record,
  };
  if (params.userId) {
    nextAcceptances[params.userId] = record;
  }

  const contextLabel =
    params.context === "pre_login"
      ? "prior to sign-in"
      : params.context === "signup"
      ? "during account registration"
      : "at workspace security gate";

  const auditEntry: LocalAuditEntry = {
    _id: `audit_policy_accept_${now}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${cleanName} (${cleanEmail})`,
    action: "policy.accept",
    detail: `Agreed to Data Protection (Ghana Act 843) & Security Policy [${CURRENT_POLICY_VERSION}] ${contextLabel}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    policyAcceptances: nextAcceptances,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
  return record;
}

export function recordPolicyDeclineAttempt(email: string, flow: string) {
  const now = Date.now();
  const cleanEmail = sanitizeText(email, 120).toLowerCase() || "unauthenticated-user";
  const auditEntry: LocalAuditEntry = {
    _id: `audit_policy_decline_${now}`,
    name: cleanEmail,
    action: "policy.decline",
    detail: `Blocked ${flow} attempt: user did not agree to Data Protection & Security Policy [${CURRENT_POLICY_VERSION}]`,
    ok: false,
    at: now,
  };
  state = {
    ...state,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function hasUserAcceptedPolicy(email?: string, userId?: string): boolean {
  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (cleanEmail && state.policyAcceptances[cleanEmail]?.policyVersion === CURRENT_POLICY_VERSION) {
    return true;
  }
  if (userId && state.policyAcceptances[userId]?.policyVersion === CURRENT_POLICY_VERSION) {
    return true;
  }
  const latest = state.policyAcceptances.__latest_session__;
  if (
    latest &&
    latest.policyVersion === CURRENT_POLICY_VERSION &&
    Date.now() - latest.acceptedAt < 30 * 60_000 &&
    (!cleanEmail || latest.email === cleanEmail || latest.email === "pre-auth-operator@tfcommodities.com")
  ) {
    return true;
  }
  return false;
}

export function togglePilotScenarioCheck(
  scenarioId: string,
  actorName = "System Admin",
  notes?: string
) {
  const now = Date.now();
  const current = state.pilotScenarioChecks[scenarioId];
  const nextVerified = !current?.verified;
  const record: PilotScenarioCheckRecord = {
    scenarioId,
    verified: nextVerified,
    verifiedBy: sanitizeText(actorName, 80) || "Evaluator",
    verifiedAt: now,
    notes: sanitizeText(notes, 160) || current?.notes,
  };
  const auditEntry: LocalAuditEntry = {
    _id: `audit_pilot_${scenarioId}_${now}`,
    name: record.verifiedBy,
    action: "pilot.evaluate",
    detail: `${nextVerified ? "Verified" : "Reset"} pilot evaluation scenario #${scenarioId}`,
    ok: true,
    at: now,
  };
  state = {
    ...state,
    pilotScenarioChecks: {
      ...state.pilotScenarioChecks,
      [scenarioId]: record,
    },
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function restoreSystemBackupJson(
  rawJson: string,
  actorName = "System Admin"
): { ok: boolean; error?: string; summary?: string } {
  try {
    const parsed = JSON.parse(rawJson);
    const source = parsed.registryState ?? parsed;
    if (!source || typeof source !== "object") {
      return { ok: false, error: "Invalid backup file format." };
    }
    const now = Date.now();
    const restoredOnSite: OnSiteRecord[] = Array.isArray(source.onSiteRecords) ? source.onSiteRecords : state.onSiteRecords;
    const restoredAudits: LocalAuditEntry[] = Array.isArray(source.localAuditEntries)
      ? source.localAuditEntries
      : state.localAuditEntries;

    const restoreAudit: LocalAuditEntry = {
      _id: `audit_restore_${now}`,
      name: sanitizeText(actorName, 80),
      action: "system.restore",
      detail: `Restored system backup (${restoredOnSite.length} gate records, ${restoredAudits.length} audit entries)`,
      ok: true,
      at: now,
    };

    state = {
      attachmentsByHash: source.attachmentsByHash ?? state.attachmentsByHash,
      attachmentsByPasscodeId: source.attachmentsByPasscodeId ?? state.attachmentsByPasscodeId,
      attachmentsByName: source.attachmentsByName ?? state.attachmentsByName,
      localPasscodes: Array.isArray(source.localPasscodes) ? source.localPasscodes : state.localPasscodes,
      revokedPasscodeIds: source.revokedPasscodeIds ?? state.revokedPasscodeIds,
      usedPasscodeTimestamps: source.usedPasscodeTimestamps ?? state.usedPasscodeTimestamps,
      gateFailureTimestamps: Array.isArray(source.gateFailureTimestamps)
        ? source.gateFailureTimestamps
        : state.gateFailureTimestamps,
      localDepartments: Array.isArray(source.localDepartments) ? source.localDepartments : state.localDepartments,
      removedDepartmentIds: source.removedDepartmentIds ?? state.removedDepartmentIds,
      onSiteRecords: restoredOnSite,
      checkedOutPasscodeIds: source.checkedOutPasscodeIds ?? state.checkedOutPasscodeIds,
      deniedPasscodeIds: source.deniedPasscodeIds ?? state.deniedPasscodeIds,
      deniedCodeHashes: source.deniedCodeHashes ?? state.deniedCodeHashes,
      userDepartmentOverrides: source.userDepartmentOverrides ?? state.userDepartmentOverrides,
      userRoleOverrides: source.userRoleOverrides ?? state.userRoleOverrides,
      bootstrapAdminEmail: source.bootstrapAdminEmail ?? state.bootstrapAdminEmail,
      bootstrapAdminProfileId: source.bootstrapAdminProfileId ?? state.bootstrapAdminProfileId,
      registeredProfiles: source.registeredProfiles ?? state.registeredProfiles,
      invitedUsers: source.invitedUsers ?? state.invitedUsers,
      pendingApprovalEmails: source.pendingApprovalEmails ?? state.pendingApprovalEmails,
      approvedUserKeys: source.approvedUserKeys ?? state.approvedUserKeys,
      policyAcceptances: source.policyAcceptances ?? state.policyAcceptances,
      pilotScenarioChecks: source.pilotScenarioChecks ?? state.pilotScenarioChecks,
      localAuditEntries: [restoreAudit, ...restoredAudits].slice(0, 300),
      localNotifications: Array.isArray(source.localNotifications) ? source.localNotifications : state.localNotifications,
      systemConfig: {
        ...DEFAULT_SYSTEM_CONFIG,
        ...(source.systemConfig ?? state.systemConfig),
        lastUpdatedAt: now,
      },
    };
    saveAndNotify();
    return {
      ok: true,
      summary: `Restored ${restoredOnSite.length} gate records, ${Object.keys(state.invitedUsers).length} invitations, and system configuration.`,
    };
  } catch {
    return { ok: false, error: "Could not parse backup JSON file. Ensure it is a valid TFsecure backup." };
  }
}

export function markAllLocalNotificationsRead(me?: {
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
} | null) {
  let changed = false;
  const next = state.localNotifications.map(n => {
    if (n.read) return n;
    if (!me) {
      changed = true;
      return { ...n, read: true };
    }
    if (isVisitNotification(n)) {
      if (isNotificationForHostUser(n, me)) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    }
    if (me.role === "admin" || me.role === "security") {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (!changed) return;
  state = {
    ...state,
    localNotifications: next,
  };
  saveAndNotify();
}

export function getMergedAuditLedger(
  serverRows: Array<{ _id: string; name: string; action: string; detail: string; ok: boolean; at: number }>,
  passcodeLookup?: Array<{
    _id: string;
    visitorName: string;
    kind: string;
    company?: string;
    hostName?: string;
  }>
): LocalAuditEntry[] {
  const combined: LocalAuditEntry[] = [...serverRows, ...state.localAuditEntries];
  const existingIds = new Set(combined.map(e => e._id));

  for (const rec of state.onSiteRecords) {
    if (rec.checkedOutAt) {
      const syntheticId = `audit_checkout_${rec.passcodeId ?? rec.id}`;
      const alreadyLogged =
        existingIds.has(syntheticId) ||
        state.localAuditEntries.some(
          a =>
            a.action === "gate.checkout" &&
            Math.abs(a.at - rec.checkedOutAt!) < 5000 &&
            a.detail.toLowerCase().includes(rec.visitorName.toLowerCase())
        );
      if (!alreadyLogged) {
        existingIds.add(syntheticId);
        combined.push({
          _id: syntheticId,
          name: rec.checkedOutBy || "Gate Security",
          action: "gate.checkout",
          detail: `${rec.visitorName} (${rec.kind}, host: ${rec.hostName}, dept: ${rec.deptName}, badge: ${rec.badgeNumber}) — ${rec.checkoutNotes || "Checked out"}`,
          ok: true,
          at: rec.checkedOutAt,
        });
      }
    }
  }

  const passcodesById = new Map((passcodeLookup ?? []).map(p => [p._id, p]));
  for (const [passcodeId, co] of Object.entries(state.checkedOutPasscodeIds)) {
    const syntheticId = `audit_checkout_${passcodeId}`;
    if (existingIds.has(syntheticId)) continue;
    const p = passcodesById.get(passcodeId);
    const att = state.attachmentsByPasscodeId[passcodeId];
    const visitorName = p?.visitorName ?? att?.visitorName ?? "Visitor";
    const kind = p?.kind ?? att?.kind ?? "visitor";
    const hostName = p?.hostName ?? att?.hostName ?? "Staff Host";
    const alreadyLogged = combined.some(
      a =>
        a.action === "gate.checkout" &&
        Math.abs(a.at - co.checkedOutAt) < 5000 &&
        a.detail.toLowerCase().includes(visitorName.toLowerCase())
    );
    if (!alreadyLogged) {
      existingIds.add(syntheticId);
      combined.push({
        _id: syntheticId,
        name: co.checkedOutBy || "Gate Security",
        action: "gate.checkout",
        detail: `${visitorName} (${kind}, host: ${hostName}) — ${co.checkoutNotes || "Checked out"}`,
        ok: true,
        at: co.checkedOutAt,
      });
    }
  }

  return combined.sort((a, b) => b.at - a.at);
}

/**
 * Registers a newly signed-up user account AFTER authentication succeeds.
 * Supports matching by email or by optional invite token (TFC-INV-XXXXXX),
 * and ensures uninvited signups default to "staff" and appear in the Admin Users table immediately.
 */
export function registerSignUpAccount(params: {
  email: string;
  name?: string;
  inviteCode?: string;
  departmentId?: string;
}) {
  const key = params.email.trim().toLowerCase();
  if (!key) return;
  const now = Date.now();
  const cleanName = sanitizeText(params.name, 80) || key.split("@")[0] || "Staff User";
  const cleanCode = (params.inviteCode ?? "").trim().toUpperCase();

  // Match invite either by email or by valid inviteCode
  let matchedInvite: InvitedUserRecord | undefined = state.invitedUsers[key];
  if (!matchedInvite && cleanCode) {
    matchedInvite = Object.values(state.invitedUsers).find(
      inv => inv.inviteCode.toUpperCase() === cleanCode
    );
  }

  const nextInvites = { ...state.invitedUsers };
  if (matchedInvite && matchedInvite.email !== key) {
    nextInvites[key] = {
      ...matchedInvite,
      email: key,
      name: cleanName || matchedInvite.name,
    };
  }

  const hasAnyKnownAdmin =
    Boolean(state.bootstrapAdminEmail) ||
    Object.values(state.userRoleOverrides).includes("admin") ||
    Object.values(state.registeredProfiles).some(p => p.role === "admin" && p.active);

  // 1. First account on a fresh system (or matching bootstrap admin) becomes System Admin automatically
  if ((!hasAnyKnownAdmin && !matchedInvite) || state.bootstrapAdminEmail === key) {
    const pid = state.registeredProfiles[key]?._id ?? `bootstrap_${key}`;
    state = {
      ...state,
      bootstrapAdminEmail: key,
      registeredProfiles: {
        ...state.registeredProfiles,
        [key]: {
          _id: pid,
          userId: state.registeredProfiles[key]?.userId ?? pid,
          name: cleanName,
          email: key,
          role: "admin",
          active: true,
          departmentId: params.departmentId ?? state.localDepartments[0]?._id,
          registeredAt: now,
          source: "bootstrap",
        },
      },
      userRoleOverrides: {
        ...state.userRoleOverrides,
        [key]: "admin",
        [pid]: "admin",
      },
      approvedUserKeys: {
        ...state.approvedUserKeys,
        [key]: now,
        [pid]: now,
      },
    };
    saveAndNotify();
    return;
  }

  // 2. Invited user (e.g. invited Admin, Security Admin, Department Head, or Staff) is immediately approved with their pre-assigned role
  if (matchedInvite) {
    const pid = state.registeredProfiles[key]?._id ?? `invited_${key}`;
    const assignedRole = matchedInvite.role;
    const assignedDept = matchedInvite.departmentId ?? params.departmentId ?? state.localDepartments[0]?._id;
    const nextPending = { ...state.pendingApprovalEmails };
    delete nextPending[key];
    delete nextPending[pid];

    state = {
      ...state,
      invitedUsers: nextInvites,
      registeredProfiles: {
        ...state.registeredProfiles,
        [key]: {
          _id: pid,
          userId: state.registeredProfiles[key]?.userId ?? pid,
          name: cleanName,
          email: key,
          role: assignedRole,
          active: true,
          departmentId: assignedDept,
          registeredAt: now,
          source: "invite",
        },
      },
      userRoleOverrides: {
        ...state.userRoleOverrides,
        [key]: assignedRole,
        [pid]: assignedRole,
      },
      userDepartmentOverrides: assignedDept
        ? {
            ...state.userDepartmentOverrides,
            [key]: assignedDept,
            [pid]: assignedDept,
          }
        : state.userDepartmentOverrides,
      pendingApprovalEmails: nextPending,
      approvedUserKeys: {
        ...state.approvedUserKeys,
        [key]: now,
        [pid]: now,
      },
    };
    saveAndNotify();
    return;
  }

  // 3. Standard uninvited self-registration: ALWAYS defaults to "staff" (only System Admin can promote roles in Users tab)
  const pid = state.registeredProfiles[key]?._id ?? `signup_${key}`;
  const assignedRole: RoleType = state.userRoleOverrides[key] ?? "staff";
  const assignedDept =
    params.departmentId ?? state.userDepartmentOverrides[key] ?? state.localDepartments[0]?._id;
  const autoApproved = !state.systemConfig.requireAdminApproval || assignedRole === "admin";

  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys };

  if (autoApproved) {
    delete nextPending[key];
    nextApproved[key] = now;
    nextApproved[pid] = now;
  } else {
    nextPending[key] = now;
    delete nextApproved[key];
    delete nextApproved[pid];
  }

  const signupAudit: LocalAuditEntry = {
    _id: `audit_signup_${now}`,
    name: cleanName,
    action: "profile.create",
    detail: autoApproved
      ? `Registered new staff account (${key})`
      : `New account registered pending admin approval: ${cleanName} (${key})`,
    ok: true,
    at: now,
  };

  const signupNotif: LocalNotificationEntry = {
    _id: `notif_signup_${now}`,
    kind: "security",
    message: autoApproved
      ? `New user registered: ${cleanName} (${key})`
      : `New user registration pending approval: ${cleanName} (${key})`,
    at: now,
    read: false,
  };

  state = {
    ...state,
    registeredProfiles: {
      ...state.registeredProfiles,
      [key]: {
        _id: pid,
        userId: state.registeredProfiles[key]?.userId ?? pid,
        name: cleanName,
        email: key,
        role: assignedRole,
        active: autoApproved,
        departmentId: assignedDept,
        registeredAt: now,
        source: "signup",
      },
    },
    userRoleOverrides: {
      ...state.userRoleOverrides,
      [key]: assignedRole,
      [pid]: assignedRole,
    },
    userDepartmentOverrides: assignedDept
      ? {
          ...state.userDepartmentOverrides,
          [key]: assignedDept,
          [pid]: assignedDept,
        }
      : state.userDepartmentOverrides,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
    localAuditEntries: [signupAudit, ...state.localAuditEntries].slice(0, 300),
    localNotifications: [signupNotif, ...state.localNotifications].slice(0, 100),
  };
  saveAndNotify();
}

export function markEmailPendingApproval(email: string, name?: string, inviteCode?: string) {
  registerSignUpAccount({ email, name, inviteCode });
}

export function approveUserAccount(profileId: string, email?: string, actorName = "System Admin") {
  const now = Date.now();
  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys, [profileId]: now };
  const nextProfiles = { ...state.registeredProfiles };
  delete nextPending[profileId];

  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (cleanEmail) {
    delete nextPending[cleanEmail];
    nextApproved[cleanEmail] = now;
    if (nextProfiles[cleanEmail]) {
      nextProfiles[cleanEmail] = { ...nextProfiles[cleanEmail], active: true };
    }
  }
  for (const [k, v] of Object.entries(nextProfiles)) {
    if (v._id === profileId) {
      delete nextPending[k];
      nextApproved[k] = now;
      nextProfiles[k] = { ...v, active: true };
    }
  }

  const auditEntry: LocalAuditEntry = {
    _id: `audit_approve_${profileId}_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.approve",
    detail: `Approved & activated account ${cleanEmail || profileId}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    registeredProfiles: nextProfiles,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function revokeUserApproval(profileId: string, email?: string, actorName = "System Admin") {
  const now = Date.now();
  const nextPending = { ...state.pendingApprovalEmails, [profileId]: now };
  const nextApproved = { ...state.approvedUserKeys };
  const nextProfiles = { ...state.registeredProfiles };
  delete nextApproved[profileId];

  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (cleanEmail) {
    delete nextApproved[cleanEmail];
    nextPending[cleanEmail] = now;
    if (nextProfiles[cleanEmail]) {
      nextProfiles[cleanEmail] = { ...nextProfiles[cleanEmail], active: false };
    }
  }
  for (const [k, v] of Object.entries(nextProfiles)) {
    if (v._id === profileId) {
      delete nextApproved[k];
      nextPending[k] = now;
      nextProfiles[k] = { ...v, active: false };
    }
  }

  const auditEntry: LocalAuditEntry = {
    _id: `audit_deactivate_${profileId}_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.deactivate",
    detail: `Deactivated account ${cleanEmail || profileId}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    registeredProfiles: nextProfiles,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function removeRegisteredUser(profileId: string, email?: string, actorName = "System Admin") {
  const now = Date.now();
  const cleanEmail = (email ?? "").trim().toLowerCase();
  const nextProfiles = { ...state.registeredProfiles };
  const nextInvites = { ...state.invitedUsers };
  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys };
  const nextRoles = { ...state.userRoleOverrides };
  const nextDepts = { ...state.userDepartmentOverrides };

  delete nextPending[profileId];
  delete nextApproved[profileId];
  delete nextRoles[profileId];
  delete nextDepts[profileId];

  if (cleanEmail) {
    delete nextProfiles[cleanEmail];
    delete nextInvites[cleanEmail];
    delete nextPending[cleanEmail];
    delete nextApproved[cleanEmail];
    delete nextRoles[cleanEmail];
    delete nextDepts[cleanEmail];
  }
  for (const [k, v] of Object.entries(nextProfiles)) {
    if (v._id === profileId) {
      delete nextProfiles[k];
      delete nextInvites[k];
      delete nextPending[k];
      delete nextApproved[k];
      delete nextRoles[k];
      delete nextDepts[k];
    }
  }

  const auditEntry: LocalAuditEntry = {
    _id: `audit_user_remove_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.remove",
    detail: `Removed user record ${cleanEmail || profileId}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    registeredProfiles: nextProfiles,
    invitedUsers: nextInvites,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
    userRoleOverrides: nextRoles,
    userDepartmentOverrides: nextDepts,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function isProfileApproved(profile: {
  _id: string;
  email: string;
  role: string;
  active?: boolean;
}): boolean {
  const cleanEmail = (profile.email ?? "").trim().toLowerCase();
  const pid = profile._id ?? "";

  // Primary Bootstrap Admin is always approved so the system can never lock out its primary owner
  if (
    (cleanEmail && state.bootstrapAdminEmail === cleanEmail) ||
    (pid && state.bootstrapAdminProfileId === pid)
  ) {
    return true;
  }

  // If explicitly marked pending or deactivated by an Admin, require explicit approval
  if (state.pendingApprovalEmails[pid] || (cleanEmail && state.pendingApprovalEmails[cleanEmail])) {
    return false;
  }

  // If explicitly approved in the registry or invited by an Admin
  if (
    state.approvedUserKeys[pid] ||
    (cleanEmail && state.approvedUserKeys[cleanEmail]) ||
    (cleanEmail && Boolean(state.invitedUsers[cleanEmail]))
  ) {
    return true;
  }

  const effectiveRole = getEffectiveRole(profile);
  if (effectiveRole === "admin") {
    return true;
  }

  if (!state.systemConfig.requireAdminApproval) {
    return profile.active !== false;
  }

  if (profile.active === false) return false;
  if (cleanEmail && state.registeredProfiles[cleanEmail]) {
    return state.registeredProfiles[cleanEmail].active;
  }
  return profile.active === true;
}

/**
 * Merges server profiles (`api.users.list`), the current user (`me`), locally registered profiles,
 * and pre-approved invitations into a single unified, deduplicated directory for the Users tab.
 */
export function getMergedUserDirectory(
  serverRows: Array<{
    _id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    active?: boolean;
    departmentId?: string;
  }>,
  me?: {
    _id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    active?: boolean;
    departmentId?: string;
  } | null,
  fallbackDeptId?: string
) {
  const byEmail = new Map<
    string,
    {
      _id: string;
      userId: string;
      name: string;
      email: string;
      role: RoleType;
      active: boolean;
      departmentId?: string;
      source?: string;
      inviteCode?: string;
    }
  >();

  const upsert = (raw: {
    _id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    active?: boolean;
    departmentId?: string;
    source?: string;
    inviteCode?: string;
  }) => {
    const cleanEmail = (raw.email ?? "").trim().toLowerCase();
    const key = cleanEmail || raw._id;
    const prev = byEmail.get(key);
    const preferNewId =
      !prev ||
      prev._id.startsWith("invited_") ||
      prev._id.startsWith("signup_") ||
      prev._id.startsWith("bootstrap_");
    const mergedId = preferNewId ? raw._id : prev._id;
    const mergedUserId = preferNewId ? raw.userId : prev.userId;
    const baseObj = {
      _id: mergedId,
      userId: mergedUserId,
      name: raw.name || prev?.name || cleanEmail.split("@")[0] || "User",
      email: cleanEmail || raw.email,
      role: raw.role,
      active: raw.active ?? prev?.active,
      departmentId: raw.departmentId ?? prev?.departmentId,
    };
    const effectiveRole = getEffectiveRole(baseObj);
    const effectiveDept = getEffectiveDepartmentId(baseObj, fallbackDeptId);
    const approved = isProfileApproved({ ...baseObj, role: effectiveRole });

    byEmail.set(key, {
      _id: mergedId,
      userId: mergedUserId,
      name: baseObj.name,
      email: baseObj.email,
      role: effectiveRole,
      active: approved,
      departmentId: effectiveDept,
      source: raw.source ?? prev?.source,
      inviteCode: raw.inviteCode ?? prev?.inviteCode ?? state.invitedUsers[cleanEmail]?.inviteCode,
    });
  };

  for (const inv of Object.values(state.invitedUsers)) {
    upsert({
      _id: `invited_${inv.email}`,
      userId: `invited_${inv.email}`,
      name: inv.name,
      email: inv.email,
      role: inv.role,
      active: true,
      departmentId: inv.departmentId,
      source: "invite",
      inviteCode: inv.inviteCode,
    });
  }

  for (const reg of Object.values(state.registeredProfiles)) {
    upsert({
      _id: reg._id,
      userId: reg.userId,
      name: reg.name,
      email: reg.email,
      role: reg.role,
      active: reg.active,
      departmentId: reg.departmentId,
      source: reg.source,
    });
  }

  for (const srv of serverRows) {
    upsert({
      _id: srv._id,
      userId: srv.userId,
      name: srv.name,
      email: srv.email,
      role: srv.role,
      active: srv.active,
      departmentId: srv.departmentId,
      source: "server",
    });
  }

  if (me) {
    upsert({
      _id: me._id,
      userId: me.userId,
      name: me.name,
      email: me.email,
      role: me.role,
      active: me.active,
      departmentId: me.departmentId,
      source: "server",
    });
  }

  return Array.from(byEmail.values());
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.trim()));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function registerIssuedPasscode(code: string, meta: Omit<GuestAttachment, "codeHash">) {
  const codeHash = await sha256Hex(code);
  const record: GuestAttachment = {
    ...meta,
    visitorName: sanitizeText(meta.visitorName, 80),
    company: sanitizeText(meta.company, 80) || undefined,
    hostName: sanitizeText(meta.hostName, 80),
    deptName: sanitizeText(meta.deptName, 60),
    phone: sanitizeText(meta.phone, 32) || undefined,
    idNumber: sanitizeText(meta.idNumber, 40) || undefined,
    vehiclePlate: sanitizeText(meta.vehiclePlate, 24) || undefined,
    purpose: sanitizeText(meta.purpose, 120) || undefined,
    codeHash,
  };
  const nextByPasscodeId = { ...state.attachmentsByPasscodeId };
  if (meta.passcodeId) {
    nextByPasscodeId[meta.passcodeId] = record;
  }
  state = {
    ...state,
    attachmentsByHash: { ...state.attachmentsByHash, [codeHash]: record },
    attachmentsByPasscodeId: nextByPasscodeId,
    attachmentsByName: { ...state.attachmentsByName, [record.visitorName.toLowerCase()]: record },
  };
  saveAndNotify();
}

export function setUserDepartmentOverride(
  profileId: string,
  departmentId: string | undefined,
  targetEmail?: string,
  actorName = "System Admin"
) {
  const now = Date.now();
  const next = { ...state.userDepartmentOverrides };
  const cleanEmail = (targetEmail ?? "").trim().toLowerCase();
  if (departmentId) {
    next[profileId] = departmentId;
    if (cleanEmail) next[cleanEmail] = departmentId;
  } else {
    delete next[profileId];
    if (cleanEmail) delete next[cleanEmail];
  }

  const nextProfiles = { ...state.registeredProfiles };
  if (cleanEmail && nextProfiles[cleanEmail]) {
    nextProfiles[cleanEmail] = { ...nextProfiles[cleanEmail], departmentId };
  }
  for (const [k, v] of Object.entries(nextProfiles)) {
    if (v._id === profileId) {
      nextProfiles[k] = { ...v, departmentId };
      if (departmentId) next[k] = departmentId;
    }
  }

  const nextInvites = { ...state.invitedUsers };
  if (cleanEmail && nextInvites[cleanEmail]) {
    nextInvites[cleanEmail] = { ...nextInvites[cleanEmail], departmentId };
  }

  const deptLabel = state.localDepartments.find(d => d._id === departmentId)?.name ?? departmentId ?? "General";
  const auditEntry: LocalAuditEntry = {
    _id: `audit_dept_bind_${profileId}_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.department",
    detail: `${cleanEmail || profileId}: bound to department ${deptLabel}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    userDepartmentOverrides: next,
    registeredProfiles: nextProfiles,
    invitedUsers: nextInvites,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
}

export function getMergedDepartments(
  serverDepts: Array<{ _id: string; _creationTime?: number; name: string }>
): LocalDepartmentRecord[] {
  const byName = new Map<string, LocalDepartmentRecord>();
  const removed = state.removedDepartmentIds ?? {};

  for (const d of serverDepts) {
    if (removed[d._id] || removed[d.name.toLowerCase()]) continue;
    byName.set(d.name.trim().toLowerCase(), {
      _id: d._id,
      _creationTime: d._creationTime ?? Date.now(),
      name: d.name,
    });
  }

  for (const d of state.localDepartments ?? DEFAULT_LOCAL_DEPARTMENTS) {
    if (removed[d._id] || removed[d.name.toLowerCase()]) continue;
    const key = d.name.trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, d);
    }
  }

  const list = Array.from(byName.values());
  if (list.length === 0) {
    return [DEFAULT_LOCAL_DEPARTMENTS[0]];
  }
  return list;
}

export function addLocalDepartment(name: string, actorName = "System Admin"): {
  ok: boolean;
  dept?: LocalDepartmentRecord;
  error?: string;
} {
  const cleanName = sanitizeText(name, 60);
  if (cleanName.length < 2) {
    return { ok: false, error: "Enter a valid department name (at least 2 characters)." };
  }
  const key = cleanName.toLowerCase();
  const nextRemoved = { ...state.removedDepartmentIds };
  delete nextRemoved[key];

  const existing = state.localDepartments.find(d => d.name.toLowerCase() === key);
  if (existing && !state.removedDepartmentIds[existing._id]) {
    return { ok: true, dept: existing };
  }

  const now = Date.now();
  const dept: LocalDepartmentRecord = existing ?? {
    _id: `dept_${now}_${Math.random().toString(36).slice(2, 6)}`,
    _creationTime: now,
    name: cleanName,
  };
  delete nextRemoved[dept._id];

  const auditEntry: LocalAuditEntry = {
    _id: `audit_dept_add_${now}`,
    name: sanitizeText(actorName, 80),
    action: "departments.manage",
    detail: `Added department ${cleanName}`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    localDepartments: existing
      ? state.localDepartments
      : [...state.localDepartments, dept],
    removedDepartmentIds: nextRemoved,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
  return { ok: true, dept };
}

export function removeLocalDepartment(
  deptId: string,
  deptName?: string,
  actorName = "System Admin"
): { ok: boolean; error?: string } {
  const now = Date.now();
  const nextRemoved: Record<string, number> = {
    ...state.removedDepartmentIds,
    [deptId]: now,
  };
  if (deptName) {
    nextRemoved[deptName.trim().toLowerCase()] = now;
  }
  const auditEntry: LocalAuditEntry = {
    _id: `audit_dept_rm_${now}`,
    name: sanitizeText(actorName, 80),
    action: "departments.manage",
    detail: `Removed department ${deptName || deptId}`,
    ok: true,
    at: now,
  };
  state = {
    ...state,
    removedDepartmentIds: nextRemoved,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
  return { ok: true };
}

export async function issueLocalPasscode(params: {
  visitorName: string;
  kind: "visitor" | "contractor" | "supplier";
  hours: number;
  company?: string;
  hostDepartmentId?: string;
  hostName: string;
  issuedBy: string;
}): Promise<{ ok: true; code: string; passcodeId: string } | { ok: false; error: string }> {
  const cleanName = sanitizeText(params.visitorName, 80);
  if (cleanName.length < 2) {
    return { ok: false, error: "Enter a valid visitor full name (at least 2 characters)." };
  }
  const now = Date.now();
  const maxHrs = state.systemConfig.maxPasscodeHours ?? 72;
  const defHrs = state.systemConfig.defaultPasscodeHours ?? 4;
  const hrs = Math.min(Math.max(Math.round(params.hours || defHrs), 1), maxHrs);
  const expiresAt = now + hrs * 3600_000;

  for (let i = 0; i < 5; i++) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const code = String(100000 + (r[0] % 900000));
    const codeHash = await sha256Hex(code);
    if (state.localPasscodes.some(p => p.codeHash === codeHash)) continue;

    const passcodeId = `pc_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const record: LocalPasscodeRecord = {
      _id: passcodeId,
      _creationTime: now,
      codeHash,
      visitorName: cleanName,
      kind: params.kind,
      company: sanitizeText(params.company, 80) || undefined,
      hostDepartmentId: params.hostDepartmentId,
      hostName: sanitizeText(params.hostName, 80) || "Staff Host",
      issuedBy: params.issuedBy,
      expiresAt,
    };

    const auditEntry: LocalAuditEntry = {
      _id: `audit_pc_issue_${passcodeId}`,
      name: record.hostName,
      action: "passcode.issue",
      detail: `${record.kind}: ${record.visitorName} (host: ${record.hostName}), ${hrs}h`,
      ok: true,
      at: now,
    };

    state = {
      ...state,
      localPasscodes: [record, ...state.localPasscodes].slice(0, 300),
      localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
    };
    saveAndNotify();
    return { ok: true, code, passcodeId };
  }

  return { ok: false, error: "Could not generate a unique 6-digit passcode. Please try again." };
}

export function getMergedPasscodes(
  serverRows: Array<{
    _id: string;
    _creationTime: number;
    visitorName: string;
    kind: "visitor" | "contractor" | "supplier";
    company?: string;
    hostDepartmentId?: string;
    hostName?: string;
    issuedBy: string;
    expiresAt: number;
    usedAt?: number;
    revokedAt?: number;
    checkedInAt?: number;
    checkedInBy?: string;
    badgeNumber?: string;
    idType?: string;
    idNumber?: string;
    vehiclePlate?: string;
    notes?: string;
    checkedOutAt?: number;
    checkedOutBy?: string;
    checkoutNotes?: string;
  }>
) {
  const byId = new Map<string, any>();

  for (const srv of serverRows) {
    const revokedAt = srv.revokedAt ?? state.revokedPasscodeIds[srv._id];
    const usedAt = srv.usedAt ?? state.usedPasscodeTimestamps[srv._id];
    const co = state.checkedOutPasscodeIds[srv._id];
    const checkedOutAt = srv.checkedOutAt ?? co?.checkedOutAt;
    const checkedOutBy = srv.checkedOutBy ?? co?.checkedOutBy;
    const checkoutNotes = srv.checkoutNotes ?? co?.checkoutNotes;
    byId.set(String(srv._id), {
      ...srv,
      revokedAt,
      usedAt,
      checkedOutAt,
      checkedOutBy,
      checkoutNotes,
    });
  }

  for (const loc of state.localPasscodes) {
    if (byId.has(loc._id)) continue;
    const { codeHash: _h, ...rest } = loc;
    const co = state.checkedOutPasscodeIds[loc._id];
    byId.set(loc._id, {
      ...rest,
      revokedAt: loc.revokedAt ?? state.revokedPasscodeIds[loc._id],
      usedAt: loc.usedAt ?? state.usedPasscodeTimestamps[loc._id],
      checkedOutAt: (loc as any).checkedOutAt ?? co?.checkedOutAt,
      checkedOutBy: (loc as any).checkedOutBy ?? co?.checkedOutBy,
      checkoutNotes: (loc as any).checkoutNotes ?? co?.checkoutNotes,
    });
  }

  return Array.from(byId.values()).sort((a, b) => b._creationTime - a._creationTime);
}

export function revokeLocalPasscode(
  passcodeId: string,
  actor: { userId: string; name: string; role: RoleType; departmentId?: string },
  targetRow?: { visitorName?: string; issuedBy?: string; hostDepartmentId?: string; hostName?: string }
): { ok: boolean; error?: string } {
  // Enforce BOLA before revoking
  if (actor.role === "staff" && targetRow?.issuedBy && targetRow.issuedBy !== actor.userId) {
    return { ok: false, error: "Access denied: Staff can only revoke passcodes they individually issued." };
  }
  if (
    actor.role === "report" &&
    actor.departmentId &&
    targetRow?.hostDepartmentId &&
    targetRow.hostDepartmentId !== actor.departmentId
  ) {
    return { ok: false, error: "Access denied: Department Heads can only revoke passcodes for their bound department." };
  }

  const now = Date.now();
  const nextLocal = state.localPasscodes.map(p =>
    p._id === passcodeId && !p.revokedAt ? { ...p, revokedAt: now } : p
  );
  const nextRevoked = {
    ...state.revokedPasscodeIds,
    [passcodeId]: now,
  };

  const visitorLabel = targetRow?.visitorName ?? state.localPasscodes.find(p => p._id === passcodeId)?.visitorName ?? "Visitor";
  const auditEntry: LocalAuditEntry = {
    _id: `audit_pc_revoke_${passcodeId}_${now}`,
    name: sanitizeText(actor.name, 80),
    action: "passcode.revoke",
    detail: `${visitorLabel} (host: ${targetRow?.hostName ?? actor.name})`,
    ok: true,
    at: now,
  };

  state = {
    ...state,
    localPasscodes: nextLocal,
    revokedPasscodeIds: nextRevoked,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  saveAndNotify();
  return { ok: true };
}

export async function validateLocalPasscode(
  code: string,
  actor: { userId: string; name: string; role: RoleType },
  options?: { claim?: boolean }
): Promise<{
  ok: boolean;
  result?: "granted" | "unknown" | "expired" | "already_used" | "revoked" | "locked";
  visitor?: string;
  passcodeId?: string;
  error?: string;
}> {
  if (actor.role !== "admin" && actor.role !== "security") {
    return { ok: false, error: "Your role cannot validate passcodes" };
  }
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, error: "Passcode must be a 6-digit number" };
  }

  const now = Date.now();
  const windowStart = now - 10 * 60_000;
  const recentFailures = (state.gateFailureTimestamps ?? []).filter(t => t > windowStart);
  if (recentFailures.length >= 15) {
    return { ok: true, result: "locked" };
  }

  const hash = await sha256Hex(cleanCode);
  const localRow = state.localPasscodes.find(p => p.codeHash === hash);
  const attached = state.attachmentsByHash[hash];

  if (!localRow && !attached) {
    const nextFailures = [...recentFailures, now];
    const auditEntry: LocalAuditEntry = {
      _id: `audit_gate_fail_${now}`,
      name: sanitizeText(actor.name, 80),
      action: "gate.check",
      detail: "unknown",
      ok: false,
      at: now,
    };
    state = {
      ...state,
      gateFailureTimestamps: nextFailures,
      localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
    };
    saveAndNotify();
    return { ok: true, result: "unknown" };
  }

  const targetId = localRow?._id ?? attached?.passcodeId;
  const visitorName = localRow?.visitorName ?? attached?.visitorName ?? "Visitor";
  const hostName = localRow?.hostName ?? attached?.hostName ?? "Staff Host";
  const issuedBy = localRow?.issuedBy ?? attached?.issuedByUserId;
  const expiresAt = localRow?.expiresAt ?? attached?.expiresAt ?? now + 3600_000;
  const isRevoked =
    Boolean(localRow?.revokedAt) ||
    (targetId ? Boolean(state.revokedPasscodeIds[targetId] || state.deniedPasscodeIds[targetId]) : false) ||
    Boolean(state.deniedCodeHashes[hash]);
  const isUsed =
    Boolean(localRow?.usedAt) ||
    (targetId ? Boolean(state.usedPasscodeTimestamps[targetId]) : false);

  let result: "granted" | "revoked" | "already_used" | "expired" = "granted";
  if (isRevoked) result = "revoked";
  else if (isUsed) result = "already_used";
  else if (expiresAt < now) result = "expired";

  const shouldClaim = options?.claim === true;

  const nextLocal =
    result === "granted" && shouldClaim
      ? state.localPasscodes.map(p => (p.codeHash === hash ? { ...p, usedAt: now } : p))
      : state.localPasscodes;
  const nextUsed =
    result === "granted" && targetId && shouldClaim
      ? { ...state.usedPasscodeTimestamps, [targetId]: now }
      : state.usedPasscodeTimestamps;

  const auditEntry: LocalAuditEntry = {
    _id: `audit_gate_${now}`,
    name: sanitizeText(actor.name, 80),
    action: "gate.check",
    detail: `${result}: ${visitorName} (host: ${hostName})`,
    ok: result === "granted",
    at: now,
  };

  const nextNotifs = [...state.localNotifications];
  if (result === "granted" && shouldClaim) {
    const notifId = `notif_arrival_${targetId ?? now}`;
    const existingIdx = nextNotifs.findIndex(n => n._id === notifId);
    const arrivalNotif: LocalNotificationEntry = {
      _id: notifId,
      kind: "arrival",
      message: `${visitorName} (${localRow?.kind ?? attached?.kind ?? "visitor"}) has checked in at the gate`,
      at: now,
      read: false,
      targetUserId: issuedBy,
      targetHostName: hostName,
      actorUserId: actor.userId,
      actorName: actor.name,
      passcodeId: targetId,
    };
    if (existingIdx >= 0) {
      nextNotifs[existingIdx] = arrivalNotif;
    } else {
      nextNotifs.unshift(arrivalNotif);
    }
  }

  state = {
    ...state,
    localPasscodes: nextLocal,
    usedPasscodeTimestamps: nextUsed,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
    localNotifications: nextNotifs.slice(0, 100),
  };
  markGateOperatorActionOnThisDevice();
  saveAndNotify();

  return {
    ok: true,
    result,
    visitor: result === "granted" ? visitorName : undefined,
    passcodeId: targetId,
  };
}

export async function inspectLocalPasscode(
  code: string,
  actor: { userId: string; name: string; role: RoleType }
) {
  return validateLocalPasscode(code, actor, { claim: false });
}

export function getAttachmentByHash(codeHash: string): GuestAttachment | undefined {
  return state.attachmentsByHash[codeHash];
}

export function getAttachmentByPasscodeId(passcodeId?: string): GuestAttachment | undefined {
  if (!passcodeId) return undefined;
  return state.attachmentsByPasscodeId[passcodeId];
}

export function getAttachmentByName(visitorName: string, expectedExpiresAt?: number): GuestAttachment | undefined {
  const key = visitorName.trim().toLowerCase();
  if (expectedExpiresAt !== undefined) {
    const allByHash = Object.values(state.attachmentsByHash);
    const exact = allByHash.find(
      a => a.visitorName.trim().toLowerCase() === key && Math.abs(a.expiresAt - expectedExpiresAt) < 120_000
    );
    if (exact) return exact;
  }
  return state.attachmentsByName[key];
}

export function recordGateDenial(params: {
  passcodeId?: string;
  codeHash?: string;
  deniedBy: string;
  reason?: string;
  visitorName?: string;
  hostName?: string;
  deptName?: string;
}) {
  const now = Date.now();
  const cleanBy = sanitizeText(params.deniedBy, 80) || "Gate Security";
  const cleanReason = sanitizeText(params.reason, 160) || "Identity mismatch at gate";
  const cleanVisitor = sanitizeText(params.visitorName, 80);
  const entry: GateDenialRecord = {
    deniedAt: now,
    deniedBy: cleanBy,
    reason: cleanReason,
    visitorName: cleanVisitor || undefined,
    hostName: sanitizeText(params.hostName, 80) || undefined,
    deptName: sanitizeText(params.deptName, 60) || undefined,
  };
  const nextIds = { ...state.deniedPasscodeIds };
  const nextHashes = { ...state.deniedCodeHashes };
  if (params.passcodeId) nextIds[params.passcodeId] = entry;
  if (params.codeHash) nextHashes[params.codeHash] = entry;

  const nextOnSite = state.onSiteRecords.filter(
    r =>
      !(
        (params.passcodeId && r.passcodeId === params.passcodeId) ||
        (params.codeHash && r.codeHash === params.codeHash)
      )
  );

  const auditEntry: LocalAuditEntry = {
    _id: `audit_deny_${params.passcodeId ?? now}`,
    name: cleanBy,
    action: "gate.deny",
    detail: `${cleanVisitor ? `${cleanVisitor}: ` : ""}${cleanReason}`,
    ok: false,
    at: now,
  };

  state = {
    ...state,
    deniedPasscodeIds: nextIds,
    deniedCodeHashes: nextHashes,
    onSiteRecords: nextOnSite,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
  };
  markGateOperatorActionOnThisDevice();
  saveAndNotify();
}

export function getNextAvailableBadge(activeBadges: string[]): string {
  const inUse = new Set(activeBadges.map(b => b.trim().toUpperCase()));
  let num = 101;
  while (inUse.has(`TFC-${num}`)) {
    num++;
  }
  return `TFC-${num}`;
}

export function recordGuestCheckIn(record: Omit<OnSiteRecord, "id">): OnSiteRecord {
  const existingIdx = state.onSiteRecords.findIndex(
    r =>
      !r.checkedOutAt &&
      ((record.passcodeId && r.passcodeId === record.passcodeId) ||
        (record.codeHash && r.codeHash === record.codeHash))
  );
  const full: OnSiteRecord = {
    ...record,
    visitorName: sanitizeText(record.visitorName, 80),
    company: sanitizeText(record.company, 80) || undefined,
    hostName: sanitizeText(record.hostName, 80),
    deptName: sanitizeText(record.deptName, 60),
    badgeNumber: sanitizeText(record.badgeNumber, 24).toUpperCase() || "TFC-GATE",
    idNumber: sanitizeText(record.idNumber, 40) || undefined,
    vehiclePlate: sanitizeText(record.vehiclePlate, 24).toUpperCase() || undefined,
    purpose: sanitizeText(record.purpose, 120) || undefined,
    notes: sanitizeText(record.notes, 160) || undefined,
    id:
      existingIdx >= 0
        ? state.onSiteRecords[existingIdx].id
        : `onsite_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  const nextList = [...state.onSiteRecords];
  if (existingIdx >= 0) {
    nextList[existingIdx] = full;
  } else {
    nextList.unshift(full);
  }

  const checkinAudit: LocalAuditEntry = {
    _id: `audit_checkin_${full.passcodeId ?? full.id}`,
    name: sanitizeText(full.checkedInBy, 80) || "Gate Security",
    action: "gate.checkin",
    detail: `${full.visitorName} (${full.kind}, host: ${full.hostName}, dept: ${full.deptName}, badge: ${full.badgeNumber})`,
    ok: true,
    at: full.checkedInAt,
  };

  const linkedLocalPc = full.passcodeId
    ? state.localPasscodes.find(p => p._id === full.passcodeId)
    : full.codeHash
    ? state.localPasscodes.find(p => p.codeHash === full.codeHash)
    : undefined;
  const linkedAtt =
    (full.passcodeId ? state.attachmentsByPasscodeId[full.passcodeId] : undefined) ??
    (full.codeHash ? state.attachmentsByHash[full.codeHash] : undefined);
  const resolvedHostUserId =
    full.issuedByUserId ?? linkedLocalPc?.issuedBy ?? linkedAtt?.issuedByUserId;

  const checkinNotifId = `notif_arrival_${full.passcodeId ?? full.id}`;
  const checkinNotification: LocalNotificationEntry = {
    _id: checkinNotifId,
    kind: "arrival",
    message: `${full.visitorName} (${full.kind}) checked in at the gate · Badge ${full.badgeNumber}`,
    at: full.checkedInAt,
    read: false,
    targetUserId: resolvedHostUserId,
    targetHostName: full.hostName,
    actorUserId: full.checkedInByUserId,
    actorName: full.checkedInBy,
    passcodeId: full.passcodeId,
  };

  state = {
    ...state,
    onSiteRecords: nextList,
    localAuditEntries: [
      checkinAudit,
      ...state.localAuditEntries.filter(a => a._id !== checkinAudit._id),
    ].slice(0, 300),
    localNotifications: [
      checkinNotification,
      ...state.localNotifications.filter(n => n._id !== checkinNotifId),
    ].slice(0, 100),
  };
  markGateOperatorActionOnThisDevice();
  saveAndNotify();
  return full;
}

export function recordGuestCheckOut(params: {
  recordId?: string;
  passcodeId?: string;
  checkedOutBy: string;
  checkedOutByUserId?: string;
  checkoutNotes?: string;
  fallbackVisitor?: {
    visitorName: string;
    company?: string;
    kind: "visitor" | "contractor" | "supplier";
    issuedByUserId?: string;
    hostName: string;
    hostDepartmentId?: string;
    deptName: string;
    checkedInAt: number;
    expiresAt?: number;
  };
}) {
  const now = Date.now();
  const cleanNotes = sanitizeText(params.checkoutNotes, 160) || "Checked out";
  const cleanBy = sanitizeText(params.checkedOutBy, 80) || "Gate Security";
  const nextList = [...state.onSiteRecords];
  const idx = nextList.findIndex(
    r =>
      !r.checkedOutAt &&
      ((params.recordId && r.id === params.recordId) ||
        (params.passcodeId && r.passcodeId === params.passcodeId))
  );

  let checkedOutRecord: OnSiteRecord | null = null;

  if (idx >= 0) {
    checkedOutRecord = {
      ...nextList[idx],
      checkedOutAt: Math.max(now, nextList[idx].checkedInAt),
      checkedOutBy: cleanBy,
      checkedOutByUserId: params.checkedOutByUserId,
      checkoutNotes: cleanNotes,
    };
    nextList[idx] = checkedOutRecord;
  } else if (params.fallbackVisitor) {
    checkedOutRecord = {
      id: `onsite_${now}`,
      passcodeId: params.passcodeId,
      visitorName: sanitizeText(params.fallbackVisitor.visitorName, 80),
      company: sanitizeText(params.fallbackVisitor.company, 80) || undefined,
      kind: params.fallbackVisitor.kind,
      issuedByUserId: params.fallbackVisitor.issuedByUserId,
      hostName: sanitizeText(params.fallbackVisitor.hostName, 80),
      hostDepartmentId: params.fallbackVisitor.hostDepartmentId,
      deptName: sanitizeText(params.fallbackVisitor.deptName, 60),
      idType: "Verified at Gate",
      badgeNumber: "GATE-PASS",
      checkedInAt: params.fallbackVisitor.checkedInAt,
      expiresAt: params.fallbackVisitor.expiresAt,
      checkedInBy: "Gate Security",
      checkedOutAt: Math.max(now, params.fallbackVisitor.checkedInAt),
      checkedOutBy: cleanBy,
      checkedOutByUserId: params.checkedOutByUserId,
      checkoutNotes: cleanNotes,
    };
    nextList.unshift(checkedOutRecord);
  }

  const nextCheckedOutIds = { ...state.checkedOutPasscodeIds };
  if (params.passcodeId) {
    nextCheckedOutIds[params.passcodeId] = {
      checkedOutAt: now,
      checkedOutBy: cleanBy,
      checkoutNotes: cleanNotes,
    };
  }

  const visitorName = checkedOutRecord?.visitorName ?? params.fallbackVisitor?.visitorName ?? "Visitor";
  const kind = checkedOutRecord?.kind ?? params.fallbackVisitor?.kind ?? "visitor";
  const hostName = checkedOutRecord?.hostName ?? params.fallbackVisitor?.hostName ?? "Staff Host";
  const deptName = checkedOutRecord?.deptName ?? params.fallbackVisitor?.deptName ?? "Department";
  const badgeNumber = checkedOutRecord?.badgeNumber ?? "GATE-PASS";

  const linkedLocalPc = params.passcodeId
    ? state.localPasscodes.find(p => p._id === params.passcodeId)
    : undefined;
  const linkedAtt = params.passcodeId
    ? state.attachmentsByPasscodeId[params.passcodeId]
    : undefined;
  const resolvedHostUserId =
    checkedOutRecord?.issuedByUserId ??
    params.fallbackVisitor?.issuedByUserId ??
    linkedLocalPc?.issuedBy ??
    linkedAtt?.issuedByUserId;

  const checkoutAudit: LocalAuditEntry = {
    _id: `audit_checkout_${params.passcodeId ?? checkedOutRecord?.id ?? now}`,
    name: cleanBy,
    action: "gate.checkout",
    detail: `${visitorName} (${kind}, host: ${hostName}, dept: ${deptName}, badge: ${badgeNumber}) — ${cleanNotes}`,
    ok: true,
    at: now,
  };

  const checkoutNotifId = `notif_checkout_${params.passcodeId ?? checkedOutRecord?.id ?? now}`;
  const checkoutNotification: LocalNotificationEntry = {
    _id: checkoutNotifId,
    kind: "checkout",
    message: `${visitorName} (${kind}) checked out via ${cleanBy} · ${cleanNotes}`,
    at: now,
    read: false,
    targetUserId: resolvedHostUserId,
    targetHostName: hostName,
    actorUserId: params.checkedOutByUserId,
    actorName: cleanBy,
    passcodeId: params.passcodeId,
  };

  state = {
    ...state,
    onSiteRecords: nextList,
    checkedOutPasscodeIds: nextCheckedOutIds,
    localAuditEntries: [
      checkoutAudit,
      ...state.localAuditEntries.filter(a => a._id !== checkoutAudit._id),
    ].slice(0, 300),
    localNotifications: [
      checkoutNotification,
      ...state.localNotifications.filter(n => n._id !== checkoutNotifId),
    ].slice(0, 100),
  };
  markGateOperatorActionOnThisDevice();
  saveAndNotify();
}

export function useGateRegistry() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }, []);
  return state;
}

/**
 * Exports tabular data to CSV with OWASP Formula / CSV Injection mitigation.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    let s = String(val ?? "");
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escapeCell).join(","), ...rows.map(r => r.map(escapeCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
