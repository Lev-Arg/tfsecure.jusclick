import { useEffect, useState } from "react";

export type GuestAttachment = {
  passcodeId?: string;
  codeHash: string;
  visitorName: string;
  company?: string;
  kind: "visitor" | "contractor" | "supplier";
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
          hostName: r.hostName || "Staff Host",
        })),
        checkedOutPasscodeIds: parsed.checkedOutPasscodeIds ?? {},
        deniedPasscodeIds: parsed.deniedPasscodeIds ?? {},
        deniedCodeHashes: parsed.deniedCodeHashes ?? {},
        userDepartmentOverrides: parsed.userDepartmentOverrides ?? {},
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

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.trim()));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function registerIssuedPasscode(code: string, meta: Omit<GuestAttachment, "codeHash">) {
  const codeHash = await sha256Hex(code);
  const record: GuestAttachment = { ...meta, codeHash };
  const nextByPasscodeId = { ...state.attachmentsByPasscodeId };
  if (meta.passcodeId) {
    nextByPasscodeId[meta.passcodeId] = record;
  }
  state = {
    ...state,
    attachmentsByHash: { ...state.attachmentsByHash, [codeHash]: record },
    attachmentsByPasscodeId: nextByPasscodeId,
    attachmentsByName: { ...state.attachmentsByName, [meta.visitorName.trim().toLowerCase()]: record },
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
  // Prefer an exact passcode match by name + expiration proximity across all stored hash attachments
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
    deniedBy: params.deniedBy,
    reason: params.reason?.trim() || "Identity mismatch at gate",
  };
  const nextIds = { ...state.deniedPasscodeIds };
  const nextHashes = { ...state.deniedCodeHashes };
  if (params.passcodeId) nextIds[params.passcodeId] = entry;
  if (params.codeHash) nextHashes[params.codeHash] = entry;

  // Also ensure any active on-site record for this passcode is removed if it existed
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
    badgeNumber: record.badgeNumber.trim().toUpperCase() || "TFC-GATE",
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
    hostName: string;
    deptName: string;
    checkedInAt: number;
    expiresAt?: number;
  };
}) {
  const now = Date.now();
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
      checkedOutBy: params.checkedOutBy,
      checkoutNotes: params.checkoutNotes,
    };
  } else if (params.fallbackVisitor) {
    nextList.unshift({
      id: `onsite_${now}`,
      passcodeId: params.passcodeId,
      visitorName: params.fallbackVisitor.visitorName,
      company: params.fallbackVisitor.company,
      kind: params.fallbackVisitor.kind,
      hostName: params.fallbackVisitor.hostName,
      deptName: params.fallbackVisitor.deptName,
      idType: "Verified at Gate",
      badgeNumber: "GATE-PASS",
      checkedInAt: params.fallbackVisitor.checkedInAt,
      expiresAt: params.fallbackVisitor.expiresAt,
      checkedInBy: "Gate Security",
      checkedOutAt: Math.max(now, params.fallbackVisitor.checkedInAt),
      checkedOutBy: params.checkedOutBy,
      checkoutNotes: params.checkoutNotes,
    });
  }

  const nextCheckedOutIds = { ...state.checkedOutPasscodeIds };
  if (params.passcodeId) {
    nextCheckedOutIds[params.passcodeId] = {
      checkedOutAt: now,
      checkedOutBy: params.checkedOutBy,
      checkoutNotes: params.checkoutNotes,
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
    // Mitigate CSV Formula Injection (cells starting with =, +, -, @, tab, or CR)
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
