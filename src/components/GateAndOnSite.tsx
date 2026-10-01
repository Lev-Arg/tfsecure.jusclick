import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ClipboardCheck,
  Delete,
  Download,
  LogOut,
  Printer,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import {
  downloadCsv,
  getAttachmentByHash,
  getAttachmentByName,
  recordGuestCheckIn,
  recordGuestCheckOut,
  sha256Hex,
  useGateRegistry,
} from "../lib/gateRegistry";

const fmt = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtTimeOnly = (t: number) =>
  new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.floor(ms / 60_000));
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
}

export type UnifiedOnSitePerson = {
  key: string;
  recordId?: string;
  passcodeId?: string;
  visitorName: string;
  company?: string;
  kind: "visitor" | "contractor" | "supplier";
  hostName: string;
  deptName: string;
  badgeNumber: string;
  idType: string;
  idNumber?: string;
  phone?: string;
  vehiclePlate?: string;
  purpose?: string;
  checkedInAt: number;
  checkedInBy: string;
  checkedOutAt?: number;
  checkedOutBy?: string;
  checkoutNotes?: string;
};

export function useUnifiedOnSiteList() {
  const passcodes = useQuery(api.passcodes.list) ?? [];
  const depts = useQuery(api.departments.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const me = useQuery(api.users.me);
  const registry = useGateRegistry();

  const deptName = (id?: string) => depts.find(d => d._id === id)?.name ?? "General";

  return useMemo(() => {
    const map = new Map<string, UnifiedOnSitePerson>();
    const userByUserId = new Map<string, { name: string; departmentId?: string }>();
    for (const u of users) {
      userByUserId.set(u.userId, { name: u.name, departmentId: u.departmentId });
    }
    if (me) {
      userByUserId.set(me.userId, { name: me.name, departmentId: me.departmentId });
    }

    for (const r of registry.onSiteRecords) {
      const k = r.passcodeId || r.id;
      const attached = getAttachmentByName(r.visitorName);
      map.set(k, {
        key: k,
        recordId: r.id,
        passcodeId: r.passcodeId,
        visitorName: r.visitorName,
        company: r.company,
        kind: r.kind,
        hostName: r.hostName || attached?.hostName || "Staff Host",
        deptName: r.deptName || "General",
        badgeNumber: r.badgeNumber,
        idType: r.idType,
        idNumber: r.idNumber,
        phone: r.phone,
        vehiclePlate: r.vehiclePlate,
        purpose: r.purpose,
        checkedInAt: r.checkedInAt,
        checkedInBy: r.checkedInBy,
        checkedOutAt: r.checkedOutAt,
        checkedOutBy: r.checkedOutBy,
        checkoutNotes: r.checkoutNotes,
      });
    }

    for (const p of passcodes) {
      if (!p.usedAt) continue;
      if (map.has(p._id)) continue;
      const attached = getAttachmentByName(p.visitorName);
      const issuer = userByUserId.get(p.issuedBy);
      const co = registry.checkedOutPasscodeIds[p._id];
      const resolvedHostName = (p as any).hostName || attached?.hostName || issuer?.name || "Staff Host";
      const resolvedDeptId = p.hostDepartmentId || issuer?.departmentId || attached?.hostDepartmentId;
      map.set(p._id, {
        key: p._id,
        passcodeId: p._id,
        visitorName: p.visitorName,
        company: p.company || attached?.company,
        kind: p.kind,
        hostName: resolvedHostName,
        deptName: resolvedDeptId ? deptName(resolvedDeptId) : attached?.deptName ?? "General",
        badgeNumber: "GATE-PASS",
        idType: "Passcode",
        idNumber: attached?.idNumber,
        phone: attached?.phone,
        vehiclePlate: attached?.vehiclePlate,
        purpose: attached?.purpose,
        checkedInAt: p.usedAt,
        checkedInBy: "Gate Security",
        checkedOutAt: co?.checkedOutAt,
        checkedOutBy: co?.checkedOutBy,
        checkoutNotes: co?.checkoutNotes,
      });
    }

    const all = Array.from(map.values()).sort((a, b) => b.checkedInAt - a.checkedInAt);
    return {
      activeOnSite: all.filter(x => !x.checkedOutAt),
      checkedOutHistory: all.filter(x => !!x.checkedOutAt),
      all,
    };
  }, [passcodes, depts, users, me, registry]);
}

type PendingCandidate = {
  code: string;
  codeHash: string;
  alreadyValidatedOnServer: boolean;
  passcodeId?: string;
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
  expiresAt?: number;
};

export function Gate({ operatorName, onNavigateOnSite }: { operatorName: string; onNavigateOnSite: () => void }) {
  const validate = useMutation(api.passcodes.validate);
  const passcodes = useQuery(api.passcodes.list) ?? [];
  const depts = useQuery(api.departments.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const me = useQuery(api.users.me);
  const { activeOnSite } = useUnifiedOnSiteList();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingGuest, setPendingGuest] = useState<PendingCandidate | null>(null);
  const [badgeInput, setBadgeInput] = useState("TFC-01");
  const [idTypeInput, setIdTypeInput] = useState("National ID");
  const [idNumberInput, setIdNumberInput] = useState("");
  const [vehicleInput, setVehicleInput] = useState("");
  const [guardNotes, setGuardNotes] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(true);

  const [banner, setBanner] = useState<{
    type: "granted" | "denied" | "pending";
    title: string;
    text: string;
    at: number;
  } | null>(null);

  const [checkoutConfirmKey, setCheckoutConfirmKey] = useState<string | null>(null);
  const [checkoutNote, setCheckoutNote] = useState("");

  const deptName = (id?: string) => depts.find(d => d._id === id)?.name ?? "General";
  const hostNameForIssuer = (issuedBy?: string) => {
    if (!issuedBy) return undefined;
    if (me && me.userId === issuedBy) return me.name;
    return users.find(u => u.userId === issuedBy)?.name;
  };

  const ERROR_MESSAGES: Record<string, string> = {
    unknown: "Unknown passcode.",
    expired: "Passcode expired.",
    already_used: "Passcode already used.",
    revoked: "Passcode revoked.",
    locked: "Gate locked for 10 minutes after 15 failed attempts.",
  };

  const handleInspectCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = code.trim();
    if (clean.length !== 6) return;

    setBusy(true);
    setBanner(null);
    setPendingGuest(null);

    try {
      const hash = await sha256Hex(clean);
      const localAttachment = getAttachmentByHash(hash);
      const now = Date.now();

      if (localAttachment) {
        const matchingRow =
          passcodes.find(
            p =>
              p.visitorName.trim().toLowerCase() === localAttachment.visitorName.trim().toLowerCase() &&
              Math.abs(p.expiresAt - localAttachment.expiresAt) < 120_000
          ) ??
          passcodes.find(
            p =>
              p.visitorName.trim().toLowerCase() === localAttachment.visitorName.trim().toLowerCase() &&
              !p.usedAt &&
              !p.revokedAt
          );

        if (matchingRow?.revokedAt) {
          setBanner({ type: "denied", title: "REVOKED", text: `${localAttachment.visitorName} passcode was revoked.`, at: now });
          return;
        }
        if (matchingRow?.usedAt) {
          setBanner({ type: "denied", title: "ALREADY USED", text: `Checked in at ${fmt(matchingRow.usedAt)}.`, at: now });
          return;
        }
        if (localAttachment.expiresAt < now) {
          setBanner({ type: "denied", title: "EXPIRED", text: `Expired at ${fmt(localAttachment.expiresAt)}.`, at: now });
          return;
        }

        const nextBadge = `TFC-${String(activeOnSite.length + 101)}`;
        setBadgeInput(nextBadge);
        setIdNumberInput(localAttachment.idNumber ?? "");
        setVehicleInput(localAttachment.vehiclePlate ?? "");
        setGuardNotes("");
        setIdentityConfirmed(true);
        setPendingGuest({
          code: clean,
          codeHash: hash,
          alreadyValidatedOnServer: false,
          passcodeId: matchingRow?._id,
          visitorName: localAttachment.visitorName,
          company: localAttachment.company || matchingRow?.company,
          kind: localAttachment.kind,
          hostName:
            localAttachment.hostName ||
            (matchingRow as any)?.hostName ||
            hostNameForIssuer(matchingRow?.issuedBy) ||
            "Staff Host",
          hostDepartmentId: localAttachment.hostDepartmentId || matchingRow?.hostDepartmentId,
          deptName: matchingRow?.hostDepartmentId ? deptName(matchingRow.hostDepartmentId) : localAttachment.deptName,
          phone: localAttachment.phone,
          idNumber: localAttachment.idNumber,
          vehiclePlate: localAttachment.vehiclePlate,
          purpose: localAttachment.purpose,
          expiresAt: matchingRow?.expiresAt ?? localAttachment.expiresAt,
        });
        return;
      }

      const r = await validate({ code: clean });
      if (!r.ok) {
        setBanner({ type: "denied", title: "ERROR", text: r.error, at: now });
        return;
      }

      if (r.result !== "granted") {
        setBanner({
          type: "denied",
          title: `DENIED (${r.result.toUpperCase()})`,
          text: ERROR_MESSAGES[r.result] ?? r.result,
          at: now,
        });
        setCode("");
        return;
      }

      const visitorName = r.visitor ?? "Guest";
      const row = passcodes.find(p => p.visitorName.toLowerCase() === visitorName.toLowerCase());
      const byName = getAttachmentByName(visitorName);
      const nextBadge = `TFC-${String(activeOnSite.length + 101)}`;
      setBadgeInput(nextBadge);
      setIdNumberInput(byName?.idNumber ?? "");
      setVehicleInput(byName?.vehiclePlate ?? "");
      setGuardNotes("");
      setIdentityConfirmed(true);

      setPendingGuest({
        code: clean,
        codeHash: hash,
        alreadyValidatedOnServer: true,
        passcodeId: row?._id,
        visitorName,
        company: row?.company ?? byName?.company,
        kind: row?.kind ?? byName?.kind ?? "visitor",
        hostName:
          (row as any)?.hostName ??
          byName?.hostName ??
          hostNameForIssuer(row?.issuedBy) ??
          operatorName,
        hostDepartmentId: row?.hostDepartmentId ?? byName?.hostDepartmentId,
        deptName: row?.hostDepartmentId ? deptName(row.hostDepartmentId) : byName?.deptName ?? "General",
        phone: byName?.phone,
        idNumber: byName?.idNumber,
        vehiclePlate: byName?.vehiclePlate,
        purpose: byName?.purpose,
        expiresAt: row?.expiresAt ?? byName?.expiresAt,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGuest) return;
    setBusy(true);
    try {
      if (!pendingGuest.alreadyValidatedOnServer) {
        const r = await validate({ code: pendingGuest.code });
        if (!r.ok || r.result !== "granted") {
          setBanner({
            type: "denied",
            title: "FAILED",
            text: !r.ok ? r.error : ERROR_MESSAGES[r.result] ?? r.result,
            at: Date.now(),
          });
          setPendingGuest(null);
          return;
        }
      }

      const now = Date.now();
      recordGuestCheckIn({
        passcodeId: pendingGuest.passcodeId,
        codeHash: pendingGuest.codeHash,
        visitorName: pendingGuest.visitorName,
        company: pendingGuest.company,
        kind: pendingGuest.kind,
        hostName: pendingGuest.hostName,
        hostDepartmentId: pendingGuest.hostDepartmentId,
        deptName: pendingGuest.deptName,
        phone: pendingGuest.phone,
        idType: idTypeInput,
        idNumber: idNumberInput.trim() || pendingGuest.idNumber,
        badgeNumber: badgeInput.trim() || "TFC-GATE",
        vehiclePlate: vehicleInput.trim() || pendingGuest.vehiclePlate,
        purpose: pendingGuest.purpose,
        notes: guardNotes.trim() || undefined,
        checkedInAt: now,
        checkedInBy: operatorName,
      });

      setBanner({
        type: "granted",
        title: "CHECKED IN",
        text: `${pendingGuest.visitorName} (Host: ${pendingGuest.hostName}) registered on site (${badgeInput}).`,
        at: now,
      });
      setPendingGuest(null);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleRejectMismatch = () => {
    if (!pendingGuest) return;
    setBanner({
      type: "denied",
      title: "DENIED",
      text: `Check-in cancelled for ${pendingGuest.visitorName}.`,
      at: Date.now(),
    });
    setPendingGuest(null);
    setCode("");
  };

  const appendDigit = (d: string) => {
    if (code.length < 6) setCode(code + d);
  };

  return (
    <>
      <div className="page-header">
        <h1>Gate Check</h1>
        <div className="page-header-actions">
          <button type="button" onClick={onNavigateOnSite}>
            <Users size={14} />
            <span>Persons on Site ({activeOnSite.length})</span>
          </button>
        </div>
      </div>

      {/* GUEST VERIFICATION DOSSIER */}
      {pendingGuest && (
        <section className="verification-dossier" aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardCheck size={18} style={{ color: "var(--sig)" }} />
              <h2 className="panel-title">Verify Guest Details</h2>
            </div>
            <span className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
              Code: {pendingGuest.code.slice(0, 3)} {pendingGuest.code.slice(3)}
            </span>
          </div>

          <div className="dossier-grid">
            <div>
              <div className="dossier-field-label">Guest Name</div>
              <div className="dossier-field-value">{pendingGuest.visitorName}</div>
            </div>
            <div>
              <div className="dossier-field-label">Company</div>
              <div className="dossier-field-value">{pendingGuest.company || "—"}</div>
            </div>
            <div>
              <div className="dossier-field-label">Type</div>
              <div className="dossier-field-value" style={{ textTransform: "capitalize" }}>
                {pendingGuest.kind}
              </div>
            </div>
            <div>
              <div className="dossier-field-label">Host Name</div>
              <div className="dossier-field-value">{pendingGuest.hostName}</div>
            </div>
            <div>
              <div className="dossier-field-label">Department</div>
              <div className="dossier-field-value">{pendingGuest.deptName}</div>
            </div>
            <div>
              <div className="dossier-field-label">Phone</div>
              <div className="dossier-field-value mono">{pendingGuest.phone || "—"}</div>
            </div>
            <div>
              <div className="dossier-field-label">ID / Vehicle</div>
              <div className="dossier-field-value mono">
                {pendingGuest.idNumber || pendingGuest.vehiclePlate
                  ? `${pendingGuest.idNumber ?? ""} ${pendingGuest.vehiclePlate ? `· ${pendingGuest.vehiclePlate}` : ""}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="dossier-field-label">Purpose</div>
              <div className="dossier-field-value">{pendingGuest.purpose || "—"}</div>
            </div>
            <div>
              <div className="dossier-field-label">Expires</div>
              <div className="dossier-field-value mono">
                {pendingGuest.expiresAt ? fmt(pendingGuest.expiresAt) : "—"}
              </div>
            </div>
          </div>

          <form onSubmit={handleCompleteCheckIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-grid">
              <div className="field-group">
                <label>ID Type</label>
                <select value={idTypeInput} onChange={e => setIdTypeInput(e.target.value)}>
                  <option value="National ID">National ID</option>
                  <option value="Driver's License">Driver's License</option>
                  <option value="Passport">Passport</option>
                  <option value="Company ID">Company ID</option>
                </select>
              </div>
              <div className="field-group">
                <label>ID Number</label>
                <input
                  className="mono"
                  value={idNumberInput}
                  onChange={e => setIdNumberInput(e.target.value)}
                  placeholder="ID number"
                />
              </div>
              <div className="field-group">
                <label>Badge</label>
                <input
                  className="mono"
                  value={badgeInput}
                  onChange={e => setBadgeInput(e.target.value)}
                  placeholder="TFC-101"
                  required
                />
              </div>
              <div className="field-group">
                <label>Vehicle Plate</label>
                <input
                  className="mono"
                  value={vehicleInput}
                  onChange={e => setVehicleInput(e.target.value)}
                  placeholder="Plate number"
                />
              </div>
              <div className="field-group">
                <label>Notes</label>
                <input
                  value={guardNotes}
                  onChange={e => setGuardNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={identityConfirmed}
                  onChange={e => setIdentityConfirmed(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span>Details match person at gate</span>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="danger-btn" onClick={handleRejectMismatch} disabled={busy}>
                  <XCircle size={15} />
                  <span>Deny</span>
                </button>
                <button type="submit" className="success-btn" disabled={busy || !identityConfirmed}>
                  <UserCheck size={15} />
                  <span>{busy ? "Saving…" : "Check-In"}</span>
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      <div className="gate-terminal-grid">
        {/* LEFT: PASSCODE KEYPAD */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Enter Passcode</h2>
          </div>

          <form onSubmit={handleInspectCode}>
            <div className="keypad-display">
              <div className="keypad-digits" aria-label="Entered passcode digits">
                {code.padEnd(6, "·")}
              </div>
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit passcode"
                aria-label="6-digit passcode input"
                style={{ width: "100%", textAlign: "center", marginTop: 6 }}
              />
            </div>

            <div className="keypad-grid" role="group" aria-label="Numeric keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
                <button key={d} type="button" className="keypad-btn" onClick={() => appendDigit(d)}>
                  {d}
                </button>
              ))}
              <button
                type="button"
                className="keypad-btn"
                onClick={() => {
                  setCode("");
                  setPendingGuest(null);
                }}
                style={{ fontSize: 13 }}
              >
                Clear
              </button>
              <button type="button" className="keypad-btn" onClick={() => appendDigit("0")}>
                0
              </button>
              <button
                type="button"
                className="keypad-btn"
                onClick={() => setCode(code.slice(0, -1))}
                aria-label="Backspace"
              >
                <Delete size={17} />
              </button>
            </div>

            <button
              className="pri"
              type="submit"
              disabled={busy || code.length !== 6}
              style={{ width: "100%", height: 42 }}
            >
              <ShieldCheck size={16} />
              <span>{busy ? "Checking…" : "Verify Passcode"}</span>
            </button>
          </form>

          {banner && (
            <div className={`gate-banner ${banner.type}`} role="status" aria-live="polite">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <strong style={{ fontSize: 13 }}>{banner.title}</strong>
                <span className="mono" style={{ fontSize: 11 }}>
                  {fmtTimeOnly(banner.at)}
                </span>
              </div>
              <p style={{ fontSize: 12.5 }}>{banner.text}</p>
            </div>
          )}
        </section>

        {/* RIGHT: PERSONS ON SITE */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Persons on Site ({activeOnSite.length})</h2>
            <button type="button" className="ghost-btn" onClick={onNavigateOnSite}>
              View All
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Host</th>
                  <th>Dept</th>
                  <th>Badge</th>
                  <th>Checked In</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeOnSite.slice(0, 10).map(person => (
                  <tr key={person.key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{person.visitorName}</div>
                      {person.company && <div className="meta-inline">{person.company}</div>}
                    </td>
                    <td>{person.hostName}</td>
                    <td>{person.deptName}</td>
                    <td className="mono">{person.badgeNumber}</td>
                    <td className="mono">{fmt(person.checkedInAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      {checkoutConfirmKey === person.key ? (
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input
                            value={checkoutNote}
                            onChange={e => setCheckoutNote(e.target.value)}
                            placeholder="Note"
                            style={{ height: 28, width: 100, fontSize: 12 }}
                          />
                          <button
                            type="button"
                            className="pri"
                            style={{ minHeight: 28, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              recordGuestCheckOut({
                                recordId: person.recordId,
                                passcodeId: person.passcodeId,
                                checkedOutBy: operatorName,
                                checkoutNotes: checkoutNote.trim() || "Checked out",
                                fallbackVisitor: {
                                  visitorName: person.visitorName,
                                  company: person.company,
                                  kind: person.kind,
                                  hostName: person.hostName,
                                  deptName: person.deptName,
                                  checkedInAt: person.checkedInAt,
                                },
                              });
                              setCheckoutConfirmKey(null);
                              setCheckoutNote("");
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            style={{ minHeight: 28, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              setCheckoutConfirmKey(null);
                              setCheckoutNote("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                          onClick={() => setCheckoutConfirmKey(person.key)}
                        >
                          <LogOut size={12} />
                          <span>Check-Out</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeOnSite.length === 0 && (
            <div className="empty-state">
              <p>No persons currently on site.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* ==================== PERSONS ON SITE MODULE ==================== */
export function PersonsOnSite({ operatorName, canManage }: { operatorName: string; canManage: boolean }) {
  const { activeOnSite, checkedOutHistory } = useUnifiedOnSiteList();
  const [view, setView] = useState<"active" | "departed">("active");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "visitor" | "contractor" | "supplier">("all");
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [exitRemarks, setExitRemarks] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const sourceList = view === "active" ? activeOnSite : checkedOutHistory;

  const filtered = useMemo(() => {
    return sourceList.filter(p => {
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          p.visitorName.toLowerCase().includes(q) ||
          (p.company ?? "").toLowerCase().includes(q) ||
          p.hostName.toLowerCase().includes(q) ||
          p.deptName.toLowerCase().includes(q) ||
          p.badgeNumber.toLowerCase().includes(q) ||
          (p.vehiclePlate ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [sourceList, kindFilter, search]);

  const exportRosterCsv = () => {
    downloadCsv(
      `persons-on-site-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Name",
        "Company",
        "Type",
        "Host Name",
        "Department",
        "Badge",
        "ID",
        "Vehicle",
        "Checked In",
        "Checked Out",
        "Status",
      ],
      filtered.map(p => [
        p.visitorName,
        p.company ?? "",
        p.kind,
        p.hostName,
        p.deptName,
        p.badgeNumber,
        `${p.idType}${p.idNumber ? ` (${p.idNumber})` : ""}`,
        p.vehiclePlate ?? "",
        new Date(p.checkedInAt).toISOString(),
        p.checkedOutAt ? new Date(p.checkedOutAt).toISOString() : "",
        p.checkedOutAt ? "Checked Out" : "On Site",
      ])
    );
  };

  return (
    <>
      <div className="page-header">
        <h1>Persons on Site</h1>
        <div className="page-header-actions">
          <button type="button" onClick={() => window.print()}>
            <Printer size={14} />
            <span>Print</span>
          </button>
          <button type="button" onClick={exportRosterCsv}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <section className="kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi-cell">
          <span className="kpi-label">On Site Now</span>
          <span className="kpi-value status-ok">{activeOnSite.length}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Visitors</span>
          <span className="kpi-value">{activeOnSite.filter(p => p.kind === "visitor").length}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Contractors & Suppliers</span>
          <span className="kpi-value">
            {activeOnSite.filter(p => p.kind === "contractor" || p.kind === "supplier").length}
          </span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Checked Out</span>
          <span className="kpi-value">{checkedOutHistory.length}</span>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar no-print">
          <div className="toolbar-group">
            <div className="segmented" role="group">
              <button type="button" aria-pressed={view === "active"} onClick={() => setView("active")}>
                On Site ({activeOnSite.length})
              </button>
              <button type="button" aria-pressed={view === "departed"} onClick={() => setView("departed")}>
                Checked Out ({checkedOutHistory.length})
              </button>
            </div>

            <div className="search-box">
              <Search size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search guest, host, company, badge…"
              />
            </div>
          </div>

          <div className="toolbar-group">
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value as any)}>
              <option value="all">All types</option>
              <option value="visitor">Visitor</option>
              <option value="contractor">Contractor</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Type</th>
                <th>Host Name</th>
                <th>Department</th>
                <th>Badge / ID</th>
                <th>Vehicle</th>
                <th>Checked In</th>
                <th>{view === "active" ? "Duration" : "Checked Out"}</th>
                {view === "active" && canManage && <th className="no-print" style={{ textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(person => (
                <tr key={person.key}>
                  <td style={{ fontWeight: 600 }}>
                    <div>{person.visitorName}</div>
                    {person.phone && <div className="meta-inline mono">{person.phone}</div>}
                  </td>
                  <td>{person.company || <span className="status-mute">—</span>}</td>
                  <td style={{ textTransform: "capitalize" }}>{person.kind}</td>
                  <td style={{ fontWeight: 500 }}>{person.hostName}</td>
                  <td>{person.deptName}</td>
                  <td>
                    <span className="mono" style={{ fontWeight: 600 }}>{person.badgeNumber}</span>
                    <div className="meta-inline">
                      {person.idType}
                      {person.idNumber ? ` · ${person.idNumber}` : ""}
                    </div>
                  </td>
                  <td className="mono">{person.vehiclePlate || <span className="status-mute">—</span>}</td>
                  <td className="mono">{fmt(person.checkedInAt)}</td>
                  <td className="mono">
                    {view === "active" ? (
                      <span className="status-ok">{formatDuration(now - person.checkedInAt)}</span>
                    ) : (
                      <span>{person.checkedOutAt ? fmt(person.checkedOutAt) : "—"}</span>
                    )}
                  </td>
                  {view === "active" && canManage && (
                    <td className="no-print" style={{ textAlign: "right" }}>
                      {checkoutKey === person.key ? (
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input
                            value={exitRemarks}
                            onChange={e => setExitRemarks(e.target.value)}
                            placeholder="Note"
                            style={{ height: 28, width: 120, fontSize: 12 }}
                          />
                          <button
                            type="button"
                            className="pri"
                            style={{ minHeight: 28, padding: "2px 10px", fontSize: 12 }}
                            onClick={() => {
                              recordGuestCheckOut({
                                recordId: person.recordId,
                                passcodeId: person.passcodeId,
                                checkedOutBy: operatorName,
                                checkoutNotes: exitRemarks.trim() || "Checked out",
                                fallbackVisitor: {
                                  visitorName: person.visitorName,
                                  company: person.company,
                                  kind: person.kind,
                                  hostName: person.hostName,
                                  deptName: person.deptName,
                                  checkedInAt: person.checkedInAt,
                                },
                              });
                              setCheckoutKey(null);
                              setExitRemarks("");
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            style={{ minHeight: 28, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => {
                              setCheckoutKey(null);
                              setExitRemarks("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCheckoutKey(person.key)}
                          style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                        >
                          <LogOut size={12} />
                          <span>Check-Out</span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <p>{view === "active" ? "No persons currently on site." : "No checked-out records."}</p>
          </div>
        )}
      </section>
    </>
  );
}
