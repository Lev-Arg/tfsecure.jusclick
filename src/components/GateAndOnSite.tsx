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
import type { Id } from "../../convex/_generated/dataModel";
import {
  downloadCsv,
  getCsrfToken,
  getNextAvailableBadge,
  sanitizeText,
  verifyCsrfToken,
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
  passcodeId: Id<"passcodes">;
  issuedByUserId?: string;
  hostDepartmentId?: string;
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
  expiresAt?: number;
  checkedOutAt?: number;
  checkedOutBy?: string;
  checkoutNotes?: string;
};

export function useUnifiedOnSiteList() {
  const remotePasscodes = useQuery(api.passcodes.list) ?? [];
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const me = useQuery(api.users.me);
  const passcodes = remotePasscodes;
  const depts = remoteDepts;

  const deptName = (id?: string) => depts.find(d => d._id === id)?.name ?? "General";

  return useMemo(() => {
    if (!me || me.active !== true) {
      return { activeOnSite: [], checkedOutHistory: [], all: [] };
    }

    const myDeptId = me.departmentId ?? depts[0]?._id;
    const onSite = passcodes.flatMap(p => {
      const checkedInAt = p.checkedInAt ?? p.usedAt;
      if (!checkedInAt || p.revokedAt) return [];
      return [{
        key: p._id,
        passcodeId: p._id,
        issuedByUserId: p.issuedBy,
        hostDepartmentId: p.hostDepartmentId,
        visitorName: p.visitorName,
        company: p.company,
        kind: p.kind,
        hostName: p.hostName ?? "Staff Host",
        deptName: p.hostDepartmentId ? deptName(p.hostDepartmentId) : "General",
        badgeNumber: p.badgeNumber ?? "GATE-PASS",
        idType: p.idType ?? "Passcode",
        idNumber: p.idNumber,
        phone: p.phone,
        vehiclePlate: p.vehiclePlate,
        purpose: p.purpose,
        checkedInAt,
        checkedInBy: p.checkedInBy ?? "Gate Security",
        expiresAt: p.expiresAt,
        checkedOutAt: p.checkedOutAt,
        checkedOutBy: p.checkedOutBy,
        checkoutNotes: p.checkoutNotes,
      } satisfies UnifiedOnSitePerson];
    });

    // Strict RBAC & BOLA Filtering:
    // - admin & security: see all department logs
    // - report (Department Head): see ONLY their bound department's records
    // - staff: see ONLY records belonging to their bound department AND individually issued by them
    const effectiveRole = me.role;
    const rawList = onSite.sort((a, b) => b.checkedInAt - a.checkedInAt);
    const scopedList = rawList.filter(item => {
      if (effectiveRole === "admin" || effectiveRole === "security") return true;
      const matchesMyDept = Boolean(myDeptId && item.hostDepartmentId === myDeptId);
      if (effectiveRole === "report") {
        return matchesMyDept;
      }
      // staff: must match both their individual userId and their bound department
      return item.issuedByUserId === me.userId && matchesMyDept;
    });

    return {
      activeOnSite: scopedList.filter(x => !x.checkedOutAt),
      checkedOutHistory: scopedList.filter(x => !!x.checkedOutAt),
      all: scopedList,
    };
  }, [passcodes, depts, me]);
}

type PendingCandidate = {
  passcodeId: Id<"passcodes">;
  issuedByUserId?: string;
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
  const inspectPasscode = useMutation(api.passcodes.inspect);
  const checkInMutation = useMutation(api.passcodes.checkIn);
  const checkOutMutation = useMutation(api.passcodes.checkOut);
  const reject = useMutation(api.passcodes.reject);
  const remotePasscodes = useQuery(api.passcodes.list) ?? [];
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const remoteUsers = useQuery(api.users.list) ?? [];
  const me = useQuery(api.users.me);
  const { activeOnSite } = useUnifiedOnSiteList();

  const passcodes = remotePasscodes;
  const depts = remoteDepts;
  const users = remoteUsers;

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingGuest, setPendingGuest] = useState<PendingCandidate | null>(null);
  const [badgeInput, setBadgeInput] = useState("TFC-101");
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

  // RBAC Guard: Only Admin and Security can operate the Gate Check terminal
  const effectiveRole = me?.role ?? "staff";
  if (me && (me.active !== true || (effectiveRole !== "admin" && effectiveRole !== "security"))) {
    return (
      <div className="panel">
        <p className="status-err">Access restricted to Security &amp; Administrators.</p>
      </div>
    );
  }

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
    if (!/^\d{6}$/.test(clean)) return;

    setBusy(true);
    setBanner(null);
    setPendingGuest(null);

    try {
      const now = Date.now();
      const r = await inspectPasscode({ code: clean });
      if (!r.ok) {
        setBanner({ type: "denied", title: "VALIDATION FAILED", text: r.error ?? "Server rejected validation", at: now });
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

      const serverPc = r.passcode;
      if (!serverPc) {
        setBanner({ type: "denied", title: "VALIDATION FAILED", text: "Server returned no passcode record.", at: now });
        return;
      }
      const nextBadge = getNextAvailableBadge(activeOnSite.map(p => p.badgeNumber));
      setBadgeInput(nextBadge);
      setIdNumberInput(serverPc.idNumber ?? "");
      setVehicleInput(serverPc.vehiclePlate ?? "");
      setGuardNotes("");
      setIdentityConfirmed(true);

      setPendingGuest({
        passcodeId: serverPc._id,
        issuedByUserId: serverPc.issuedBy,
        visitorName: serverPc.visitorName,
        company: serverPc.company,
        kind: serverPc.kind,
        hostName: serverPc.hostName ?? hostNameForIssuer(serverPc.issuedBy) ?? operatorName,
        hostDepartmentId: serverPc.hostDepartmentId,
        deptName: serverPc.hostDepartmentId ? deptName(serverPc.hostDepartmentId) : "General",
        phone: serverPc.phone,
        idNumber: serverPc.idNumber,
        vehiclePlate: serverPc.vehiclePlate,
        purpose: serverPc.purpose,
        expiresAt: serverPc.expiresAt,
      });
    } catch {
      setBanner({ type: "denied", title: "SERVER UNAVAILABLE", text: "Passcode was not validated. Check the connection and retry.", at: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGuest) return;

    const now = Date.now();
    const normalizedBadge = sanitizeText(badgeInput, 24).toUpperCase();
    if (!normalizedBadge) {
      setBanner({
        type: "denied",
        title: "BADGE REQUIRED",
        text: "Assign a physical visitor badge number before completing check-in.",
        at: now,
      });
      return;
    }

    setBusy(true);
    try {
      const result = await checkInMutation({
        passcodeId: pendingGuest.passcodeId,
        badgeNumber: normalizedBadge,
        idType: idTypeInput,
        idNumber: sanitizeText(idNumberInput, 40) || pendingGuest.idNumber,
        vehiclePlate: sanitizeText(vehicleInput, 24).toUpperCase() || pendingGuest.vehiclePlate,
        guardNotes: sanitizeText(guardNotes, 160) || undefined,
      });
      if (!result.ok) {
        setBanner({ type: "denied", title: "CHECK-IN REJECTED", text: result.error ?? "Server rejected check-in.", at: Date.now() });
        return;
      }

      const checkInTime = Date.now();
      setBanner({
        type: "granted",
        title: "CHECKED IN",
        text: `${pendingGuest.visitorName} (Host: ${pendingGuest.hostName}) registered on site (${normalizedBadge}).`,
        at: checkInTime,
      });
      setPendingGuest(null);
      setCode("");
    } catch {
      setBanner({ type: "denied", title: "SERVER UNAVAILABLE", text: "Check-in was not recorded. Retry when connected.", at: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const handleRejectMismatch = async () => {
    if (!pendingGuest) return;
    setBusy(true);
    try {
      const reason = sanitizeText(guardNotes, 160) || "Identity mismatch at gate";
      const result = await reject({ passcodeId: pendingGuest.passcodeId, reason });
      if (!result.ok) {
        setBanner({ type: "denied", title: "DENIAL NOT RECORDED", text: result.error ?? "Server rejected denial.", at: Date.now() });
        return;
      }
      setBanner({
        type: "denied",
        title: "DENIED AT GATE",
        text: `Entry denied for ${pendingGuest.visitorName} (${reason}). Passcode invalidated.`,
        at: Date.now(),
      });
      setPendingGuest(null);
      setCode("");
    } catch {
      setBanner({ type: "denied", title: "SERVER UNAVAILABLE", text: "Denial was not recorded. Retry when connected.", at: Date.now() });
    } finally {
      setBusy(false);
    }
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
            <span className="status-ok">Passcode verified</span>
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
                  placeholder="Optional notes / denial reason"
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
                            onClick={async () => {
                              const cleanNotes = checkoutNote.trim() || "Checked out";
                              try {
                                const result = await checkOutMutation({
                                  passcodeId: person.passcodeId,
                                  checkoutNotes: cleanNotes,
                                });
                                if (!result.ok) {
                                  setBanner({ type: "denied", title: "CHECK-OUT REJECTED", text: result.error ?? "Server rejected check-out.", at: Date.now() });
                                  return;
                                }
                                setCheckoutConfirmKey(null);
                                setCheckoutNote("");
                              } catch {
                                setBanner({ type: "denied", title: "SERVER UNAVAILABLE", text: "Check-out was not recorded. Retry when connected.", at: Date.now() });
                              }
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

export function PersonsOnSite({
  operatorName,
  canManage,
  canExport,
}: {
  operatorName: string;
  canManage: boolean;
  canExport: boolean;
}) {
  const checkOutMutation = useMutation(api.passcodes.checkOut);
  const { activeOnSite, checkedOutHistory, all } = useUnifiedOnSiteList();
  const [view, setView] = useState<"active" | "departed" | "all">("active");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "visitor" | "contractor" | "supplier">("all");
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [exitRemarks, setExitRemarks] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const sourceList = view === "active" ? activeOnSite : view === "departed" ? checkedOutHistory : all;

  const filterList = (list: UnifiedOnSitePerson[]) =>
    list.filter(p => {
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          p.visitorName.toLowerCase().includes(q) ||
          (p.company ?? "").toLowerCase().includes(q) ||
          p.hostName.toLowerCase().includes(q) ||
          p.deptName.toLowerCase().includes(q) ||
          p.badgeNumber.toLowerCase().includes(q) ||
          (p.vehiclePlate ?? "").toLowerCase().includes(q) ||
          (p.checkedOutBy ?? "").toLowerCase().includes(q) ||
          (p.checkoutNotes ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

  const filtered = useMemo(() => filterList(sourceList), [sourceList, kindFilter, search]);

  const exportRosterCsv = () => {
    if (!canExport || !verifyCsrfToken(getCsrfToken())) return;
    // Always include checked-out records in the exported report unless specifically filtering only departed
    const exportSource = view === "departed" ? filterList(checkedOutHistory) : filterList(all);
    downloadCsv(
      `gate-access-report-${new Date().toISOString().slice(0, 10)}.csv`,
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
        "Checked Out By",
        "Checkout Notes",
        "Status",
      ],
      exportSource.map(p => {
        const isOverstayed = !p.checkedOutAt && !!p.expiresAt && p.expiresAt < now;
        return [
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
          p.checkedOutBy ?? "",
          p.checkoutNotes ?? "",
          p.checkedOutAt ? "Checked Out" : isOverstayed ? "Overstayed" : "On Site",
        ];
      })
    );
  };

  return (
    <>
      <div className="page-header">
        <h1>Persons on Site</h1>
        {canExport && (
          <div className="page-header-actions">
            <button type="button" onClick={() => canExport && window.print()}>
              <Printer size={14} />
              <span>Print</span>
            </button>
            <button type="button" onClick={exportRosterCsv}>
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        )}
      </div>
      {checkoutError && <p className="status-err" role="alert">{checkoutError}</p>}

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
          <span className="kpi-label">Contractors &amp; Suppliers</span>
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
              <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>
                Full Ledger ({all.length})
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
                <th>{view === "active" ? "Duration" : "Checked Out / Status"}</th>
                {view !== "departed" && canManage && <th className="no-print" style={{ textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(person => {
                const isOverstayed = !person.checkedOutAt && !!person.expiresAt && person.expiresAt < now;
                return (
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
                      {!person.checkedOutAt ? (
                        <span className={isOverstayed ? "status-warn" : "status-ok"}>
                          On Site · {formatDuration(now - person.checkedInAt)}
                          {isOverstayed ? " · Overstayed" : ""}
                        </span>
                      ) : (
                        <div>
                          <span>Out {fmt(person.checkedOutAt)}</span>
                          {(person.checkedOutBy || person.checkoutNotes) && (
                            <div className="meta-inline" style={{ fontFamily: "Inter, sans-serif" }}>
                              {person.checkedOutBy ? `by ${person.checkedOutBy}` : ""}
                              {person.checkoutNotes ? ` · ${person.checkoutNotes}` : ""}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    {view !== "departed" && canManage && (
                      <td className="no-print" style={{ textAlign: "right" }}>
                        {person.checkedOutAt ? (
                          <span className="meta-inline">Checked Out</span>
                        ) : checkoutKey === person.key ? (
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
                              onClick={async () => {
                                setCheckoutError("");
                                const cleanRemarks = exitRemarks.trim() || "Checked out";
                                try {
                                  const result = await checkOutMutation({
                                    passcodeId: person.passcodeId,
                                    checkoutNotes: cleanRemarks,
                                  });
                                  if (!result.ok) {
                                    setCheckoutError(result.error ?? "Server rejected check-out.");
                                    return;
                                  }
                                  setCheckoutKey(null);
                                  setExitRemarks("");
                                } catch {
                                  setCheckoutError("Check-out was not recorded. Retry when connected.");
                                }
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
                );
              })}
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
