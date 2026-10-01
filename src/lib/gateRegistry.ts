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
  pendingApprovalEmails: Record<string, number>;
  approvedUserKeys: Record<string, number>;
};

const REGISTRY_KEY = "tf_commodities_gate_registry_v1";

function loadRegistry(): RegistryState {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
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
        pendingApprovalEmails: parsed.pendingApprovalEmails ?? {},
        approvedUserKeys: parsed.approvedUserKeys ?? {},
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
    pendingApprovalEmails: {},
    approvedUserKeys: {},
  };
}

let state: RegistryState = loadRegistry();
const subscribers = new Set<() => void>();

function saveAndNotify() {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  subscribers.forEach(fn => fn());
}

export function markEmailPendingApproval(email: string) {
  const key = email.trim().toLowerCase();
  if (!key) return;
  const nextPending = { ...state.pendingApprovalEmails, [key]: Date.now() };
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
  const nextPending = { ...state.pendingApprovalEmails };
  const nextApproved = { ...state.approvedUserKeys, [profileId]: Date.now() };
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    delete nextPending[cleanEmail];
    nextApproved[cleanEmail] = Date.now();
  }
  state = {
    ...state,
    pendingApprovalEmails: nextPending,
    approvedUserKeys: nextApproved,
  };
  saveAndNotify();
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
  if (profile.active === false) return false;
  if (profile.role === "admin") return true;
  const cleanEmail = profile.email.trim().toLowerCase();
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
}) {
  const entry: GateDenialRecord = {
    deniedAt: Date.now(),
    deniedBy: sanitizeText(params.deniedBy, 80),
    reason: sanitizeText(params.reason, 160) || "Identity mismatch at gate",
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

  state = {
    ...state,
    deniedPasscodeIds: nextIds,
    deniedCodeHashes: nextHashes,
    onSiteRecords: nextOnSite,
  };
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
  state = {
    ...state,
    onSiteRecords: nextList,
  };
  saveAndNotify();
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
  const cleanBy = sanitizeText(params.checkedOutBy, 80);
  const nextList = [...state.onSiteRecords];
  const idx = nextList.findIndex(
    r =>
      !r.checkedOutAt &&
      ((params.recordId && r.id === params.recordId) ||
        (params.passcodeId && r.passcodeId === params.passcodeId))
  );

  if (idx >= 0) {
    nextList[idx] = {
      ...nextList[idx],
      checkedOutAt: Math.max(now, nextList[idx].checkedInAt),
      checkedOutBy: cleanBy,
      checkoutNotes: cleanNotes,
    };
  } else if (params.fallbackVisitor) {
    nextList.unshift({
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
    });
  }

  const nextCheckedOutIds = { ...state.checkedOutPasscodeIds };
  if (params.passcodeId) {
    nextCheckedOutIds[params.passcodeId] = {
      checkedOutAt: now,
      checkedOutBy: cleanBy,
      checkoutNotes: cleanNotes,
    };
  }

  state = {
    ...state,
    onSiteRecords: nextList,
    checkedOutPasscodeIds: nextCheckedOutIds,
  };
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
