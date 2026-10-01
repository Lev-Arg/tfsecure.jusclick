import React, { useEffect, useMemo, useState } from "react";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Bell as BellIcon,
  Building2,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Printer,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { SECURITY_CHECKPOINT_IMG, TfLogo } from "./components/TfLogo";
import { Gate, PersonsOnSite, useUnifiedOnSiteList } from "./components/GateAndOnSite";
import {
  approveUserAccount,
  downloadCsv,
  getAttachmentByName,
  getAttachmentByPasscodeId,
  getCsrfToken,
  isProfileApproved,
  markEmailPendingApproval,
  registerIssuedPasscode,
  revokeUserApproval,
  sanitizeText,
  setUserDepartmentOverride,
  useGateRegistry,
  verifyCsrfToken,
} from "./lib/gateRegistry";

// Strict RBAC Tab Matrix:
// - "admin": Full system access, ONLY role permitted to view "Audit log" (System Logs)
// - "security": Gate operations, all-department logs, and CSV/Print exports
// - "report" (Department Head): Scoped strictly to their bound department's Dashboard, Passcodes, and Persons on site
// - "staff": Scoped strictly to their individual passcodes within their bound department
const TABS: Record<string, string[]> = {
  Dashboard: ["admin", "security", "report"],
  Passcodes: ["admin", "security", "report", "staff"],
  "Gate check": ["admin", "security"],
  "Persons on site": ["admin", "security", "report"],
  "Audit log": ["admin"],
  Departments: ["admin"],
  Users: ["admin"],
  Settings: ["admin"],
};

const ROLE_LABELS: Record<string, string> = {
  admin: "System Admin",
  security: "Security Admin",
  report: "Department Head",
  staff: "Staff",
};

export function formatRoleLabel(r: string): string {
  return ROLE_LABELS[r] ?? r;
}

const fmt = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function formatRemaining(expiresAt: number, now: number): string {
  const diff = expiresAt - now;
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${remMins}m`;
}

type Res = { ok: boolean; error?: string };
const useBranding = () => useQuery(api.settings.get);

function applySafeAccent(accentHex: string | undefined, theme: "light" | "dark") {
  const raw = accentHex && /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : "#d97706";
  const r = parseInt(raw.slice(1, 3), 16);
  const g = parseInt(raw.slice(3, 5), 16);
  const b = parseInt(raw.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  let safeSig = raw;
  if (theme === "dark" && luminance < 0.2) {
    safeSig = "#f59e0b";
  } else if (theme === "light" && luminance > 0.9) {
    safeSig = "#d97706";
  }
  document.documentElement.style.setProperty("--sig", safeSig);
}

/* ==================== HOMEPAGE / LOGIN PAGE ==================== */
function SignIn({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { signIn } = useAuthActions();
  const brand = useBranding();
  const registry = useGateRegistry();
  const [step, setStep] = useState<"signIn" | "signUp" | "forgot" | { verify: string } | { reset: string }>("signIn");
  const [emailInput, setEmailInput] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    applySafeAccent(brand?.accent, theme);
  }, [brand?.accent, theme]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!verifyCsrfToken(getCsrfToken())) {
      setErr("Invalid session security token. Refresh and try again.");
      return;
    }

    const fd = new FormData(e.currentTarget);
    const email = sanitizeText(String(fd.get("email") ?? "") || emailInput, 120).toLowerCase();
    const password = String(fd.get("password") ?? "");
    const rawName = sanitizeText(String(fd.get("name") ?? ""), 80);

    if (step === "signUp" && rawName.length < 2) {
      setErr("Enter your full name (at least 2 characters).");
      return;
    }
    if ((step === "signIn" || step === "signUp") && password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    // Block login if this email is known to be awaiting administrator approval
    if (step === "signIn" && registry.pendingApprovalEmails[email] && !registry.approvedUserKeys[email]) {
      setErr("Your account is pending administrator approval. You cannot log in until an admin approves your profile.");
      return;
    }

    setBusy(true);
    try {
      if (step === "signIn" || step === "signUp") {
        if (step === "signUp") {
          markEmailPendingApproval(email);
          fd.set("name", rawName);
        }
        fd.set("email", email);
        fd.set("flow", step);
        const r = await signIn("password", fd);
        if (!r.signingIn) {
          setStep({ verify: email });
          setInfo("Verification code sent to your email.");
        }
      } else if (step === "forgot") {
        await signIn("password", { email, flow: "reset" });
        setStep({ reset: email });
        setInfo("Reset code sent to your email.");
      } else if ("verify" in step) {
        await signIn("password", {
          email: step.verify,
          code: String(fd.get("code")).trim(),
          flow: "email-verification",
        });
      } else {
        await signIn("password", {
          email: step.reset,
          code: String(fd.get("code")).trim(),
          newPassword: String(fd.get("newPassword")),
          flow: "reset-verification",
        });
      }
    } catch (caught: any) {
      const msg = String(caught?.message ?? caught ?? "");
      if (msg.includes("InvalidAccountId")) {
        setErr(`No account found for ${email}.`);
      } else if (msg.toLowerCase().includes("already exists")) {
        setStep("signIn");
        setErr(`An account for ${email} already exists. Please sign in.`);
      } else {
        setErr(
          step === "signIn"
            ? "Invalid email or password."
            : step === "signUp"
            ? "Could not create account (use 8+ character password)."
            : "Invalid or expired code."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const isObj = typeof step === "object";

  return (
    <div
      className="auth-shell"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(7, 11, 18, 0.52) 0%, rgba(7, 11, 18, 0.34) 50%, rgba(7, 11, 18, 0.64) 100%), url("${SECURITY_CHECKPOINT_IMG}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="auth-theme-floating">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle color theme"
          style={{ background: "rgba(15,23,42,0.75)", color: "#f8fafc", borderColor: "rgba(255,255,255,0.2)" }}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>

      {/* CENTER PORTAL: Left pane filled by Organization Logo on Desktop (Top Logo zone on Mobile), Right pane has centered TFSECURE Login Form */}
      <div className="auth-main-stage">
        <div className="auth-portal-frame">
          <aside className="auth-checkpoint-panel">
            <div className="auth-org-badge">
              <TfLogo size="fill" lightText />
            </div>
          </aside>

          <main className="auth-form-pane">
            <form className="auth-card" onSubmit={submit}>
              <div className="auth-card-logo-bar">
                <div className="system-title-group">
                  <span className="header-app-title" style={{ fontSize: 20 }}>
                    TFSECURE
                  </span>
                </div>
              </div>

              <div className="auth-card-header">
                <h1>
                  {step === "signIn"
                    ? "Sign In"
                    : step === "signUp"
                    ? "Create Account"
                    : step === "forgot"
                    ? "Reset Password"
                    : isObj && "verify" in step
                    ? "Verify Email"
                    : "New Password"}
                </h1>
              </div>

              {!isObj && (
                <div className="segmented" style={{ width: "100%" }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    aria-pressed={step === "signIn"}
                    onClick={() => {
                      setStep("signIn");
                      setErr("");
                      setInfo("");
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    aria-pressed={step === "signUp"}
                    onClick={() => {
                      setStep("signUp");
                      setErr("");
                      setInfo("");
                    }}
                  >
                    Create account
                  </button>
                </div>
              )}

              {step === "signUp" && (
                <div className="field-group">
                  <label htmlFor="auth-name">Full name</label>
                  <input id="auth-name" name="name" placeholder="Full name" required autoComplete="name" />
                </div>
              )}

              {!isObj && (
                <div className="field-group">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="Email address"
                    required
                    autoComplete="email"
                  />
                </div>
              )}

              {(step === "signIn" || step === "signUp") && (
                <div className="field-group">
                  <label htmlFor="auth-password">Password</label>
                  <div className="field-with-action">
                    <input
                      id="auth-password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      placeholder="Password (8+ characters)"
                      required
                      minLength={8}
                      autoComplete={step === "signIn" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {isObj && (
                <div className="field-group">
                  <label htmlFor="auth-code">8-digit code</label>
                  <input id="auth-code" name="code" className="mono" placeholder="12345678" inputMode="numeric" required />
                </div>
              )}

              {isObj && "reset" in step && (
                <div className="field-group">
                  <label htmlFor="auth-new-pw">New password</label>
                  <input
                    id="auth-new-pw"
                    name="newPassword"
                    type="password"
                    placeholder="8+ characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {info && (
                <div className="gate-banner granted" style={{ marginTop: 0, padding: "8px 10px", fontSize: 12 }}>
                  {info}
                </div>
              )}

              {err && (
                <div
                  className="gate-banner denied"
                  role="alert"
                  style={{ marginTop: 0, padding: "8px 10px", fontSize: 12 }}
                >
                  {err}
                </div>
              )}

              <button className="pri" type="submit" disabled={busy} style={{ width: "100%", height: 40 }}>
                {busy
                  ? "Please wait…"
                  : step === "signIn"
                  ? "Sign In"
                  : step === "signUp"
                  ? "Request Account"
                  : step === "forgot"
                  ? "Send Code"
                  : isObj && "verify" in step
                  ? "Verify"
                  : "Save Password"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {step === "signIn" && (
                  <button
                    type="button"
                    className="ghost-btn"
                    style={{ padding: "2px 4px", minHeight: "auto", fontSize: 12 }}
                    onClick={() => {
                      setStep("forgot");
                      setErr("");
                      setInfo("");
                    }}
                  >
                    Forgot password?
                  </button>
                )}
                {step !== "signIn" && (
                  <button
                    type="button"
                    className="ghost-btn"
                    style={{ padding: "2px 4px", minHeight: "auto", fontSize: 12 }}
                    onClick={() => {
                      setStep("signIn");
                      setErr("");
                      setInfo("");
                    }}
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            </form>
          </main>
        </div>
      </div>
      <div style={{ height: 4 }} />
    </div>
  );
}

/* ==================== MODULE 1: DASHBOARD ==================== */
function Dashboard({
  onNavigate,
  role,
  me,
  boundDeptId,
  boundDeptName,
}: {
  onNavigate: (tab: string) => void;
  role: string;
  me: any;
  boundDeptId?: Id<"departments">;
  boundDeptName: string;
}) {
  const m = useQuery(api.metrics.overview);
  const rawPasscodes = useQuery(api.passcodes.list) ?? [];
  const depts = useQuery(api.departments.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const auditRows = useQuery(api.audit.recent) ?? [];
  const revoke = useMutation(api.passcodes.revoke);
  const registry = useGateRegistry();
  const { activeOnSite, checkedOutHistory } = useUnifiedOnSiteList();

  const [now, setNow] = useState(() => Date.now());
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  if (m === undefined) {
    return (
      <div className="panel">
        <p className="status-mute">Loading…</p>
      </div>
    );
  }

  if (m === null) {
    return (
      <div className="panel">
        <p className="status-err">Access restricted.</p>
      </div>
    );
  }

  const isAllDepts = role === "admin" || role === "security";
  const isAdmin = role === "admin";
  const deptName = (id?: string) => depts.find(d => d._id === id)?.name ?? boundDeptName;

  // Strict RBAC & BOLA Filtering on Dashboard:
  // - Admin & Security: see all departments
  // - Department Head ("report"): see ONLY their bound department
  const passcodes = rawPasscodes.filter(p => {
    if (isAllDepts) return true;
    const effectiveDept = p.hostDepartmentId ?? boundDeptId;
    return effectiveDept === boundDeptId;
  });

  const activePasscodes = passcodes.filter(
    p => !p.revokedAt && !registry.deniedPasscodeIds[p._id] && !p.usedAt && p.expiresAt > now
  );

  const dayAgo = now - 86_400_000;
  const scopedIssued24h = isAllDepts ? m.issued24h : passcodes.filter(p => p._creationTime > dayAgo).length;
  const scopedActiveCount = activePasscodes.length;
  const scopedGranted24h = isAllDepts
    ? m.granted24h
    : activeOnSite.filter(x => x.checkedInAt > dayAgo).length +
      checkedOutHistory.filter(x => x.checkedInAt > dayAgo).length;

  const scopedByKind = isAllDepts
    ? m.byKind
    : {
        visitor: passcodes.filter(p => p._creationTime > dayAgo && p.kind === "visitor").length,
        contractor: passcodes.filter(p => p._creationTime > dayAgo && p.kind === "contractor").length,
        supplier: passcodes.filter(p => p._creationTime > dayAgo && p.kind === "supplier").length,
      };

  const maxKind = Math.max(1, ...Object.values(scopedByKind));

  const resolveHostName = (p: any) => {
    if (p.hostName) return p.hostName;
    const att = getAttachmentByPasscodeId(p._id) ?? getAttachmentByName(p.visitorName, p.expiresAt);
    if (att?.hostName) return att.hostName;
    if (me && p.issuedBy === me.userId) return me.name;
    const u = users.find(x => x.userId === p.issuedBy);
    return u?.name ?? "Staff Host";
  };

  // Department Head only sees their own department in the breakdown table; Admin & Security see all departments
  const visibleDepts = isAllDepts ? depts : depts.filter(d => d._id === boundDeptId);
  const deptBreakdown = visibleDepts.map(d => {
    const total = passcodes.filter(p => (p.hostDepartmentId ?? boundDeptId) === d._id).length;
    const active = activePasscodes.filter(p => (p.hostDepartmentId ?? boundDeptId) === d._id).length;
    const onSite = activeOnSite.filter(p => p.deptName === d.name).length;
    return { _id: d._id, name: d.name, active, onSite, total };
  });

  const pendingUserCount = isAdmin ? users.filter(u => !isProfileApproved(u)).length : 0;

  return (
    <>
      <div className="page-header">
        <h1>{isAllDepts ? "Dashboard" : `Dashboard — ${boundDeptName}`}</h1>
        <div className="page-header-actions">
          {isAdmin && pendingUserCount > 0 && (
            <button className="danger-btn" onClick={() => onNavigate("Users")}>
              <UsersIcon size={14} />
              <span>Pending Approvals ({pendingUserCount})</span>
            </button>
          )}
          <button onClick={() => onNavigate("Persons on site")}>
            <UserCheck size={14} />
            <span>Persons on Site ({activeOnSite.length})</span>
          </button>
          {(role === "admin" || role === "security") && (
            <button onClick={() => onNavigate("Gate check")}>
              <ShieldCheck size={14} />
              <span>Gate Check</span>
            </button>
          )}
          <button className="pri" onClick={() => onNavigate("Passcodes")}>
            <Plus size={14} />
            <span>Issue Passcode</span>
          </button>
        </div>
      </div>

      <section className="kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">On Site Now</span>
          <span className="kpi-value status-ok">{activeOnSite.length}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Active Passcodes</span>
          <span className="kpi-value">{scopedActiveCount}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Issued (24h)</span>
          <span className="kpi-value">{scopedIssued24h}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Granted (24h)</span>
          <span className="kpi-value status-ok">{scopedGranted24h}</span>
        </div>
        {isAllDepts && (
          <div className="kpi-cell">
            <span className="kpi-label">Rejected (24h)</span>
            <span className={`kpi-value ${m.rejected24h > 0 ? "status-warn" : ""}`}>{m.rejected24h}</span>
          </div>
        )}
        {isAdmin && (
          <div className="kpi-cell">
            <span className="kpi-label">System Denials (24h)</span>
            <span className={`kpi-value ${m.denied24h > 0 ? "status-err" : ""}`}>{m.denied24h}</span>
          </div>
        )}
      </section>

      <div className="grid-equal-2col">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Issued by Type (24h)</h2>
          </div>
          <div className="dist-list">
            {(["visitor", "contractor", "supplier"] as const).map(k => {
              const count = scopedByKind[k] ?? 0;
              return (
                <div className="dist-item" key={k}>
                  <div className="dist-row-head">
                    <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{k}</span>
                    <span className="mono">{count}</span>
                  </div>
                  <div className="dist-track">
                    <div className="dist-fill" style={{ width: `${(count / maxKind) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">{isAllDepts ? "Departments" : "Department Summary"}</h2>
          </div>
          {deptBreakdown.length === 0 ? (
            <div className="empty-state">
              <p>No departments.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="num-col">On Site</th>
                    <th className="num-col">Active</th>
                    <th className="num-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {deptBreakdown.map(d => (
                    <tr key={d._id}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td className="num-col status-ok">{d.onSite}</td>
                      <td className="num-col">{d.active}</td>
                      <td className="num-col">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className={isAdmin ? "grid-2col" : ""}>
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Active Passcodes ({activePasscodes.length})</h2>
            <button className="ghost-btn" onClick={() => onNavigate("Passcodes")}>
              View All
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Host Name</th>
                  <th>Department</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activePasscodes.slice(0, 6).map(p => {
                  const canRevokeRow =
                    role === "admin" ||
                    role === "security" ||
                    (role === "report" && (p.hostDepartmentId ?? boundDeptId) === boundDeptId) ||
                    (role === "staff" && p.issuedBy === me.userId);
                  return (
                    <tr key={p._id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.visitorName}</div>
                        {p.company && <div className="meta-inline">{p.company}</div>}
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{p.kind}</td>
                      <td>{resolveHostName(p)}</td>
                      <td>{deptName(p.hostDepartmentId)}</td>
                      <td className="mono">{formatRemaining(p.expiresAt, now)}</td>
                      <td style={{ textAlign: "right" }}>
                        {canRevokeRow &&
                          (confirmRevokeId === p._id ? (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button
                                className="danger-btn"
                                style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                                onClick={async () => {
                                  if (!verifyCsrfToken(getCsrfToken())) return;
                                  await revoke({ id: p._id });
                                  setConfirmRevokeId(null);
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                                onClick={() => setConfirmRevokeId(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                              onClick={() => setConfirmRevokeId(p._id)}
                            >
                              Revoke
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {activePasscodes.length === 0 && (
            <div className="empty-state">
              <p>No active passcodes.</p>
            </div>
          )}
        </section>

        {/* ONLY ADMINS SEE SYSTEM LOGS */}
        {isAdmin && (
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">System Logs</h2>
              <button className="ghost-btn" onClick={() => onNavigate("Audit log")}>
                View All
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Host / User</th>
                    <th>Action</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.slice(0, 6).map(a => (
                    <tr key={a._id}>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {fmt(a.at)}
                      </td>
                      <td>{a.name}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {a.action}
                      </td>
                      <td className={a.ok ? "status-ok" : "status-err"}>{a.ok ? "Allowed" : "Denied"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditRows.length === 0 && (
              <div className="empty-state">
                <p>No activity.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

/* ==================== MODULE 2: PASSCODES ==================== */
type IssuedTicket = {
  code: string;
  visitorName: string;
  company?: string;
  kind: string;
  hostName: string;
  deptName: string;
  phone?: string;
  idNumber?: string;
  vehiclePlate?: string;
  purpose?: string;
  hours: number;
  expiresAt: number;
};

function Passcodes({
  role,
  me,
  boundDeptId,
  boundDeptName,
}: {
  role: string;
  me: { _id: string; userId: string; name: string; email: string; role: string; departmentId?: Id<"departments"> };
  boundDeptId?: Id<"departments">;
  boundDeptName: string;
}) {
  const rows = useQuery(api.passcodes.list) ?? [];
  const depts = useQuery(api.departments.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const brand = useBranding();
  const issue = useMutation(api.passcodes.issue);
  const revoke = useMutation(api.passcodes.revoke);
  const registry = useGateRegistry();

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [f, setF] = useState({
    name: "",
    company: "",
    kind: "visitor" as "visitor" | "contractor" | "supplier",
    hours: 0,
    phone: "",
    idNumber: "",
    vehiclePlate: "",
    purpose: "",
  });
  const [batchText, setBatchText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [issuedTickets, setIssuedTickets] = useState<IssuedTicket[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "On Site" | "Checked Out" | "Expired" | "Revoked"
  >("All");
  const [kindFilter, setKindFilter] = useState<"all" | "visitor" | "contractor" | "supplier">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // RBAC: ONLY Security & System Admin can export or view all department logs
  const canSeeAllDepts = role === "admin" || role === "security";
  const canExport = role === "admin" || role === "security";

  const hours = f.hours || brand?.defaultHours || 4;
  const maxHours = brand?.maxHours ?? 72;
  const dn = (id?: string) => depts.find(d => d._id === id)?.name ?? boundDeptName;

  const resolveHostName = (p: (typeof rows)[number]) => {
    if ((p as any).hostName) return (p as any).hostName as string;
    const att = getAttachmentByPasscodeId(p._id) ?? getAttachmentByName(p.visitorName, p.expiresAt);
    if (att?.hostName) return att.hostName;
    if (p.issuedBy === me.userId) return me.name;
    const u = users.find(x => x.userId === p.issuedBy);
    return u?.name ?? me.name;
  };

  const resolveDeptId = (p: (typeof rows)[number]) => {
    if (p.hostDepartmentId) return p.hostDepartmentId;
    const att = getAttachmentByPasscodeId(p._id) ?? getAttachmentByName(p.visitorName, p.expiresAt);
    if (att?.hostDepartmentId) return att.hostDepartmentId;
    if (p.issuedBy === me.userId) return boundDeptId;
    const u = users.find(x => x.userId === p.issuedBy);
    return u ? u.departmentId ?? registry.userDepartmentOverrides[u._id] : boundDeptId;
  };

  const resolveDeptName = (p: (typeof rows)[number]) => {
    const dId = resolveDeptId(p);
    if (dId) return dn(dId);
    const att = getAttachmentByPasscodeId(p._id) ?? getAttachmentByName(p.visitorName, p.expiresAt);
    return att?.deptName ?? boundDeptName;
  };

  const getStatus = (p: (typeof rows)[number]) => {
    if (p.revokedAt || registry.deniedPasscodeIds[p._id]) return "Revoked";
    if (p.usedAt) {
      const isCheckedOut =
        !!registry.checkedOutPasscodeIds[p._id] ||
        registry.onSiteRecords.some(r => r.passcodeId === p._id && !!r.checkedOutAt);
      return isCheckedOut ? "Checked Out" : "On Site";
    }
    if (p.expiresAt < now) return "Expired";
    return "Active";
  };

  const handleIssueSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");
    if (!verifyCsrfToken(getCsrfToken())) {
      setErrMsg("Invalid session security token.");
      return;
    }
    const cleanName = sanitizeText(f.name, 80);
    if (cleanName.length < 2) {
      setErrMsg("Enter a valid guest full name (at least 2 characters).");
      return;
    }
    const cleanCompany = sanitizeText(f.company, 80) || undefined;
    const cleanPhone = sanitizeText(f.phone, 32) || undefined;
    const cleanIdNum = sanitizeText(f.idNumber, 40) || undefined;
    const cleanPlate = sanitizeText(f.vehiclePlate, 24).toUpperCase() || undefined;
    const cleanPurpose = sanitizeText(f.purpose, 120) || undefined;

    setBusy(true);
    try {
      const r = await issue({
        visitorName: cleanName,
        kind: f.kind,
        hours,
        company: cleanCompany,
        hostDepartmentId: boundDeptId,
      });
      if (!r.ok) {
        setErrMsg(r.error);
      } else {
        const issuedAt = Date.now();
        const expiresAt = issuedAt + hours * 3600_000;
        await registerIssuedPasscode(r.code, {
          visitorName: cleanName,
          company: cleanCompany,
          kind: f.kind,
          issuedByUserId: me.userId,
          hostName: me.name,
          hostDepartmentId: boundDeptId,
          deptName: boundDeptName,
          phone: cleanPhone,
          idNumber: cleanIdNum,
          vehiclePlate: cleanPlate,
          purpose: cleanPurpose,
          hours,
          issuedAt,
          expiresAt,
        });
        setIssuedTickets([
          {
            code: r.code,
            visitorName: cleanName,
            company: cleanCompany,
            kind: f.kind,
            hostName: me.name,
            deptName: boundDeptName,
            phone: cleanPhone,
            idNumber: cleanIdNum,
            vehiclePlate: cleanPlate,
            purpose: cleanPurpose,
            hours,
            expiresAt,
          },
        ]);
        setF({ ...f, name: "", company: "", phone: "", idNumber: "", vehiclePlate: "", purpose: "" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleIssueBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");
    if (!verifyCsrfToken(getCsrfToken())) {
      setErrMsg("Invalid session security token.");
      return;
    }
    const lines = batchText
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setBusy(true);
    const created: IssuedTicket[] = [];
    try {
      for (const line of lines.slice(0, 20)) {
        const [rawName, rawCompany, rawPhone] = line.split(",").map(s => sanitizeText(s, 80));
        if (rawName.length < 2) continue;
        const cleanCompany = rawCompany || sanitizeText(f.company, 80) || undefined;
        const cleanPhone = sanitizeText(rawPhone || f.phone, 32) || undefined;
        const cleanPurpose = sanitizeText(f.purpose, 120) || undefined;

        const r = await issue({
          visitorName: rawName,
          kind: f.kind,
          hours,
          company: cleanCompany,
          hostDepartmentId: boundDeptId,
        });
        if (r.ok) {
          const issuedAt = Date.now();
          const expiresAt = issuedAt + hours * 3600_000;
          await registerIssuedPasscode(r.code, {
            visitorName: rawName,
            company: cleanCompany,
            kind: f.kind,
            issuedByUserId: me.userId,
            hostName: me.name,
            hostDepartmentId: boundDeptId,
            deptName: boundDeptName,
            phone: cleanPhone,
            purpose: cleanPurpose,
            hours,
            issuedAt,
            expiresAt,
          });
          created.push({
            code: r.code,
            visitorName: rawName,
            company: cleanCompany,
            kind: f.kind,
            hostName: me.name,
            deptName: boundDeptName,
            phone: cleanPhone,
            purpose: cleanPurpose,
            hours,
            expiresAt,
          });
        } else {
          setErrMsg(r.error);
          break;
        }
      }
      if (created.length > 0) {
        setIssuedTickets(created);
        setBatchText("");
      }
    } finally {
      setBusy(false);
    }
  };

  // Strict RBAC & BOLA Filtering on Passcode Logs:
  // - Admin & Security: see all department passcodes
  // - Department Head ("report"): see ONLY passcodes belonging to their bound department
  // - Staff ("staff"): see ONLY passcodes they individually issued within their bound department
  const filteredRows = useMemo(() => {
    return rows.filter(p => {
      const rowDeptId = resolveDeptId(p);
      const rowDeptName = resolveDeptName(p);
      const matchesBoundDept =
        (boundDeptId && rowDeptId === boundDeptId) ||
        rowDeptName.toLowerCase() === boundDeptName.toLowerCase();

      if (role === "staff") {
        if (p.issuedBy !== me.userId || !matchesBoundDept) return false;
      } else if (role === "report") {
        if (!matchesBoundDept) return false;
      }

      const st = getStatus(p);
      if (statusFilter !== "All" && st !== statusFilter) return false;
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      if (canSeeAllDepts && deptFilter !== "all" && rowDeptId !== deptFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = p.visitorName.toLowerCase().includes(q);
        const matchComp = (p.company ?? "").toLowerCase().includes(q);
        const matchHost = resolveHostName(p).toLowerCase().includes(q);
        if (!matchName && !matchComp && !matchHost) return false;
      }
      return true;
    });
  }, [rows, role, me.userId, boundDeptId, boundDeptName, canSeeAllDepts, statusFilter, kindFilter, deptFilter, search, now, registry, users]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const exportPasscodesCsv = () => {
    if (!canExport || !verifyCsrfToken(getCsrfToken())) return;
    downloadCsv(
      `passcodes-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Company", "Type", "Host Name", "Department", "Issued", "Expires", "Status"],
      filteredRows.map(p => [
        p.visitorName,
        p.company ?? "",
        p.kind,
        resolveHostName(p),
        resolveDeptName(p),
        new Date(p._creationTime).toISOString(),
        new Date(p.expiresAt).toISOString(),
        getStatus(p),
      ])
    );
  };

  return (
    <>
      <div className="page-header">
        <h1>Passcodes</h1>
        <div className="page-header-actions">
          <div className="segmented">
            <button type="button" aria-pressed={mode === "single"} onClick={() => setMode("single")}>
              Single
            </button>
            <button type="button" aria-pressed={mode === "batch"} onClick={() => setMode("batch")}>
              Batch
            </button>
          </div>
          {canExport && (
            <button onClick={exportPasscodesCsv}>
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {issuedTickets.length > 0 && (
        <section className="passcode-ticket" aria-live="polite">
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {issuedTickets.map(t => (
                <div
                  key={t.code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    padding: "8px 12px",
                    background: "var(--surface-solid)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.visitorName}</div>
                    <div className="meta-inline">
                      {t.kind} {t.company ? `· ${t.company}` : ""} · Host: {t.hostName} · {t.deptName} · Expires{" "}
                      {fmt(t.expiresAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="ticket-code-display">
                      {t.code.slice(0, 3)} {t.code.slice(3)}
                    </span>
                    <button type="button" onClick={() => copyText(t.code, `code-${t.code}`)}>
                      {copiedCode === `code-${t.code}` ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedCode === `code-${t.code}` ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8 }}>
            {canExport && (
              <button type="button" onClick={() => window.print()}>
                <Printer size={14} />
                <span>Print</span>
              </button>
            )}
            <button type="button" onClick={() => setIssuedTickets([])}>
              <X size={14} />
            </button>
          </div>
        </section>
      )}

      <section className="panel no-print">
        <div className="panel-header">
          <h2 className="panel-title">{mode === "single" ? "Issue Passcode" : "Batch Issue"}</h2>
        </div>

        {mode === "single" ? (
          <form onSubmit={handleIssueSingle} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-grid">
              <div className="field-group">
                <label>Full name *</label>
                <input
                  value={f.name}
                  onChange={e => setF({ ...f, name: e.target.value })}
                  placeholder="Guest name"
                  required
                />
              </div>
              <div className="field-group">
                <label>Company</label>
                <input
                  value={f.company}
                  onChange={e => setF({ ...f, company: e.target.value })}
                  placeholder="Company"
                />
              </div>
              <div className="field-group">
                <label>Type</label>
                <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as any })}>
                  <option value="visitor">Visitor</option>
                  <option value="contractor">Contractor</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <div className="field-group">
                <label>Host Name</label>
                <input value={me.name} readOnly disabled aria-readonly="true" />
              </div>
              <div className="field-group">
                <label>Department</label>
                <input value={boundDeptName} readOnly disabled aria-readonly="true" />
              </div>
            </div>

            <div className="form-grid">
              <div className="field-group">
                <label>Phone</label>
                <input
                  value={f.phone}
                  onChange={e => setF({ ...f, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="field-group">
                <label>ID Number</label>
                <input
                  value={f.idNumber}
                  onChange={e => setF({ ...f, idNumber: e.target.value })}
                  placeholder="ID number"
                />
              </div>
              <div className="field-group">
                <label>Vehicle Plate</label>
                <input
                  value={f.vehiclePlate}
                  onChange={e => setF({ ...f, vehiclePlate: e.target.value })}
                  placeholder="Plate number"
                />
              </div>
              <div className="field-group">
                <label>Purpose</label>
                <input
                  value={f.purpose}
                  onChange={e => setF({ ...f, purpose: e.target.value })}
                  placeholder="Purpose of visit"
                />
              </div>
              <div className="field-group">
                <label>Validity</label>
                <select value={hours} onChange={e => setF({ ...f, hours: +e.target.value })}>
                  {[1, 2, 4, 8, 12, 24, 48, 72, 168]
                    .filter(h => h <= maxHours)
                    .map(h => (
                      <option key={h} value={h}>
                        {h}h
                      </option>
                    ))}
                </select>
              </div>
              <button className="pri" type="submit" disabled={busy}>
                <KeyRound size={14} />
                <span>{busy ? "Generating…" : "Generate"}</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleIssueBatch} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-grid">
              <div className="field-group">
                <label>Company</label>
                <input
                  value={f.company}
                  onChange={e => setF({ ...f, company: e.target.value })}
                  placeholder="Default company"
                />
              </div>
              <div className="field-group">
                <label>Type</label>
                <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as any })}>
                  <option value="contractor">Contractor</option>
                  <option value="visitor">Visitor</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <div className="field-group">
                <label>Host Name</label>
                <input value={me.name} readOnly disabled aria-readonly="true" />
              </div>
              <div className="field-group">
                <label>Department</label>
                <input value={boundDeptName} readOnly disabled aria-readonly="true" />
              </div>
              <div className="field-group">
                <label>Validity</label>
                <select value={hours} onChange={e => setF({ ...f, hours: +e.target.value })}>
                  {[1, 2, 4, 8, 12, 24, 48, 72, 168]
                    .filter(h => h <= maxHours)
                    .map(h => (
                      <option key={h} value={h}>
                        {h}h
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="field-group">
              <label>Guest list (Name, Company, Phone per line)</label>
              <textarea
                rows={3}
                style={{ height: "auto", fontFamily: "inherit" }}
                placeholder={"John Doe, Acme Ltd, +23324000111"}
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
                required
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="pri" type="submit" disabled={busy}>
                <KeyRound size={14} />
                <span>{busy ? "Issuing…" : "Generate Batch"}</span>
              </button>
            </div>
          </form>
        )}

        {errMsg && (
          <p className="status-err" role="alert" style={{ marginTop: 10 }}>
            {errMsg}
          </p>
        )}
      </section>

      <section className="panel">
        <div className="toolbar no-print">
          <div className="toolbar-group">
            <div className="search-box">
              <Search size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search guest, host, or company…"
              />
            </div>
            <div className="segmented" role="group">
              {(["All", "Active", "On Site", "Checked Out", "Expired", "Revoked"] as const).map(st => (
                <button key={st} type="button" aria-pressed={statusFilter === st} onClick={() => setStatusFilter(st)}>
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-group">
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value as any)}>
              <option value="all">All types</option>
              <option value="visitor">Visitor</option>
              <option value="contractor">Contractor</option>
              <option value="supplier">Supplier</option>
            </select>
            {canSeeAllDepts && (
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                <option value="all">All departments</option>
                {depts.map(d => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
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
                <th>Issued</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(p => {
                const st = getStatus(p);
                const co = registry.checkedOutPasscodeIds[p._id];
                const rowDeptId = resolveDeptId(p);
                const canRevokeRow =
                  role === "admin" ||
                  role === "security" ||
                  (role === "report" && rowDeptId === boundDeptId) ||
                  (role === "staff" && p.issuedBy === me.userId);
                return (
                  <tr key={p._id}>
                    <td style={{ fontWeight: 600 }}>{p.visitorName}</td>
                    <td>{p.company || <span className="status-mute">—</span>}</td>
                    <td style={{ textTransform: "capitalize" }}>{p.kind}</td>
                    <td style={{ fontWeight: 500 }}>{resolveHostName(p)}</td>
                    <td>{resolveDeptName(p)}</td>
                    <td className="mono">{fmt(p._creationTime)}</td>
                    <td className="mono">
                      {fmt(p.expiresAt)}
                      {st === "Active" && (
                        <span className="meta-inline"> · {formatRemaining(p.expiresAt, now)}</span>
                      )}
                    </td>
                    <td
                      className={
                        st === "Active" || st === "On Site"
                          ? "status-ok"
                          : st === "Checked Out"
                          ? ""
                          : st === "Expired"
                          ? "status-warn"
                          : "status-err"
                      }
                    >
                      {st}
                      {p.usedAt && <span className="meta-inline"> · In {fmt(p.usedAt)}</span>}
                      {co?.checkedOutAt && <span className="meta-inline"> · Out {fmt(co.checkedOutAt)}</span>}
                    </td>
                    <td className="no-print" style={{ textAlign: "right" }}>
                      {st === "Active" &&
                        canRevokeRow &&
                        (confirmRevokeId === p._id ? (
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              className="danger-btn"
                              style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                              onClick={async () => {
                                if (!verifyCsrfToken(getCsrfToken())) return;
                                const r: Res = await revoke({ id: p._id });
                                if (!r.ok) setErrMsg(r.error ?? "Could not revoke");
                                setConfirmRevokeId(null);
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                              onClick={() => setConfirmRevokeId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => setConfirmRevokeId(p._id)}
                          >
                            Revoke
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="empty-state">
            <p>No passcodes found.</p>
          </div>
        )}
      </section>
    </>
  );
}

/* ==================== MODULE 4: AUDIT LOG (ADMIN ONLY) ==================== */
function Audit({ role }: { role: string }) {
  const rows = useQuery(api.audit.recent) ?? [];
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<"all" | "allowed" | "denied">("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  if (role !== "admin") {
    return (
      <div className="panel">
        <p className="status-err">System logs are restricted to System Administrators only.</p>
      </div>
    );
  }

  const distinctActions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => s.add(r.action));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(a => {
      if (outcome === "allowed" && !a.ok) return false;
      if (outcome === "denied" && a.ok) return false;
      if (actionFilter !== "all" && a.action !== actionFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          a.name.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q) ||
          a.detail.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, outcome, actionFilter, search]);

  const exportAuditCsv = () => {
    if (role !== "admin" || !verifyCsrfToken(getCsrfToken())) return;
    downloadCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Timestamp", "Host / User", "Action", "Detail", "Result"],
      filtered.map(a => [new Date(a.at).toISOString(), a.name, a.action, a.detail, a.ok ? "Allowed" : "Denied"])
    );
  };

  return (
    <>
      <div className="page-header">
        <h1>Audit Log</h1>
        <div className="page-header-actions">
          <button onClick={exportAuditCsv}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <div className="search-box">
              <Search size={14} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search audit log…" />
            </div>

            <div className="segmented" role="group">
              <button type="button" aria-pressed={outcome === "all"} onClick={() => setOutcome("all")}>
                All ({rows.length})
              </button>
              <button type="button" aria-pressed={outcome === "allowed"} onClick={() => setOutcome("allowed")}>
                Allowed
              </button>
              <button type="button" aria-pressed={outcome === "denied"} onClick={() => setOutcome("denied")}>
                Denied
              </button>
            </div>
          </div>

          <div className="toolbar-group">
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              <option value="all">All actions</option>
              {distinctActions.map(act => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Host / User</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a._id}>
                  <td className="mono">{fmt(a.at)}</td>
                  <td style={{ fontWeight: 500 }}>{a.name}</td>
                  <td className="mono">{a.action}</td>
                  <td>{a.detail || <span className="status-mute">—</span>}</td>
                  <td className={a.ok ? "status-ok" : "status-err"}>{a.ok ? "Allowed" : "Denied"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <p>No audit entries found.</p>
          </div>
        )}
      </section>
    </>
  );
}

/* ==================== MODULE 5: DEPARTMENTS ==================== */
const PRESET_DEPARTMENTS = [
  "Cocoa Processing Plant",
  "Quality Assurance Lab",
  "Warehousing & Bean Intake",
  "Engineering & Maintenance",
  "HSE & Security",
  "Administration",
];

function Departments() {
  const rows = useQuery(api.departments.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const passcodes = useQuery(api.passcodes.list) ?? [];
  const add = useMutation(api.departments.add);
  const remove = useMutation(api.departments.remove);

  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = Date.now();

  const handleAdd = async (deptName: string) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    setMsg("");
    setBusy(true);
    try {
      const r: Res = await add({ name: sanitizeText(deptName, 60) });
      if (!r.ok) {
        setMsg(r.error ?? "Failed to add department");
      } else {
        setName("");
      }
    } finally {
      setBusy(false);
    }
  };

  const missingPresets = PRESET_DEPARTMENTS.filter(
    preset => !rows.some(r => r.name.toLowerCase() === preset.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <h1>Departments</h1>
      </div>

      <div className="grid-2col">
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="num-col">Staff</th>
                  <th className="num-col">Active Passcodes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const staffCount = users.filter(u => u.departmentId === d._id).length;
                  const activeVisitors = passcodes.filter(
                    p => p.hostDepartmentId === d._id && !p.revokedAt && !p.usedAt && p.expiresAt > now
                  ).length;

                  return (
                    <tr key={d._id}>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td className="num-col">{staffCount}</td>
                      <td className="num-col">{activeVisitors}</td>
                      <td style={{ textAlign: "right" }}>
                        {confirmRemoveId === d._id ? (
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              className="danger-btn"
                              style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                              onClick={async () => {
                                if (!verifyCsrfToken(getCsrfToken())) return;
                                const r: Res = await remove({ id: d._id });
                                if (!r.ok) setMsg(r.error ?? "Could not remove");
                                setConfirmRemoveId(null);
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                              onClick={() => setConfirmRemoveId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            disabled={rows.length <= 1}
                            title={rows.length <= 1 ? "Cannot remove the last remaining department" : undefined}
                            style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => setConfirmRemoveId(d._id)}
                          >
                            <Trash2 size={12} />
                            <span>Remove</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div className="empty-state">
              <p>No departments.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Add Department</h2>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              handleAdd(name);
            }}
            style={{ display: "flex", gap: 8, marginBottom: 12 }}
          >
            <input
              style={{ flex: 1 }}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Department name"
              required
            />
            <button className="pri" type="submit" disabled={busy}>
              <Plus size={14} />
              <span>Add</span>
            </button>
          </form>

          {msg && (
            <p className="status-err" role="alert" style={{ marginBottom: 10 }}>
              {msg}
            </p>
          )}

          {missingPresets.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              {missingPresets.map(preset => (
                <button
                  key={preset}
                  type="button"
                  disabled={busy}
                  onClick={() => handleAdd(preset)}
                  style={{ fontSize: 12, minHeight: 28, padding: "3px 8px" }}
                >
                  <Plus size={11} />
                  <span>{preset}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* ==================== MODULE 6: USERS & ADMIN APPROVAL ==================== */
function Users({ meId }: { meId: string }) {
  const rows = useQuery(api.users.list) ?? [];
  const depts = useQuery(api.departments.list) ?? [];
  const setRole = useMutation(api.users.setRole);
  const setActive = useMutation(api.users.setActive);
  const setDept = useMutation(api.users.setDepartment);
  const registry = useGateRegistry();

  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const run = async (p: Promise<Res>) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    const r = await p;
    setMsg(r.ok ? "" : r.error ?? "Action denied");
  };

  const handleSetDept = async (profileId: Id<"profiles">, deptIdStr: string) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    setUserDepartmentOverride(profileId, deptIdStr || undefined);
    const r = await setDept({
      profileId,
      departmentId: (deptIdStr || undefined) as Id<"departments"> | undefined,
    });
    if (!r.ok && !r.error?.includes("own account")) {
      setMsg(r.error ?? "Action denied");
    } else {
      setMsg("");
    }
  };

  const handleToggleApproval = async (u: (typeof rows)[number], approve: boolean) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    if (approve) {
      approveUserAccount(u._id, u.email);
    } else {
      revokeUserApproval(u._id, u.email);
    }
    const r = await setActive({ profileId: u._id, active: approve });
    setMsg(r.ok ? "" : r.error ?? "Action denied");
  };

  const filtered = useMemo(() => {
    return rows.filter(u => {
      if (roleFilter === "pending" && isProfileApproved(u)) return false;
      if (roleFilter !== "all" && roleFilter !== "pending" && u.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, roleFilter, search, registry]);

  const pendingCount = rows.filter(u => !isProfileApproved(u)).length;

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <div className="search-box">
              <Search size={14} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" />
            </div>

            <div className="segmented" role="group">
              {[
                { key: "all", label: `All (${rows.length})` },
                { key: "pending", label: `Pending Approval (${pendingCount})` },
                { key: "admin", label: "System Admin" },
                { key: "security", label: "Security Admin" },
                { key: "report", label: "Department Head" },
                { key: "staff", label: "Staff" },
              ].map(item => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={roleFilter === item.key}
                  onClick={() => setRoleFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {msg && (
          <p className="status-err" role="alert" style={{ marginBottom: 10 }}>
            {msg}
          </p>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Bound Department</th>
                <th>Approval Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const self = u._id === meId;
                const approved = isProfileApproved(u);
                const activeAdminCount = rows.filter(x => x.role === "admin" && isProfileApproved(x)).length;
                const isLastActiveAdmin = u.role === "admin" && approved && activeAdminCount <= 1;
                const effectiveDeptId = u.departmentId ?? registry.userDepartmentOverrides[u._id] ?? depts[0]?._id ?? "";
                return (
                  <tr key={u._id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      {self && <span className="meta-inline"> · You</span>}
                    </td>
                    <td className="mono">{u.email}</td>
                    <td>
                      <select
                        disabled={self || isLastActiveAdmin}
                        value={u.role}
                        onChange={e => run(setRole({ profileId: u._id, role: e.target.value as any }))}
                      >
                        <option value="admin">System Admin</option>
                        <option value="security">Security Admin</option>
                        <option value="report">Department Head</option>
                        <option value="staff">Staff</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={effectiveDeptId}
                        onChange={e => handleSetDept(u._id, e.target.value)}
                      >
                        {depts.length === 0 && <option value="">General</option>}
                        {depts.map(d => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={approved ? "status-ok" : "status-warn"}>
                      {approved ? "Approved · Active" : "Pending Admin Approval"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        disabled={self || isLastActiveAdmin}
                        className={approved ? "danger-btn" : "pri"}
                        style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                        onClick={() => handleToggleApproval(u, !approved)}
                      >
                        {approved ? "Deactivate" : "Approve User"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ==================== MODULE 7: SETTINGS ==================== */
const ACCENT_PRESETS = [
  { label: "Gold", hex: "#e0a100" },
  { label: "Blue", hex: "#2563eb" },
  { label: "Green", hex: "#059669" },
  { label: "Red", hex: "#dc2626" },
  { label: "Slate", hex: "#475569" },
];

function Settings({ theme }: { theme: "light" | "dark" }) {
  const s = useBranding();
  const save = useMutation(api.settings.update);
  const [f, setF] = useState<{ orgName: string; accent: string; defaultHours: number; maxHours: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (s && !f) {
      setF({
        orgName: s.orgName === "TFsecure" ? "TF Commodities" : s.orgName,
        accent: s.accent === "#000000" ? "#e0a100" : s.accent,
        defaultHours: s.defaultHours,
        maxHours: s.maxHours,
      });
    }
  }, [s]);

  if (!f) {
    return (
      <div className="panel">
        <p className="status-mute">Loading…</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCsrfToken(getCsrfToken())) return;
    setBusy(true);
    setMsg(null);
    try {
      const r: Res = await save({
        ...f,
        orgName: sanitizeText(f.orgName, 60) || "TF Commodities",
      });
      if (r.ok) {
        applySafeAccent(f.accent, theme);
        setMsg({ ok: true, text: "Saved." });
      } else {
        setMsg({ ok: false, text: r.error ?? "Failed to save" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <section className="panel" style={{ maxWidth: 520 }}>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field-group">
            <label>Organization name</label>
            <input value={f.orgName} onChange={e => setF({ ...f, orgName: e.target.value })} required />
          </div>

          <div className="field-group">
            <label>Accent color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="color"
                value={f.accent}
                onChange={e => setF({ ...f, accent: e.target.value })}
                style={{ width: 46, padding: 3, cursor: "pointer" }}
              />
              <input
                className="mono"
                value={f.accent}
                onChange={e => setF({ ...f, accent: e.target.value })}
                style={{ width: 110 }}
              />
              {ACCENT_PRESETS.map(p => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setF({ ...f, accent: p.hex })}
                  style={{ minHeight: 28, padding: "3px 8px", fontSize: 11.5 }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: p.hex,
                      display: "inline-block",
                    }}
                  />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid-equal-2col" style={{ gap: 12 }}>
            <div className="field-group">
              <label>Default validity (hours)</label>
              <input
                type="number"
                className="mono"
                min={1}
                max={f.maxHours}
                value={f.defaultHours}
                onChange={e => setF({ ...f, defaultHours: +e.target.value })}
                required
              />
            </div>
            <div className="field-group">
              <label>Max validity (hours)</label>
              <input
                type="number"
                className="mono"
                min={1}
                max={168}
                value={f.maxHours}
                onChange={e => setF({ ...f, maxHours: +e.target.value })}
                required
              />
            </div>
          </div>

          {msg && (
            <p className={msg.ok ? "status-ok" : "status-err"} role="status" aria-live="polite">
              {msg.text}
            </p>
          )}

          <div>
            <button className="pri" type="submit" disabled={busy}>
              <span>{busy ? "Saving…" : "Save Settings"}</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

/* ==================== NOTIFICATIONS BELL ==================== */
function Bell() {
  const items = useQuery(api.notifications.mine) ?? [];
  const markAll = useMutation(api.notifications.markAllRead);
  const [open, setOpen] = useState(false);

  const unread = items.filter(n => !n.read).length;

  return (
    <div className="bell-wrap">
      <button
        type="button"
        aria-label={`Notifications, ${unread} unread`}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unread > 0) markAll();
        }}
      >
        <BellIcon size={15} />
        <span>Alerts</span>
        {unread > 0 && <span className="status-err mono">({unread})</span>}
      </button>

      {open && (
        <div className="alerts-popover" role="dialog" aria-label="Alerts">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Alerts</strong>
            <button
              type="button"
              className="ghost-btn"
              style={{ minHeight: 24, padding: "2px 6px" }}
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="status-mute" style={{ padding: "14px 0", textAlign: "center" }}>
              No alerts.
            </p>
          ) : (
            items.map(n => (
              <div key={n._id} className="alert-item">
                <div className={n.kind === "security" ? "status-err" : ""} style={{ fontSize: 12.5 }}>
                  {n.message}
                </div>
                <div className="meta-inline mono">{fmt(n.at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ==================== WORKSPACE SHELL ==================== */
const TAB_ICONS: Record<string, React.ReactNode> = {
  Dashboard: <LayoutDashboard size={16} />,
  Passcodes: <KeyRound size={16} />,
  "Gate check": <ShieldCheck size={16} />,
  "Persons on site": <UserCheck size={16} />,
  "Audit log": <FileText size={16} />,
  Departments: <Building2 size={16} />,
  Users: <UsersIcon size={16} />,
  Settings: <SettingsIcon size={16} />,
};

function Shell({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const depts = useQuery(api.departments.list) ?? [];
  const brand = useBranding();
  const ensure = useMutation(api.users.ensureProfile);
  const { activeOnSite } = useUnifiedOnSiteList();
  const registry = useGateRegistry();

  const [tab, setTab] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (me === null) ensure();
  }, [me]);

  useEffect(() => {
    applySafeAccent(brand?.accent, theme);
  }, [brand?.accent, theme]);

  if (!me) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="panel">
          <p className="status-mute">Loading…</p>
        </div>
      </div>
    );
  }

  // Security Control: Block login/access for any new or deactivated user until approved by an Administrator
  const approved = isProfileApproved(me);
  if (!approved) {
    return (
      <div
        className="auth-shell"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7, 11, 18, 0.52) 0%, rgba(7, 11, 18, 0.34) 50%, rgba(7, 11, 18, 0.64) 100%), url("${SECURITY_CHECKPOINT_IMG}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="auth-main-stage">
          <div className="auth-form-pane" style={{ borderRadius: 14, maxWidth: 440, width: "100%" }}>
            <div className="auth-card">
              <div className="auth-card-logo-bar">
                <span className="header-app-title" style={{ fontSize: 20 }}>
                  TFSECURE
                </span>
              </div>
              <div className="auth-card-header">
                <h1>Pending Admin Approval</h1>
              </div>
              <div className="gate-banner pending" style={{ marginTop: 0 }}>
                <strong>Account Awaiting Approval</strong>
                <p style={{ marginTop: 4, fontSize: 12.5 }}>
                  Your profile ({me.email}) has been registered and requires administrator approval before you can log in.
                </p>
              </div>
              <button className="pri" onClick={() => signOut()} style={{ width: "100%", height: 40 }}>
                <LogOut size={15} />
                <span>Return to Sign In</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const boundDeptId = (me.departmentId ??
    (registry.userDepartmentOverrides[me._id] as Id<"departments"> | undefined) ??
    depts[0]?._id) as Id<"departments"> | undefined;
  const boundDeptName = depts.find(d => d._id === boundDeptId)?.name ?? "HSE & Security";
  const canExport = me.role === "admin" || me.role === "security";

  const tabs = Object.keys(TABS).filter(t => TABS[t].includes(me.role));
  const active = tabs.includes(tab) ? tab : tabs[0];

  const selectTab = (t: string) => {
    setTab(t);
    setMobileNavOpen(false);
  };

  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Workspace navigation">
        <div>
          {/* SYSTEM TITLE IN SIDEBAR */}
          <div className="sidebar-brand">
            <span className="header-app-title">TFSECURE</span>
            {mobileNavOpen && (
              <button
                type="button"
                className="ghost-btn"
                style={{ minHeight: 28, padding: 4 }}
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <nav className="sidebar-nav">
            {tabs.map(t => (
              <button
                key={t}
                type="button"
                className="sidebar-nav-btn"
                aria-selected={t === active}
                onClick={() => selectTab(t)}
              >
                {TAB_ICONS[t]}
                <span style={{ flex: 1, textAlign: "left" }}>{t}</span>
                {t === "Persons on site" && activeOnSite.length > 0 && (
                  <span className="mono status-ok" style={{ fontSize: 12 }}>
                    {activeOnSite.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="operator-summary">
            <div className="operator-name">{me.name}</div>
            <div className="operator-meta">
              {formatRoleLabel(me.role)} · {boundDeptName}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onToggleTheme}
              style={{ flex: 1 }}
              aria-label="Toggle light or dark theme"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <button type="button" onClick={() => signOut()} style={{ flex: 1 }}>
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-zone-brand">
            <button
              type="button"
              className="ghost-btn mobile-menu-trigger"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <TfLogo size="sm" />
          </div>

          <div className="topbar-zone-actions">
            <Bell />
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        <main className="workspace-content">
          <div className="workspace-inner">
            {active === "Dashboard" && (
              <Dashboard
                onNavigate={selectTab}
                role={me.role}
                me={me}
                boundDeptId={boundDeptId}
                boundDeptName={boundDeptName}
              />
            )}
            {active === "Passcodes" && (
              <Passcodes role={me.role} me={me} boundDeptId={boundDeptId} boundDeptName={boundDeptName} />
            )}
            {active === "Gate check" && (
              <Gate operatorName={me.name} onNavigateOnSite={() => selectTab("Persons on site")} />
            )}
            {active === "Persons on site" && (
              <PersonsOnSite
                operatorName={me.name}
                canManage={me.role === "admin" || me.role === "security"}
                canExport={canExport}
              />
            )}
            {active === "Audit log" && <Audit role={me.role} />}
            {active === "Departments" && <Departments />}
            {active === "Users" && <Users meId={me._id} />}
            {active === "Settings" && <Settings theme={theme} />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("tfsecure_theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // ignore
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("tfsecure_theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  return (
    <>
      <Unauthenticated>
        <SignIn theme={theme} onToggleTheme={toggleTheme} />
      </Unauthenticated>
      <Authenticated>
        <Shell theme={theme} onToggleTheme={toggleTheme} />
      </Authenticated>
    </>
  );
}
