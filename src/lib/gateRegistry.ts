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
 * Per-session cryptographic anti-CSRF token (256-bit) stored in sessionStorage.
 */
const CSRF_STORAGE_KEY = "tfsecure_csrf_token_v1";

export function getCsrfToken(): string {
  try {
    const existing = sessionStorage.getItem(CSRF_STORAGE_KEY);
    if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
    return token;
  } catch {
    return "fallback_same_origin_csrf_token";
  }
}

export function verifyCsrfToken(submittedToken: string | null | undefined): boolean {
  if (!submittedToken) return false;
  const expected = getCsrfToken();
  if (submittedToken.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= submittedToken.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
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
    getOrCreateAudioContext();
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true, once: true });
  window.addEventListener("keydown", unlockAudio, { passive: true, once: true });
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
  if (!options?.force && nowMs - lastChimeAt < 550) return;
  lastChimeAt = nowMs;

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

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
  expiresAt?: number;
  checkedOutAt?: number;
  checkedOutBy?: string;
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

export type SystemConfig = {
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
  bannerTitle: "SECURITY • ACCESS CONTROL MANAGEMENT",
  customLogoUrl: undefined,
  loginBackgroundMode: "checkpoint",
  customLoginBgUrl: undefined,
  workspaceBackgroundMode: "facility",
  customWorkspaceBgUrl: undefined,
  siteCapacityLimit: 100,
  requireAdminApproval: true,
  autoFlagOverstays: true,
  systemVersion: "2.4.0",
  releaseChannel: "Production",
  lastUpdatedAt: Date.now(),
  lastBackupAt: undefined,
};

type RegistryState = {
  attachmentsByHash: Record<string, GuestAttachment>;
  attachmentsByPasscodeId: Record<string, GuestAttachment>;
  attachmentsByName: Record<string, GuestAttachment>;
  onSiteRecords: OnSiteRecord[];
  checkedOutPasscodeIds: Record<string, { checkedOutAt: number; checkedOutBy: string; checkoutNotes?: string }>;
  deniedPasscodeIds: Record<string, GateDenialRecord>;
  deniedCodeHashes: Record<string, GateDenialRecord>;
  userDepartmentOverrides: Record<string, string>;
  userRoleOverrides: Record<string, RoleType>;
  bootstrapAdminEmail?: string;
  bootstrapAdminProfileId?: string;
  invitedUsers: Record<string, InvitedUserRecord>;
  pendingApprovalEmails: Record<string, number>;
  approvedUserKeys: Record<string, number>;
  localAuditEntries: LocalAuditEntry[];
  localNotifications: LocalNotificationEntry[];
  systemConfig: SystemConfig;
};

const REGISTRY_KEY = "tf_commodities_gate_registry_v1";
const IMG_LOGO_KEY = "tfsecure_custom_logo_v1";
const IMG_LOGIN_BG_KEY = "tfsecure_custom_login_bg_v1";
const IMG_WORKSPACE_BG_KEY = "tfsecure_custom_workspace_bg_v1";

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
      return {
        attachmentsByHash: parsed.attachmentsByHash ?? {},
        attachmentsByPasscodeId: parsed.attachmentsByPasscodeId ?? {},
        attachmentsByName: parsed.attachmentsByName ?? {},
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
        invitedUsers: parsed.invitedUsers ?? {},
        pendingApprovalEmails: parsed.pendingApprovalEmails ?? {},
        approvedUserKeys: parsed.approvedUserKeys ?? {},
        localAuditEntries: parsed.localAuditEntries ?? [],
        localNotifications: parsed.localNotifications ?? [],
        systemConfig: {
          ...DEFAULT_SYSTEM_CONFIG,
          ...rawCfg,
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
    onSiteRecords: [],
    checkedOutPasscodeIds: {},
    deniedPasscodeIds: {},
    deniedCodeHashes: {},
    userDepartmentOverrides: {},
    userRoleOverrides: {},
    bootstrapAdminEmail: undefined,
    bootstrapAdminProfileId: undefined,
    invitedUsers: {},
    pendingApprovalEmails: {},
    approvedUserKeys: {},
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
  subscribers.forEach(fn => fn());
}

/**
 * Guarantees the first account in the workspace is automatically promoted to System Admin
 * and approved, and also applies pre-approved invitations for invited Admin / Staff accounts.
 */
export function ensureFirstAccountAndInvites(profile: {
  _id: string;
  email: string;
  name: string;
  role: string;
}) {
  const cleanEmail = profile.email.trim().toLowerCase();
  let changed = false;
  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys };
  const nextRoles = { ...state.userRoleOverrides };
  const nextDepts = { ...state.userDepartmentOverrides };
  let nextBootstrapEmail = state.bootstrapAdminEmail;
  let nextBootstrapId = state.bootstrapAdminProfileId;

  // 1. If no bootstrap System Admin is registered yet, or this profile IS the bootstrap admin / server admin:
  if (
    !nextBootstrapEmail ||
    nextBootstrapEmail === cleanEmail ||
    nextBootstrapId === profile._id ||
    profile.role === "admin"
  ) {
    if (!nextBootstrapEmail) {
      nextBootstrapEmail = cleanEmail;
      changed = true;
    }
    if (!nextBootstrapId) {
      nextBootstrapId = profile._id;
      changed = true;
    }
    if (nextRoles[profile._id] !== "admin") {
      nextRoles[profile._id] = "admin";
      changed = true;
    }
    if (nextPending[cleanEmail]) {
      delete nextPending[cleanEmail];
      changed = true;
    }
    if (!nextApproved[profile._id] || !nextApproved[cleanEmail]) {
      nextApproved[profile._id] = Date.now();
      nextApproved[cleanEmail] = Date.now();
      changed = true;
    }
  }

  // 2. If this user's email was invited by the System Admin, apply their invited role, department, and approval:
  const invite = state.invitedUsers[cleanEmail];
  if (invite) {
    if (!nextRoles[profile._id]) {
      nextRoles[profile._id] = invite.role;
      changed = true;
    }
    if (invite.departmentId && !nextDepts[profile._id]) {
      nextDepts[profile._id] = invite.departmentId;
      changed = true;
    }
    if (nextPending[cleanEmail]) {
      delete nextPending[cleanEmail];
      changed = true;
    }
    if (!nextApproved[profile._id] || !nextApproved[cleanEmail]) {
      nextApproved[profile._id] = Date.now();
      nextApproved[cleanEmail] = Date.now();
      changed = true;
    }
  }

  if (changed) {
    state = {
      ...state,
      bootstrapAdminEmail: nextBootstrapEmail,
      bootstrapAdminProfileId: nextBootstrapId,
      userRoleOverrides: nextRoles,
      userDepartmentOverrides: nextDepts,
      pendingApprovalEmails: nextPending,
      approvedUserKeys: nextApproved,
    };
    saveAndNotify();
  }
}

export function getEffectiveRole(profile: {
  _id: string;
  email: string;
  role: string;
}): RoleType {
  const cleanEmail = profile.email.trim().toLowerCase();
  if (
    profile.role === "admin" ||
    state.bootstrapAdminProfileId === profile._id ||
    (cleanEmail && state.bootstrapAdminEmail === cleanEmail)
  ) {
    if (state.userRoleOverrides[profile._id]) {
      return state.userRoleOverrides[profile._id];
    }
    return "admin";
  }
  if (state.userRoleOverrides[profile._id]) {
    return state.userRoleOverrides[profile._id];
  }
  if (cleanEmail && state.invitedUsers[cleanEmail]) {
    return state.invitedUsers[cleanEmail].role;
  }
  return (profile.role as RoleType) || "staff";
}

export function setUserRoleOverride(
  profileId: string,
  role: RoleType,
  actorName = "System Admin",
  targetEmail = ""
) {
  const now = Date.now();
  const auditEntry: LocalAuditEntry = {
    _id: `audit_role_${profileId}_${now}`,
    name: sanitizeText(actorName, 80),
    action: "users.role",
    detail: `${targetEmail ? `${targetEmail}: ` : ""}role set to ${role}`,
    ok: true,
    at: now,
  };
  state = {
    ...state,
    userRoleOverrides: { ...state.userRoleOverrides, [profileId]: role },
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

  const nextPending = { ...state.pendingApprovalEmails };
  delete nextPending[cleanEmail];
  const nextApproved = { ...state.approvedUserKeys, [cleanEmail]: now };

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
    message: `Admin invitation issued for ${cleanName} (${cleanEmail}) — Role: ${params.role.toUpperCase()}`,
    at: now,
    read: false,
  };

  state = {
    ...state,
    invitedUsers: { ...state.invitedUsers, [cleanEmail]: record },
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
    localNotifications: [notifEntry, ...state.localNotifications].slice(0, 100),
  };
  saveAndNotify();
  playNotificationDingDong();
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

export function runSystemUpdateCheck(actorName = "System Admin", targetChannel?: SystemConfig["releaseChannel"]) {
  const now = Date.now();
  const channel = targetChannel ?? state.systemConfig.releaseChannel;
  const nextConfig: SystemConfig = {
    ...state.systemConfig,
    releaseChannel: channel,
    systemVersion: "2.4.2",
    lastUpdatedAt: now,
  };
  const auditEntry: LocalAuditEntry = {
    _id: `audit_sysupdate_${now}`,
    name: sanitizeText(actorName, 80),
    action: "system.update",
    detail: `Verified & updated system runtime to v${nextConfig.systemVersion} (${channel} channel)`,
    ok: true,
    at: now,
  };
  const notifEntry: LocalNotificationEntry = {
    _id: `notif_sysupdate_${now}`,
    kind: "security",
    message: `System updated to v${nextConfig.systemVersion} (${channel}) by ${actorName}`,
    at: now,
    read: false,
  };
  state = {
    ...state,
    systemConfig: nextConfig,
    localAuditEntries: [auditEntry, ...state.localAuditEntries].slice(0, 300),
    localNotifications: [notifEntry, ...state.localNotifications].slice(0, 100),
  };
  saveAndNotify();
  playNotificationDingDong();
  return nextConfig;
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
  playNotificationDingDong();
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
      onSiteRecords: restoredOnSite,
      checkedOutPasscodeIds: source.checkedOutPasscodeIds ?? state.checkedOutPasscodeIds,
      deniedPasscodeIds: source.deniedPasscodeIds ?? state.deniedPasscodeIds,
      deniedCodeHashes: source.deniedCodeHashes ?? state.deniedCodeHashes,
      userDepartmentOverrides: source.userDepartmentOverrides ?? state.userDepartmentOverrides,
      userRoleOverrides: source.userRoleOverrides ?? state.userRoleOverrides,
      bootstrapAdminEmail: source.bootstrapAdminEmail ?? state.bootstrapAdminEmail,
      bootstrapAdminProfileId: source.bootstrapAdminProfileId ?? state.bootstrapAdminProfileId,
      invitedUsers: source.invitedUsers ?? state.invitedUsers,
      pendingApprovalEmails: source.pendingApprovalEmails ?? state.pendingApprovalEmails,
      approvedUserKeys: source.approvedUserKeys ?? state.approvedUserKeys,
      localAuditEntries: [restoreAudit, ...restoredAudits].slice(0, 300),
      localNotifications: Array.isArray(source.localNotifications) ? source.localNotifications : state.localNotifications,
      systemConfig: {
        ...DEFAULT_SYSTEM_CONFIG,
        ...(source.systemConfig ?? state.systemConfig),
        lastUpdatedAt: now,
      },
    };
    saveAndNotify();
    playNotificationDingDong();
    return {
      ok: true,
      summary: `Restored ${restoredOnSite.length} gate records, ${Object.keys(state.invitedUsers).length} invitations, and system configuration.`,
    };
  } catch {
    return { ok: false, error: "Could not parse backup JSON file. Ensure it is a valid TFsecure backup." };
  }
}

export function markAllLocalNotificationsRead() {
  if (!state.localNotifications.some(n => !n.read)) return;
  state = {
    ...state,
    localNotifications: state.localNotifications.map(n => ({ ...n, read: true })),
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

export function markEmailPendingApproval(email: string) {
  const key = email.trim().toLowerCase();
  if (!key) return;
  const now = Date.now();

  // First account on the system becomes System Admin automatically and is immediately approved
  if (!state.bootstrapAdminEmail || state.bootstrapAdminEmail === key) {
    state = {
      ...state,
      bootstrapAdminEmail: key,
      approvedUserKeys: { ...state.approvedUserKeys, [key]: now },
    };
    saveAndNotify();
    return;
  }

  // Invited users (e.g. invited Admin users) or when requireAdminApproval is disabled are immediately approved
  if (state.invitedUsers[key] || !state.systemConfig.requireAdminApproval) {
    state = {
      ...state,
      approvedUserKeys: { ...state.approvedUserKeys, [key]: now },
    };
    saveAndNotify();
    return;
  }

  const nextPending = { ...state.pendingApprovalEmails, [key]: now };
  const nextApproved = { ...state.approvedUserKeys };
  delete nextApproved[key];
  state = {
    ...state,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
  };
  saveAndNotify();
}

export function approveUserAccount(profileId: string, email?: string) {
  const now = Date.now();
  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys, [profileId]: now };
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    delete nextPending[cleanEmail];
    nextApproved[cleanEmail] = now;
  }
  state = {
    ...state,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
  };
  saveAndNotify();
  playNotificationDingDong();
}

export function revokeUserApproval(profileId: string, email?: string) {
  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys };
  delete nextApproved[profileId];
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    delete nextApproved[cleanEmail];
    nextPending[cleanEmail] = Date.now();
  }
  state = {
    ...state,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
  };
  saveAndNotify();
}

export function isProfileApproved(profile: {
  _id: string;
  email: string;
  role: string;
  active?: boolean;
}): boolean {
  const cleanEmail = profile.email.trim().toLowerCase();
  const effectiveRole = getEffectiveRole(profile);

  // First account / System Admin or Invited user is approved unless explicitly deactivated by another admin
  if (
    effectiveRole === "admin" ||
    !state.bootstrapAdminEmail ||
    state.bootstrapAdminEmail === cleanEmail ||
    state.bootstrapAdminProfileId === profile._id ||
    !!state.invitedUsers[cleanEmail]
  ) {
    if (state.pendingApprovalEmails[cleanEmail] && state.bootstrapAdminEmail && state.bootstrapAdminEmail !== cleanEmail) {
      return false;
    }
    return true;
  }

  if (!state.systemConfig.requireAdminApproval) {
    return profile.active !== false;
  }

  if (profile.active === false) return false;
  if (state.approvedUserKeys[profile._id] || state.approvedUserKeys[cleanEmail]) {
    return true;
  }
  if (state.pendingApprovalEmails[cleanEmail]) {
    return false;
  }
  return profile.active === true;
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

export function setUserDepartmentOverride(profileId: string, departmentId: string | undefined) {
  const next = { ...state.userDepartmentOverrides };
  if (departmentId) {
    next[profileId] = departmentId;
  } else {
    delete next[profileId];
  }
  state = {
    ...state,
    userDepartmentOverrides: next,
  };
  saveAndNotify();
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
  saveAndNotify();
  playNotificationDingDong();
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

  state = {
    ...state,
    onSiteRecords: nextList,
    localAuditEntries: [
      checkinAudit,
      ...state.localAuditEntries.filter(a => a._id !== checkinAudit._id),
    ].slice(0, 300),
  };
  saveAndNotify();
  playNotificationDingDong();
  return full;
}

export function recordGuestCheckOut(params: {
  recordId?: string;
  passcodeId?: string;
  checkedOutBy: string;
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

  const checkoutAudit: LocalAuditEntry = {
    _id: `audit_checkout_${params.passcodeId ?? checkedOutRecord?.id ?? now}`,
    name: cleanBy,
    action: "gate.checkout",
    detail: `${visitorName} (${kind}, host: ${hostName}, dept: ${deptName}, badge: ${badgeNumber}) — ${cleanNotes}`,
    ok: true,
    at: now,
  };

  const checkoutNotification: LocalNotificationEntry = {
    _id: `notif_checkout_${params.passcodeId ?? now}`,
    kind: "checkout",
    message: `${visitorName} (${kind}) checked out via ${cleanBy} · ${cleanNotes}`,
    at: now,
    read: false,
    targetUserId: checkedOutRecord?.issuedByUserId ?? params.fallbackVisitor?.issuedByUserId,
  };

  state = {
    ...state,
    onSiteRecords: nextList,
    checkedOutPasscodeIds: nextCheckedOutIds,
    localAuditEntries: [
      checkoutAudit,
      ...state.localAuditEntries.filter(a => a._id !== checkoutAudit._id),
    ].slice(0, 300),
    localNotifications: [checkoutNotification, ...state.localNotifications].slice(0, 100),
  };
  saveAndNotify();
  playNotificationDingDong();
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
