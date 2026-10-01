import { useEffect, useState } from "react";

export type GuestAttachment = {
  codeHash: string;
  visitorName: string;
  company?: string;
  kind: "visitor" | "contractor" | "supplier";
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
  checkedOutAt?: number;
  checkedOutBy?: string;
  checkoutNotes?: string;
};

type RegistryState = {
  attachmentsByHash: Record<string, GuestAttachment>;
  attachmentsByName: Record<string, GuestAttachment>;
  onSiteRecords: OnSiteRecord[];
  checkedOutPasscodeIds: Record<string, { checkedOutAt: number; checkedOutBy: string; checkoutNotes?: string }>;
};

const REGISTRY_KEY = "tf_commodities_gate_registry_v1";

function loadRegistry(): RegistryState {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        attachmentsByHash: parsed.attachmentsByHash ?? {},
        attachmentsByName: parsed.attachmentsByName ?? {},
        onSiteRecords: parsed.onSiteRecords ?? [],
        checkedOutPasscodeIds: parsed.checkedOutPasscodeIds ?? {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    attachmentsByHash: {},
    attachmentsByName: {},
    onSiteRecords: [],
    checkedOutPasscodeIds: {},
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
  state = {
    ...state,
    attachmentsByHash: { ...state.attachmentsByHash, [codeHash]: record },
    attachmentsByName: { ...state.attachmentsByName, [meta.visitorName.trim().toLowerCase()]: record },
  };
  saveAndNotify();
}

export function getAttachmentByHash(codeHash: string): GuestAttachment | undefined {
  return state.attachmentsByHash[codeHash];
}

export function getAttachmentByName(visitorName: string): GuestAttachment | undefined {
  return state.attachmentsByName[visitorName.trim().toLowerCase()];
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
    id: existingIdx >= 0 ? state.onSiteRecords[existingIdx].id : `onsite_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
    deptName: string;
    checkedInAt: number;
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
      checkedOutAt: now,
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
      deptName: params.fallbackVisitor.deptName,
      idType: "Verified at Gate",
      badgeNumber: "GATE-PASS",
      checkedInAt: params.fallbackVisitor.checkedInAt,
      checkedInBy: "Gate Security",
      checkedOutAt: now,
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

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
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
