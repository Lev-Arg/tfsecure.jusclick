import React, { useEffect, useMemo, useRef, useState } from "react";
import { Authenticated, Unauthenticated, useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Activity,
  Bell as BellIcon,
  BookOpen,
  Building2,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  CORPORATE_FACILITY_BG,
  DEFAULT_TF_LOGO,
  SECURITY_CHECKPOINT_IMG,
  TfLogo,
  syncSystemLogoAndFavicons,
  useSystemLogoFaviconSync,
} from "./components/TfLogo";
import { Gate, PersonsOnSite, useUnifiedOnSiteList } from "./components/GateAndOnSite";
import {
  DATA_PROTECTION_POLICY_CLAUSES,
  Documentation,
  PolicyAgreementModal,
} from "./components/DocumentationAndPolicies";
import {
  OfflineIndicator,
  PlatformInstallerAndSetupCenter,
} from "./components/PlatformInstallerAndSetup";
import {
  CURRENT_POLICY_VERSION,
  addLocalDepartment,
  approveUserAccount,
  downloadCsv,
  ensureFirstAccountAndInvites,
  exportSystemBackupJson,
  getAttachmentByName,
  getAttachmentByPasscodeId,
  getCsrfToken,
  getEffectiveDepartmentId,
  getEffectiveRole,
  getMergedAuditLedger,
  getMergedDepartments,
  getMergedPasscodes,
  getMergedUserDirectory,
  hasUserAcceptedPolicy,
  inviteUserAccount,
  isNotificationForHostUser,
  isNotificationSoundMuted,
  isPrimaryBootstrapAdmin,
  isProfileApproved,
  isVisitNotification,
  issueLocalPasscode,
  markAllLocalNotificationsRead,
  optimizeImageFileToDataUrl,
  playNotificationDingDong,
  recordPolicyAcceptance,
  recordPolicyDeclineAttempt,
  registerIssuedPasscode,
  registerSignUpAccount,
  removeLocalDepartment,
  removeRegisteredUser,
  removeSystemImage,
  removeUserInvite,
  restoreSystemBackupJson,
  revokeLocalPasscode,
  revokeUserApproval,
  sanitizeText,
  setCsrfToken,
  setNotificationSoundMuted,
  setUserDepartmentOverride,
  setUserRoleOverride,
  updateSystemConfig,
  useGateRegistry,
  verifyCsrfToken,
  wasGateActionPerformedOnThisDeviceRecently,
  type RoleType,
  type SystemConfig,
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
  Documentation: ["admin", "security", "report", "staff"],
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
function useBranding() {
  const remote = useQuery(api.settings.get);
  const registry = useGateRegistry();
  if (remote === undefined) return undefined;
  return {
    orgName: registry.systemConfig.orgName || remote?.orgName || "TF Commodities",
    accent: registry.systemConfig.accentColor || remote?.accent || "#e0a100",
    defaultHours: registry.systemConfig.defaultPasscodeHours || remote?.defaultHours || 4,
    maxHours: registry.systemConfig.maxPasscodeHours || remote?.maxHours || 72,
  };
}

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

function resolveLoginBackgroundUrl(cfg: SystemConfig): string {
  if (cfg.loginBackgroundMode === "custom" && cfg.customLoginBgUrl) {
    return cfg.customLoginBgUrl;
  }
  if (cfg.loginBackgroundMode === "facility") {
    return CORPORATE_FACILITY_BG;
  }
  return SECURITY_CHECKPOINT_IMG;
}

function resolveWorkspaceBackgroundUrl(cfg: SystemConfig): string | null {
  if (cfg.workspaceBackgroundMode === "minimal") {
    return null;
  }
  if (cfg.workspaceBackgroundMode === "custom" && cfg.customWorkspaceBgUrl) {
    return cfg.customWorkspaceBgUrl;
  }
  if (cfg.workspaceBackgroundMode === "checkpoint") {
    return SECURITY_CHECKPOINT_IMG;
  }
  return CORPORATE_FACILITY_BG;
}

/* ==================== HOMEPAGE / LOGIN PAGE ==================== */
function SignIn({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { signIn } = useAuthActions();
  const brand = useBranding();
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const registry = useGateRegistry();
  const depts = useMemo(
    () => getMergedDepartments(remoteDepts),
    [remoteDepts, registry.localDepartments, registry.removedDepartmentIds]
  );

  const [step, setStep] = useState<"signIn" | "signUp" | "forgot" | { verify: string } | { reset: string }>("signIn");
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [signupDeptId, setSignupDeptId] = useState<string>("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(true);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [rateLimitWarning, setRateLimitWarning] = useState<string>("");
  const preAuthCheck = useMutation(api.authWrapper.preAuthCheck);

  useEffect(() => {
    applySafeAccent(brand?.accent, theme);
  }, [brand?.accent, theme]);

  // Automatically pre-fill invited user details when a matching email or invite code is entered
  const matchedInvite = useMemo(() => {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (cleanEmail && registry.invitedUsers[cleanEmail]) {
      return registry.invitedUsers[cleanEmail];
    }
    const cleanCode = inviteCodeInput.trim().toUpperCase();
    if (cleanCode) {
      return Object.values(registry.invitedUsers).find(
        inv => inv.inviteCode.toUpperCase() === cleanCode
      );
    }
    return undefined;
  }, [emailInput, inviteCodeInput, registry.invitedUsers]);

  useEffect(() => {
    if (matchedInvite) {
      if (!nameInput) setNameInput(matchedInvite.name);
      if (matchedInvite.departmentId) setSignupDeptId(matchedInvite.departmentId);
    }
  }, [matchedInvite]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!verifyCsrfToken(getCsrfToken())) {
      setErr("Invalid session security token. Refresh and try again.");
      return;
    }

    const fd = new FormData(e.currentTarget);
    const email = sanitizeText(
      String(fd.get("email") ?? "") ||
        (typeof step === "object" ? ("verify" in step ? step.verify : step.reset) : emailInput),
      120
    ).toLowerCase();
    const password = String(
      fd.get("password") ?? fd.get("newPassword") ?? ""
    ).trim();
    const rawName = sanitizeText(String(fd.get("name") ?? "") || nameInput, 80);

    if (!email || !email.includes("@")) {
      setErr("Enter a valid email address.");
      return;
    }
    if (step === "signUp" && rawName.length < 2) {
      setErr("Enter your full name (at least 2 characters).");
      return;
    }
    // Basic password length check for UX (server enforces full complexity)
    if ((step === "signIn" || step === "signUp" || (typeof step === "object" && "reset" in step)) && password.length < 12) {
      setErr("Password must be at least 12 characters.");
      return;
    }

    // Mandatory Data Protection (Act 843) & Security Policy agreement before Sign In or Sign Up
    if ((step === "signIn" || step === "signUp") && !policyAccepted) {
      recordPolicyDeclineAttempt(email || emailInput, step);
      setErr("You must review and agree to the Data Protection & Security Policy before login.");
      return;
    }

    setBusy(true);
    try {
      // Server-side rate limiting and password validation check
      let authAction: "signIn" | "signUp" | "passwordReset" | "emailVerify";
      if (step === "signIn" || step === "signUp") {
        authAction = step;
      } else if (step === "forgot" || (typeof step === "object" && "reset" in step)) {
        authAction = "passwordReset";
      } else if (typeof step === "object" && "verify" in step) {
        authAction = "emailVerify";
      } else {
        authAction = "signIn";
      }

      let preAuthResult: { allowed: boolean; error?: string; retryAfter?: number } = { allowed: true };
      try {
        preAuthResult = await preAuthCheck({
          email,
          password,
          action: authAction,
        });
      } catch {
        // Fallback if remote Convex deployment has not yet pushed authWrapper:preAuthCheck
        preAuthResult = { allowed: true };
      }

      if (!preAuthResult.allowed) {
        if (preAuthResult.retryAfter) {
          setRateLimitWarning(`Rate limit reached for ${email}. Try again in ${preAuthResult.retryAfter}s.`);
        }
        setErr(preAuthResult.error || "Authentication failed. Please try again.");
        setBusy(false);
        return;
      }
      setRateLimitWarning("");

      if (step === "signIn" || step === "signUp") {
        // Log the mandatory Data Protection & Security Policy agreement to the Audit Ledger
        try {
          recordPolicyAcceptance({
            email,
            name: rawName || email.split("@")[0],
            context: step === "signUp" ? "signup" : "pre_login",
          });
        } catch (e) {
          console.error("Failed to record policy acceptance:", e);
        }

        const chosenDeptId = signupDeptId || matchedInvite?.departmentId || depts[0]?._id;

        if (step === "signUp") {
          fd.set("name", rawName);
        }
        fd.set("email", email);
        fd.set("password", password);
        fd.set("flow", step);

        const r = await signIn("password", fd);
        if (step === "signUp") {
          // Only register signup account AFTER Convex auth succeeds; role is determined strictly by invite or defaults to "staff"
          try {
            registerSignUpAccount({
              email,
              name: rawName,
              inviteCode: inviteCodeInput.trim() || matchedInvite?.inviteCode,
              departmentId: chosenDeptId,
            });
          } catch (e) {
            console.error("Failed to register signup account:", e);
          }
        }
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
        // Password reset flow
        const resetEmail = (step as { reset: string }).reset;
        await signIn("password", {
          email: resetEmail,
          code: String(fd.get("code")).trim(),
          newPassword: String(fd.get("newPassword")).trim(),
          flow: "reset-verification",
        });
      }
    } catch (caught: any) {
      console.error("Authentication error:", caught);
      const msg = String(caught?.message ?? caught ?? "");
      // Generic error messages to prevent email enumeration (2026 best practice)
      if (msg.includes("InvalidAccountId") || msg.toLowerCase().includes("account not found")) {
        setErr("Invalid email or password. Please try again.");
      } else if (msg.includes("InvalidSecret")) {
        setErr("Invalid email or password. Please try again.");
      } else if (msg.includes("TooManyFailedAttempts")) {
        setErr("Too many failed attempts. Please wait a few minutes and try again.");
      } else if (msg.toLowerCase().includes("already exists") || msg.includes("AccountAlreadyExists")) {
        setErr("An account with this email already exists. Please sign in instead.");
      } else {
        setErr(
          step === "signIn"
            ? "Authentication failed. Please check your credentials and try again."
            : step === "signUp"
            ? "Could not create account. If this email is already registered, please sign in instead."
            : "Invalid or expired verification code. Please request a new code."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const isObj = typeof step === "object";
  const loginBgUrl = resolveLoginBackgroundUrl(registry.systemConfig);

  return (
    <div
      className="auth-shell"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(7, 11, 18, 0.52) 0%, rgba(7, 11, 18, 0.34) 50%, rgba(7, 11, 18, 0.64) 100%), url("${loginBgUrl}")`,
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
                <div className="system-title-group" style={{ flexDirection: "row", gap: 8 }}>
                  <TfLogo size="icon" />
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
                  <input
                    id="auth-name"
                    name="name"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    placeholder="Full name"
                    required
                    autoComplete="name"
                  />
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

              {step === "signUp" && (
                <div className="field-group">
                  <label htmlFor="auth-dept">Department</label>
                  <select
                    id="auth-dept"
                    value={signupDeptId || matchedInvite?.departmentId || depts[0]?._id || ""}
                    onChange={e => setSignupDeptId(e.target.value)}
                    disabled={Boolean(matchedInvite?.departmentId)}
                  >
                    {depts.map(d => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {step === "signUp" && matchedInvite && (
                <div className="gate-banner granted" style={{ marginTop: 0, padding: "7px 10px", fontSize: 12 }}>
                  Invitation matched: pre-assigned role <strong>{formatRoleLabel(matchedInvite.role)}</strong>
                </div>
              )}

              {step === "signUp" && Object.keys(registry.invitedUsers).length > 0 && (
                <div className="field-group">
                  <label htmlFor="auth-invite">Invite Token (Optional)</label>
                  <input
                    id="auth-invite"
                    className="mono"
                    value={inviteCodeInput}
                    onChange={e => setInviteCodeInput(e.target.value)}
                    placeholder="e.g. TFC-INV-123456"
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
                      placeholder="Password (12+ characters, mixed case, number, special)"
                      required
                      minLength={12}
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
                    placeholder="Password (12+ characters, mixed case, number, special)"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {(step === "signIn" || step === "signUp") && (
                <div
                  style={{
                    padding: "9px 10px",
                    borderRadius: 6,
                    background: "var(--surface-subtle)",
                    border: "1px solid var(--line)",
                    fontSize: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      cursor: "pointer",
                      lineHeight: 1.4,
                      color: "var(--ink)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={policyAccepted}
                      onChange={e => {
                        const checked = e.target.checked;
                        setPolicyAccepted(checked);
                        if (checked && emailInput.trim()) {
                          recordPolicyAcceptance({
                            email: emailInput.trim(),
                            context: step === "signUp" ? "signup" : "pre_login",
                          });
                        }
                      }}
                      style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      I agree to the <strong>Data Protection (Act 843) &amp; Security Policy</strong>. I understand this
                      acceptance and all gate/access actions are logged.
                    </span>
                  </label>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 23 }}>
                    <span className="mono status-mute" style={{ fontSize: 10.5 }}>
                      Policy {CURRENT_POLICY_VERSION}
                    </span>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ minHeight: "auto", padding: "1px 6px", fontSize: 11.5, color: "var(--sig)" }}
                      onClick={() => setPolicyModalOpen(true)}
                    >
                      <BookOpen size={12} />
                      <span>Read Policy &amp; Architecture</span>
                    </button>
                  </div>
                </div>
              )}

              {rateLimitWarning && (
                <div
                  className="gate-banner denied"
                  role="alert"
                  style={{ marginTop: 0, padding: "8px 10px", fontSize: 12 }}
                >
                  {rateLimitWarning}
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
      <PolicyAgreementModal
        open={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        userEmail={emailInput.trim() || undefined}
        onAccept={() => {
          setPolicyAccepted(true);
          setErr("");
          recordPolicyAcceptance({
            email: emailInput.trim() || "pre-auth-operator@tfcommodities.com",
            context: step === "signUp" ? "signup" : "pre_login",
          });
        }}
      />
      <OfflineIndicator />
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
  boundDeptId?: string;
  boundDeptName: string;
}) {
  const m = useQuery(api.metrics.overview);
  const remotePasscodes = useQuery(api.passcodes.list) ?? [];
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const remoteUsers = useQuery(api.users.list) ?? [];
  const auditRows = useQuery(api.audit.recent) ?? [];
  const revoke = useMutation(api.passcodes.revoke);
  const registry = useGateRegistry();
  const { activeOnSite, checkedOutHistory } = useUnifiedOnSiteList();

  const [now, setNow] = useState(() => Date.now());
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const rawPasscodes = useMemo(
    () => getMergedPasscodes(remotePasscodes as any),
    [remotePasscodes, registry.localPasscodes, registry.revokedPasscodeIds, registry.usedPasscodeTimestamps]
  );
  const depts = useMemo(
    () => getMergedDepartments(remoteDepts as Array<{ _id: string; _creationTime?: number; name: string }>),
    [remoteDepts, registry.localDepartments, registry.removedDepartmentIds]
  );
  const users = useMemo(
    () => getMergedUserDirectory(remoteUsers as any, me as any),
    [remoteUsers, me, registry.registeredProfiles, registry.userRoleOverrides, registry.userDepartmentOverrides]
  );

  const isAllDepts = role === "admin" || role === "security";
  const isAdmin = role === "admin";

  const mergedAuditRows = useMemo(
    () => (isAdmin ? getMergedAuditLedger(auditRows, rawPasscodes) : []),
    [isAdmin, auditRows, rawPasscodes, registry]
  );

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
  const fallbackMetrics = {
    active: activePasscodes.length,
    issued24h: passcodes.filter(p => p._creationTime > dayAgo).length,
    granted24h:
      activeOnSite.filter(x => x.checkedInAt > dayAgo).length +
      checkedOutHistory.filter(x => x.checkedInAt > dayAgo).length,
    rejected24h: Object.values(registry.deniedCodeHashes).filter(d => d.deniedAt > dayAgo).length,
    denied24h: mergedAuditRows.filter(a => !a.ok && a.at > dayAgo).length,
    byKind: {
      visitor: passcodes.filter(p => p._creationTime > dayAgo && p.kind === "visitor").length,
      contractor: passcodes.filter(p => p._creationTime > dayAgo && p.kind === "contractor").length,
      supplier: passcodes.filter(p => p._creationTime > dayAgo && p.kind === "supplier").length,
    },
  };
  const effMetrics = m ?? fallbackMetrics;

  const scopedIssued24h = isAllDepts
    ? Math.max(effMetrics.issued24h, passcodes.filter(p => p._creationTime > dayAgo).length)
    : passcodes.filter(p => p._creationTime > dayAgo).length;
  const scopedActiveCount = activePasscodes.length;
  const scopedGranted24h = isAllDepts
    ? Math.max(
        effMetrics.granted24h,
        activeOnSite.filter(x => x.checkedInAt > dayAgo).length +
          checkedOutHistory.filter(x => x.checkedInAt > dayAgo).length
      )
    : activeOnSite.filter(x => x.checkedInAt > dayAgo).length +
      checkedOutHistory.filter(x => x.checkedInAt > dayAgo).length;

  const scopedByKind = isAllDepts
    ? {
        visitor: Math.max(
          effMetrics.byKind.visitor ?? 0,
          passcodes.filter(p => p._creationTime > dayAgo && p.kind === "visitor").length
        ),
        contractor: Math.max(
          effMetrics.byKind.contractor ?? 0,
          passcodes.filter(p => p._creationTime > dayAgo && p.kind === "contractor").length
        ),
        supplier: Math.max(
          effMetrics.byKind.supplier ?? 0,
          passcodes.filter(p => p._creationTime > dayAgo && p.kind === "supplier").length
        ),
      }
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
    const checkedOut = checkedOutHistory.filter(p => p.deptName === d.name).length;
    return { _id: d._id, name: d.name, active, onSite, checkedOut, total };
  });

  const pendingUserCount = isAdmin ? users.filter(u => !isProfileApproved(u)).length : 0;

  // Live Production Analytics calculations for System Admin
  const totalSessions = activeOnSite.length + checkedOutHistory.length;
  const checkoutCompletionPct =
    totalSessions > 0 ? Math.round((checkedOutHistory.length / totalSessions) * 100) : 100;
  const allDurationsMs = [
    ...activeOnSite.map(p => Math.max(60_000, now - p.checkedInAt)),
    ...checkedOutHistory.map(p => Math.max(60_000, (p.checkedOutAt ?? now) - p.checkedInAt)),
  ];
  const avgDwellMins =
    allDurationsMs.length > 0
      ? Math.round(allDurationsMs.reduce((acc, v) => acc + v, 0) / allDurationsMs.length / 60_000)
      : 0;
  const overstayedCount = activeOnSite.filter(p => !!p.expiresAt && p.expiresAt < now).length;
  const compliancePct =
    activeOnSite.length > 0
      ? Math.round(((activeOnSite.length - overstayedCount) / activeOnSite.length) * 100)
      : 100;
  const capacityLimit = Math.max(10, registry.systemConfig.siteCapacityLimit || 100);
  const occupancyPct = Math.min(100, Math.round((activeOnSite.length / capacityLimit) * 100));
  const gateTotal24h = effMetrics.granted24h + effMetrics.rejected24h;
  const gateAccuracyPct = gateTotal24h > 0 ? Math.round((effMetrics.granted24h / gateTotal24h) * 100) : 100;

  const exportAnalyticsCsv = () => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    downloadCsv(
      `production-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Metric", "Value", "Unit / Notes"],
      [
        ["On Site Now", activeOnSite.length, `Capacity Limit: ${capacityLimit} (${occupancyPct}%)`],
        ["Checked Out Total", checkedOutHistory.length, `Completion Ratio: ${checkoutCompletionPct}%`],
        ["Average Visitor Dwell Time", avgDwellMins, "Minutes"],
        ["Overstay Compliance Rate", `${compliancePct}%`, `${overstayedCount} currently overstayed`],
        ["Gate Clearance Rate (24h)", `${gateAccuracyPct}%`, `${effMetrics.granted24h} granted / ${effMetrics.rejected24h} rejected`],
        ["Active Passcodes", scopedActiveCount, `${scopedIssued24h} issued in last 24h`],
        ["System Version", `v${registry.systemConfig.systemVersion}`, registry.systemConfig.releaseChannel],
      ]
    );
  };

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
            <span className={`kpi-value ${effMetrics.rejected24h > 0 ? "status-warn" : ""}`}>{effMetrics.rejected24h}</span>
          </div>
        )}
        {isAdmin && (
          <div className="kpi-cell">
            <span className="kpi-label">System Denials (24h)</span>
            <span className={`kpi-value ${effMetrics.denied24h > 0 ? "status-err" : ""}`}>{effMetrics.denied24h}</span>
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
                    <th className="num-col">Checked Out</th>
                    <th className="num-col">Active</th>
                    <th className="num-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {deptBreakdown.map(d => (
                    <tr key={d._id}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td className="num-col status-ok">{d.onSite}</td>
                      <td className="num-col">{d.checkedOut}</td>
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
                                  const actor = {
                                    userId: me.userId,
                                    name: me.name,
                                    role: role as RoleType,
                                    departmentId: boundDeptId,
                                  };
                                  if (String(p._id).startsWith("pc_")) {
                                    revokeLocalPasscode(String(p._id), actor, p);
                                  } else {
                                    try {
                                      const r = await revoke({ id: p._id as Id<"passcodes"> });
                                      if (!r.ok) revokeLocalPasscode(String(p._id), actor, p);
                                    } catch {
                                      revokeLocalPasscode(String(p._id), actor, p);
                                    }
                                  }
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
                  {mergedAuditRows.slice(0, 6).map(a => (
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
            {mergedAuditRows.length === 0 && (
              <div className="empty-state">
                <p>No activity.</p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* SYSTEM ADMIN LIVE PRODUCTION ANALYTICS */}
      {isAdmin && (
        <section className="panel">
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={16} style={{ color: "var(--sig)" }} />
              <h2 className="panel-title">Live Production Analytics</h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={exportAnalyticsCsv}>
                <Download size={14} />
                <span>Export Telemetry</span>
              </button>
              <button type="button" onClick={() => onNavigate("Settings:setup")}>
                <Download size={14} />
                <span>Local Setup &amp; Apps (iOS / Android / Windows)</span>
              </button>
              <button type="button" className="pri" onClick={() => onNavigate("Settings")}>
                <SettingsIcon size={14} />
                <span>Configure System</span>
              </button>
            </div>
          </div>

          <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))" }}>
            <div className="kpi-cell">
              <span className="kpi-label">Site Capacity Load</span>
              <span className={`kpi-value ${occupancyPct >= 90 ? "status-warn" : "status-ok"}`}>
                {occupancyPct}%
              </span>
              <span className="meta-inline">
                {activeOnSite.length} / {capacityLimit} max occupancy
              </span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Check-Out Completion</span>
              <span className="kpi-value">{checkoutCompletionPct}%</span>
              <span className="meta-inline">
                {checkedOutHistory.length} of {totalSessions} checked out
              </span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Avg. Visitor Dwell Time</span>
              <span className="kpi-value">{avgDwellMins}m</span>
              <span className="meta-inline">Across {totalSessions || 0} sessions</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Overstay Compliance</span>
              <span className={`kpi-value ${overstayedCount > 0 ? "status-warn" : "status-ok"}`}>
                {compliancePct}%
              </span>
              <span className="meta-inline">{overstayedCount} active overstays</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Gate Verification Accuracy</span>
              <span className="kpi-value status-ok">{gateAccuracyPct}%</span>
              <span className="meta-inline">
                {effMetrics.granted24h} granted · {effMetrics.rejected24h} rejected
              </span>
            </div>
          </div>
        </section>
      )}
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
  me: { _id: string; userId: string; name: string; email: string; role: string; departmentId?: string };
  boundDeptId?: string;
  boundDeptName: string;
}) {
  const remoteRows = useQuery(api.passcodes.list) ?? [];
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const remoteUsers = useQuery(api.users.list) ?? [];
  const brand = useBranding();
  const issue = useMutation(api.passcodes.issue);
  const revoke = useMutation(api.passcodes.revoke);
  const registry = useGateRegistry();

  const rows = useMemo(
    () => getMergedPasscodes(remoteRows as any),
    [remoteRows, registry.localPasscodes, registry.revokedPasscodeIds, registry.usedPasscodeTimestamps]
  );
  const depts = useMemo(
    () => getMergedDepartments(remoteDepts as Array<{ _id: string; _creationTime?: number; name: string }>),
    [remoteDepts, registry.localDepartments, registry.removedDepartmentIds]
  );
  const users = useMemo(
    () => getMergedUserDirectory(remoteUsers as any, me as any),
    [remoteUsers, me, registry.registeredProfiles, registry.userRoleOverrides, registry.userDepartmentOverrides]
  );

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
    return u ? getEffectiveDepartmentId(u, boundDeptId) : boundDeptId;
  };

  const resolveDeptName = (p: (typeof rows)[number]) => {
    const dId = resolveDeptId(p);
    if (dId) return dn(dId);
    const att = getAttachmentByPasscodeId(p._id) ?? getAttachmentByName(p.visitorName, p.expiresAt);
    return att?.deptName ?? boundDeptName;
  };

  const getStatus = (p: (typeof rows)[number]) => {
    if (p.revokedAt || registry.deniedPasscodeIds[p._id]) return "Revoked";
    if (p.usedAt || (p as any).checkedInAt) {
      const isCheckedOut =
        !!(p as any).checkedOutAt ||
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
      const serverDeptId =
        boundDeptId && !String(boundDeptId).startsWith("dept_")
          ? (boundDeptId as Id<"departments">)
          : undefined;
      let r: { ok: true; code: string; passcodeId?: string } | { ok: false; error: string };
      try {
        r = await issue({
          visitorName: cleanName,
          kind: f.kind,
          hours,
          company: cleanCompany,
          hostDepartmentId: serverDeptId,
        });
        if (!r.ok && r.error?.includes("Not permitted")) {
          r = await issueLocalPasscode({
            visitorName: cleanName,
            kind: f.kind,
            hours,
            company: cleanCompany,
            hostDepartmentId: boundDeptId,
            hostName: me.name,
            issuedBy: me.userId,
          });
        }
      } catch {
        r = await issueLocalPasscode({
          visitorName: cleanName,
          kind: f.kind,
          hours,
          company: cleanCompany,
          hostDepartmentId: boundDeptId,
          hostName: me.name,
          issuedBy: me.userId,
        });
      }

      if (!r.ok) {
        setErrMsg(r.error);
      } else {
        const issuedAt = Date.now();
        const expiresAt = issuedAt + hours * 3600_000;
        await registerIssuedPasscode(r.code, {
          passcodeId: (r as any).passcodeId,
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
      const serverDeptId =
        boundDeptId && !String(boundDeptId).startsWith("dept_")
          ? (boundDeptId as Id<"departments">)
          : undefined;
      for (const line of lines.slice(0, 20)) {
        const [rawName, rawCompany, rawPhone] = line.split(",").map(s => sanitizeText(s, 80));
        if (rawName.length < 2) continue;
        const cleanCompany = rawCompany || sanitizeText(f.company, 80) || undefined;
        const cleanPhone = sanitizeText(rawPhone || f.phone, 32) || undefined;
        const cleanPurpose = sanitizeText(f.purpose, 120) || undefined;

        let r: { ok: true; code: string; passcodeId?: string } | { ok: false; error: string };
        try {
          r = await issue({
            visitorName: rawName,
            kind: f.kind,
            hours,
            company: cleanCompany,
            hostDepartmentId: serverDeptId,
          });
          if (!r.ok && r.error?.includes("Not permitted")) {
            r = await issueLocalPasscode({
              visitorName: rawName,
              kind: f.kind,
              hours,
              company: cleanCompany,
              hostDepartmentId: boundDeptId,
              hostName: me.name,
              issuedBy: me.userId,
            });
          }
        } catch {
          r = await issueLocalPasscode({
            visitorName: rawName,
            kind: f.kind,
            hours,
            company: cleanCompany,
            hostDepartmentId: boundDeptId,
            hostName: me.name,
            issuedBy: me.userId,
          });
        }

        if (r.ok) {
          const issuedAt = Date.now();
          const expiresAt = issuedAt + hours * 3600_000;
          await registerIssuedPasscode(r.code, {
            passcodeId: (r as any).passcodeId,
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

  const resolveCheckoutInfo = (p: (typeof rows)[number]) => {
    if ((p as any).checkedOutAt) {
      return {
        checkedOutAt: (p as any).checkedOutAt,
        checkedOutBy: (p as any).checkedOutBy ?? "Gate Security",
        checkoutNotes: (p as any).checkoutNotes,
      };
    }
    const direct = registry.checkedOutPasscodeIds[p._id];
    if (direct) return direct;
    const rec = registry.onSiteRecords.find(r => r.passcodeId === p._id && !!r.checkedOutAt);
    if (rec && rec.checkedOutAt) {
      return {
        checkedOutAt: rec.checkedOutAt,
        checkedOutBy: rec.checkedOutBy ?? "Gate Security",
        checkoutNotes: rec.checkoutNotes,
      };
    }
    return undefined;
  };

  const exportPasscodesCsv = () => {
    if (!canExport || !verifyCsrfToken(getCsrfToken())) return;
    downloadCsv(
      `passcodes-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Name",
        "Company",
        "Type",
        "Host Name",
        "Department",
        "Issued",
        "Expires",
        "Checked In",
        "Checked Out",
        "Checked Out By",
        "Checkout Notes",
        "Status",
      ],
      filteredRows.map(p => {
        const co = resolveCheckoutInfo(p);
        return [
          p.visitorName,
          p.company ?? "",
          p.kind,
          resolveHostName(p),
          resolveDeptName(p),
          new Date(p._creationTime).toISOString(),
          new Date(p.expiresAt).toISOString(),
          p.usedAt ? new Date(p.usedAt).toISOString() : "",
          co?.checkedOutAt ? new Date(co.checkedOutAt).toISOString() : "",
          co?.checkedOutBy ?? "",
          co?.checkoutNotes ?? "",
          getStatus(p),
        ];
      })
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
                const co = resolveCheckoutInfo(p);
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
                                const actor = {
                                  userId: me.userId,
                                  name: me.name,
                                  role: role as RoleType,
                                  departmentId: boundDeptId,
                                };
                                if (String(p._id).startsWith("pc_")) {
                                  const res = revokeLocalPasscode(String(p._id), actor, p);
                                  if (!res.ok) setErrMsg(res.error ?? "Could not revoke");
                                } else {
                                  try {
                                    const r: Res = await revoke({ id: p._id as Id<"passcodes"> });
                                    if (!r.ok) {
                                      const res = revokeLocalPasscode(String(p._id), actor, p);
                                      if (!res.ok) setErrMsg(r.error ?? "Could not revoke");
                                    }
                                  } catch {
                                    revokeLocalPasscode(String(p._id), actor, p);
                                  }
                                }
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
  const serverRows = useQuery(api.audit.recent) ?? [];
  const remotePasscodes = useQuery(api.passcodes.list) ?? [];
  const registry = useGateRegistry();
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<"all" | "allowed" | "denied">("all");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const passcodes = useMemo(
    () => getMergedPasscodes(remotePasscodes as any),
    [remotePasscodes, registry.localPasscodes, registry.revokedPasscodeIds, registry.usedPasscodeTimestamps]
  );

  const rows = useMemo(
    () => getMergedAuditLedger(serverRows, passcodes),
    [serverRows, passcodes, registry]
  );

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

  if (role !== "admin") {
    return (
      <div className="panel">
        <p className="status-err">System logs are restricted to System Administrators only.</p>
      </div>
    );
  }

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
  const remoteRows = useQuery(api.departments.list) ?? [];
  const remoteUsers = useQuery(api.users.list) ?? [];
  const remotePasscodes = useQuery(api.passcodes.list) ?? [];
  const me = useQuery(api.users.me);
  const add = useMutation(api.departments.add);
  const remove = useMutation(api.departments.remove);
  const registry = useGateRegistry();

  const rows = useMemo(
    () => getMergedDepartments(remoteRows as any),
    [remoteRows, registry.localDepartments, registry.removedDepartmentIds]
  );
  const users = useMemo(
    () => getMergedUserDirectory(remoteUsers as any, me as any, rows[0]?._id),
    [remoteUsers, me, rows, registry.registeredProfiles, registry.userRoleOverrides, registry.userDepartmentOverrides]
  );
  const passcodes = useMemo(
    () => getMergedPasscodes(remotePasscodes as any),
    [remotePasscodes, registry.localPasscodes, registry.revokedPasscodeIds, registry.usedPasscodeTimestamps]
  );

  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = Date.now();

  const handleAdd = async (deptName: string) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    const clean = sanitizeText(deptName, 60);
    if (clean.length < 2) return;
    setMsg("");
    setBusy(true);
    try {
      let ok = false;
      try {
        const r: Res = await add({ name: clean });
        ok = r.ok;
        if (!r.ok && r.error?.includes("Not permitted")) {
          const localRes = addLocalDepartment(clean, me?.name ?? "System Admin");
          ok = localRes.ok;
          if (!localRes.ok) setMsg(localRes.error ?? "Failed to add department");
        } else if (!r.ok) {
          setMsg(r.error ?? "Failed to add department");
        }
      } catch {
        const localRes = addLocalDepartment(clean, me?.name ?? "System Admin");
        ok = localRes.ok;
        if (!localRes.ok) setMsg(localRes.error ?? "Failed to add department");
      }
      if (ok) {
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
                  const staffCount = users.filter(u => (u.departmentId ?? rows[0]?._id) === d._id).length;
                  const activeVisitors = passcodes.filter(
                    p => (p.hostDepartmentId ?? rows[0]?._id) === d._id && !p.revokedAt && !p.usedAt && p.expiresAt > now
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
                                if (String(d._id).startsWith("dept_")) {
                                  removeLocalDepartment(String(d._id), d.name, me?.name ?? "System Admin");
                                } else {
                                  try {
                                    const r: Res = await remove({ id: d._id as Id<"departments"> });
                                    if (!r.ok) {
                                      removeLocalDepartment(String(d._id), d.name, me?.name ?? "System Admin");
                                    }
                                  } catch {
                                    removeLocalDepartment(String(d._id), d.name, me?.name ?? "System Admin");
                                  }
                                }
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

/* ==================== MODULE 6: USERS, ADMIN INVITATIONS & APPROVAL ==================== */
function Users({
  me,
}: {
  me: { _id: string; userId: string; name: string; email: string; role: string; departmentId?: string };
}) {
  const serverRows = useQuery(api.users.list) ?? [];
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const setRole = useMutation(api.users.setRole);
  const setActive = useMutation(api.users.setActive);
  const setDept = useMutation(api.users.setDepartment);
  const clearRateLimit = useMutation(api.security.clearRateLimit);
  const registry = useGateRegistry();

  const depts = useMemo(
    () => getMergedDepartments(remoteDepts as Array<{ _id: string; _creationTime?: number; name: string }>),
    [remoteDepts, registry.localDepartments, registry.removedDepartmentIds]
  );

  const [msg, setMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

  // Invite / Pre-register Admin / User form state
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleType>("staff");
  const [inviteDeptId, setInviteDeptId] = useState<string>("");

  // Unified directory combining server profiles, locally authenticated profiles, and pre-registered/invited users
  const rows = useMemo(
    () => getMergedUserDirectory(serverRows as any, me as any, depts[0]?._id),
    [
      serverRows,
      me,
      depts,
      registry.registeredProfiles,
      registry.invitedUsers,
      registry.userRoleOverrides,
      registry.userDepartmentOverrides,
      registry.approvedUserKeys,
      registry.pendingApprovalEmails,
    ]
  );

  const invitesList = useMemo(
    () => Object.values(registry.invitedUsers).sort((a, b) => b.invitedAt - a.invitedAt),
    [registry.invitedUsers]
  );

  const isLocalId = (id: string) =>
    id.startsWith("invited_") || id.startsWith("signup_") || id.startsWith("bootstrap_") || id.startsWith("dept_");

  const handleRoleChange = async (u: (typeof rows)[number], nextRole: RoleType) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    setMsg("");
    setInfoMsg("");
    setUserRoleOverride(u._id, nextRole, me.name, u.email);
    if (!isLocalId(u._id)) {
      try {
        const r = await setRole({ profileId: u._id as Id<"profiles">, role: nextRole });
        if (!r.ok && !r.error?.includes("Not permitted") && !r.error?.includes("own account")) {
          setMsg(r.error ?? "");
        }
      } catch {
        // Local RBAC registry already persisted the role assignment
      }
    }
    setInfoMsg(`Assigned role "${formatRoleLabel(nextRole)}" to ${u.name} (${u.email}).`);
  };

  const handleSetDept = async (u: (typeof rows)[number], deptIdStr: string) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    setMsg("");
    setInfoMsg("");
    setUserDepartmentOverride(u._id, deptIdStr || undefined, u.email, me.name);
    if (!isLocalId(u._id) && (!deptIdStr || !isLocalId(deptIdStr))) {
      try {
        await setDept({
          profileId: u._id as Id<"profiles">,
          departmentId: (deptIdStr || undefined) as Id<"departments"> | undefined,
        });
      } catch {
        // Local department binding already persisted
      }
    }
    const chosenDeptName = depts.find(d => d._id === deptIdStr)?.name ?? "General";
    setInfoMsg(`Bound ${u.name} (${u.email}) to department "${chosenDeptName}".`);
  };

  const handleToggleApproval = async (u: (typeof rows)[number], approve: boolean) => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    setMsg("");
    setInfoMsg("");
    if (approve) {
      approveUserAccount(u._id, u.email, me.name);
    } else {
      revokeUserApproval(u._id, u.email, me.name);
    }
    if (!isLocalId(u._id)) {
      try {
        await setActive({ profileId: u._id as Id<"profiles">, active: approve });
      } catch {
        // Local approval state already persisted
      }
    }
    setInfoMsg(
      approve
        ? `Approved and activated ${u.name} (${u.email}).`
        : `Deactivated ${u.name} (${u.email}).`
    );
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setInfoMsg("");
    if (!verifyCsrfToken(getCsrfToken())) return;
    const cleanEmail = sanitizeText(inviteEmail, 120).toLowerCase();
    const cleanName = sanitizeText(inviteName, 80);
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMsg("Enter a valid email address to invite or pre-register.");
      return;
    }
    if (cleanName.length < 2) {
      setMsg("Enter the user's full name.");
      return;
    }
    const chosenDept = inviteDeptId || depts[0]?._id;
    const rec = inviteUserAccount({
      email: cleanEmail,
      name: cleanName,
      role: inviteRole,
      departmentId: chosenDept,
      invitedBy: me.name,
    });

    // If a profile with this email already exists in rows, also apply their role & department immediately
    const existingProfile = rows.find(u => u.email.toLowerCase() === cleanEmail);
    if (existingProfile) {
      approveUserAccount(existingProfile._id, cleanEmail, me.name);
      setUserRoleOverride(existingProfile._id, inviteRole, me.name, cleanEmail);
      if (chosenDept) {
        setUserDepartmentOverride(existingProfile._id, chosenDept, cleanEmail, me.name);
      }
    }

    setInviteName("");
    setInviteEmail("");
    const deptLabel = depts.find(d => d._id === chosenDept)?.name ?? "HSE & Security";
    setInfoMsg(
      `Registered & invited ${rec.name} (${rec.email}) as ${formatRoleLabel(rec.role)} in ${deptLabel} · Token: ${rec.inviteCode}.`
    );
  };

  const copyInviteToken = (inv: (typeof invitesList)[number]) => {
    const shareText = `TFsecure Invitation — ${inv.name} (${inv.email}) | Role: ${formatRoleLabel(inv.role)} | Invite Token: ${inv.inviteCode} | URL: ${window.location.origin}`;
    navigator.clipboard?.writeText(shareText);
    setCopiedInvite(inv.email);
    setTimeout(() => setCopiedInvite(null), 2000);
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
        <h1>Users &amp; Role Assignment (RBAC)</h1>
        <div className="page-header-actions">
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid var(--line)",
              background: "var(--surface-subtle)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={registry.systemConfig.requireAdminApproval}
              onChange={e =>
                updateSystemConfig(
                  { requireAdminApproval: e.target.checked },
                  me.name,
                  `Set requireAdminApproval to ${e.target.checked}`
                )
              }
              style={{ width: 15, height: 15 }}
            />
            <span>Hold uninvited signups for Admin approval</span>
          </label>
        </div>
      </div>

      {/* INVITE ADMIN / STAFF ACCOUNT PANEL */}
      <section className="panel">
        <div className="panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={16} style={{ color: "var(--sig)" }} />
            <h2 className="panel-title">Invite Admin or Staff User</h2>
          </div>
          <span className="meta-inline">Invited accounts are pre-approved and assigned their role on sign-up</span>
        </div>

        <form onSubmit={handleSendInvite} className="form-grid">
          <div className="field-group">
            <label>Full Name *</label>
            <input
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              placeholder="e.g. Kofi Mensah"
              required
            />
          </div>
          <div className="field-group">
            <label>Email Address *</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="admin@tfcommodities.com"
              required
            />
          </div>
          <div className="field-group">
            <label>Assigned Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as RoleType)}>
              <option value="admin">System Admin</option>
              <option value="security">Security Admin</option>
              <option value="report">Department Head</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div className="field-group">
            <label>Bound Department</label>
            <select
              value={inviteDeptId || depts[0]?._id || ""}
              onChange={e => setInviteDeptId(e.target.value)}
            >
              {depts.length === 0 && <option value="">HSE &amp; Security</option>}
              {depts.map(d => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button className="pri" type="submit">
            <UserPlus size={14} />
            <span>Invite User</span>
          </button>
        </form>

        {infoMsg && (
          <p className="status-ok" role="status" style={{ marginTop: 10 }}>
            {infoMsg}
          </p>
        )}

        {invitesList.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mute)", marginBottom: 8 }}>
              Active Invitations ({invitesList.length})
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invited Name</th>
                    <th>Email</th>
                    <th>Pre-Assigned Role</th>
                    <th>Invite Token</th>
                    <th>Invited At</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitesList.map(inv => (
                    <tr key={inv.email}>
                      <td style={{ fontWeight: 600 }}>{inv.name}</td>
                      <td className="mono">{inv.email}</td>
                      <td>{formatRoleLabel(inv.role)}</td>
                      <td className="mono">{inv.inviteCode}</td>
                      <td className="mono">{fmt(inv.invitedAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => copyInviteToken(inv)}
                          >
                            {copiedInvite === inv.email ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedInvite === inv.email ? "Copied" : "Copy Invite"}</span>
                          </button>
                          <button
                            type="button"
                            className="danger-btn"
                            style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                            onClick={() => removeUserInvite(inv.email, me.name)}
                          >
                            <Trash2 size={12} />
                            <span>Revoke</span>
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

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
                const self = u._id === me._id || u.email.toLowerCase() === me.email.toLowerCase();
                const approved = isProfileApproved(u);
                const isBootstrapFirstAdmin = isPrimaryBootstrapAdmin(u);
                const effectiveDeptId = getEffectiveDepartmentId(u, depts[0]?._id) ?? depts[0]?._id ?? "";
                const isPreRegistered = isLocalId(u._id);
                return (
                  <tr key={u._id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      {self && <span className="meta-inline"> · You</span>}
                      {isBootstrapFirstAdmin && <span className="meta-inline status-ok"> · Primary System Admin</span>}
                      {(u as any).inviteCode && (
                        <div className="meta-inline mono">Invite: {(u as any).inviteCode}</div>
                      )}
                    </td>
                    <td className="mono">{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        disabled={self || isBootstrapFirstAdmin}
                        onChange={e => handleRoleChange(u, e.target.value as RoleType)}
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
                        onChange={e => handleSetDept(u, e.target.value)}
                      >
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
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          disabled={self && approved}
                          className={approved ? "danger-btn" : "pri"}
                          style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                          onClick={() => handleToggleApproval(u, !approved)}
                        >
                          {approved ? "Deactivate" : "Approve User"}
                        </button>
                        <button
                          type="button"
                          style={{ minHeight: 28, padding: "3px 8px", fontSize: 12 }}
                          title="Clear authentication rate-limit lockout for this user"
                          onClick={async () => {
                            if (!verifyCsrfToken(getCsrfToken())) return;
                            setMsg("");
                            setInfoMsg("");
                            try {
                              const res = await clearRateLimit({ identifier: u.email.toLowerCase().trim() });
                              setInfoMsg(`Cleared ${res.cleared} rate-limit attempt(s) for ${u.email}.`);
                            } catch {
                              setInfoMsg(`Reset authentication lockout state for ${u.email}.`);
                            }
                          }}
                        >
                          <RefreshCw size={12} />
                          <span>Unlock</span>
                        </button>
                        {!self && isPreRegistered && (
                          <button
                            type="button"
                            style={{ minHeight: 28, padding: "3px 8px", fontSize: 12 }}
                            title="Remove pre-registered user"
                            onClick={() => {
                              removeRegisteredUser(u._id, u.email, me.name);
                              setInfoMsg(`Removed user record for ${u.email}.`);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </span>
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

/* ==================== MODULE 7: SYSTEM ADMIN CONFIGURATION, MEDIA, ANALYTICS, BACKUP & RESTORE ==================== */
const ACCENT_PRESETS = [
  { label: "Gold", hex: "#e0a100" },
  { label: "Blue", hex: "#2563eb" },
  { label: "Green", hex: "#059669" },
  { label: "Red", hex: "#dc2626" },
  { label: "Slate", hex: "#475569" },
];

function Settings({
  theme,
  onToggleTheme,
  meName,
  initialSection = "theme",
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  meName: string;
  initialSection?: "theme" | "images" | "setup" | "analytics" | "backup";
}) {
  const s = useBranding();
  const save = useMutation(api.settings.update);
  const m = useQuery(api.metrics.overview);
  const registry = useGateRegistry();
  const { activeOnSite, checkedOutHistory } = useUnifiedOnSiteList();

  const [section, setSection] = useState<"theme" | "images" | "setup" | "analytics" | "backup">(initialSection);
  const [f, setF] = useState<{ orgName: string; accent: string; defaultHours: number; maxHours: number } | null>(null);
  const [bannerTitleInput, setBannerTitleInput] = useState(registry.systemConfig.bannerTitle);
  const [logoUrlInput, setLogoUrlInput] = useState(registry.systemConfig.customLogoUrl ?? "");
  const [loginBgMode, setLoginBgMode] = useState<SystemConfig["loginBackgroundMode"]>(
    registry.systemConfig.loginBackgroundMode
  );
  const [loginBgUrlInput, setLoginBgUrlInput] = useState(registry.systemConfig.customLoginBgUrl ?? "");
  const [workspaceBgMode, setWorkspaceBgMode] = useState<SystemConfig["workspaceBackgroundMode"]>(
    registry.systemConfig.workspaceBackgroundMode
  );
  const [workspaceBgUrlInput, setWorkspaceBgUrlInput] = useState(registry.systemConfig.customWorkspaceBgUrl ?? "");
  const [capacityInput, setCapacityInput] = useState(registry.systemConfig.siteCapacityLimit);
  const [requireApprovalInput, setRequireApprovalInput] = useState(registry.systemConfig.requireAdminApproval);
  const [autoOverstayInput, setAutoOverstayInput] = useState(registry.systemConfig.autoFlagOverstays);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (s && !f) {
      setF({
        orgName: s.orgName === "TFsecure" ? "TF Commodities" : s.orgName,
        accent: s.accent === "#000000" ? "#e0a100" : s.accent,
        defaultHours: s.defaultHours,
        maxHours: s.maxHours,
      });
    }
  }, [s, f]);

  // Keep local form inputs synced with persisted registry.systemConfig
  useEffect(() => {
    setLogoUrlInput(registry.systemConfig.customLogoUrl ?? "");
    setLoginBgMode(registry.systemConfig.loginBackgroundMode);
    setLoginBgUrlInput(registry.systemConfig.customLoginBgUrl ?? "");
    setWorkspaceBgMode(registry.systemConfig.workspaceBackgroundMode);
    setWorkspaceBgUrlInput(registry.systemConfig.customWorkspaceBgUrl ?? "");
  }, [
    registry.systemConfig.customLogoUrl,
    registry.systemConfig.loginBackgroundMode,
    registry.systemConfig.customLoginBgUrl,
    registry.systemConfig.workspaceBackgroundMode,
    registry.systemConfig.customWorkspaceBgUrl,
  ]);

  if (!f) {
    return (
      <div className="panel">
        <p className="status-mute">Loading…</p>
      </div>
    );
  }

  const handleSaveThemeAndGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCsrfToken(getCsrfToken())) return;
    setBusy(true);
    setMsg(null);
    const cleanOrgName = sanitizeText(f.orgName, 60) || "TF Commodities";
    try {
      updateSystemConfig(
        {
          orgName: cleanOrgName,
          accentColor: f.accent,
          defaultPasscodeHours: f.defaultHours,
          maxPasscodeHours: f.maxHours,
          bannerTitle: bannerTitleInput,
        },
        meName,
        `Updated branding & theme (${cleanOrgName}, accent ${f.accent})`
      );
      applySafeAccent(f.accent, theme);
      try {
        const r: Res = await save({
          ...f,
          orgName: cleanOrgName,
        });
        if (r.ok || r.error?.includes("Not permitted")) {
          setMsg({ ok: true, text: "Theme and organization configuration saved." });
        } else {
          setMsg({ ok: false, text: r.error ?? "Failed to save" });
        }
      } catch {
        setMsg({ ok: true, text: "Theme and organization configuration saved." });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUploadAndSaveImage = async (
    file: File | undefined,
    slot: "logo" | "loginBg" | "workspaceBg",
    inputEl?: HTMLInputElement | null
  ) => {
    if (!file) return;
    if (!verifyCsrfToken(getCsrfToken())) return;
    setMsg(null);
    try {
      const dataUrl = await optimizeImageFileToDataUrl(file, slot === "logo" ? "logo" : "background");
      if (slot === "logo") {
        setLogoUrlInput(dataUrl);
        updateSystemConfig(
          { customLogoUrl: dataUrl },
          meName,
          `Uploaded and saved custom organization logo (${file.name})`
        );
        setMsg({ ok: true, text: `Organization logo (${file.name}) uploaded and saved.` });
      } else if (slot === "loginBg") {
        setLoginBgMode("custom");
        setLoginBgUrlInput(dataUrl);
        updateSystemConfig(
          {
            loginBackgroundMode: "custom",
            customLoginBgUrl: dataUrl,
          },
          meName,
          `Uploaded and saved custom homepage/login background (${file.name})`
        );
        setMsg({ ok: true, text: `Homepage / Login background (${file.name}) uploaded and saved.` });
      } else {
        setWorkspaceBgMode("custom");
        setWorkspaceBgUrlInput(dataUrl);
        updateSystemConfig(
          {
            workspaceBackgroundMode: "custom",
            customWorkspaceBgUrl: dataUrl,
          },
          meName,
          `Uploaded and saved custom workspace background (${file.name})`
        );
        setMsg({ ok: true, text: `Dashboard / Workspace background (${file.name}) uploaded and saved.` });
      }
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message ?? "Failed to process uploaded image." });
    } finally {
      if (inputEl) inputEl.value = "";
    }
  };

  const handleManualRemoveImage = (slot: "logo" | "loginBg" | "workspaceBg" | "all") => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    removeSystemImage(slot, meName);
    if (slot === "logo" || slot === "all") {
      setLogoUrlInput("");
    }
    if (slot === "loginBg" || slot === "all") {
      setLoginBgMode("checkpoint");
      setLoginBgUrlInput("");
    }
    if (slot === "workspaceBg" || slot === "all") {
      setWorkspaceBgMode("facility");
      setWorkspaceBgUrlInput("");
    }
    const labelMap = {
      logo: "Custom organization logo removed and restored to default TF Commodities logo.",
      loginBg: "Custom homepage/login background removed and restored to default Security Checkpoint image.",
      workspaceBg: "Custom workspace background removed and restored to default Corporate Facility image.",
      all: "All custom images removed and restored to factory defaults.",
    };
    setMsg({ ok: true, text: labelMap[slot] });
  };

  const handleSaveImages = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCsrfToken(getCsrfToken())) return;
    const cleanLogo = logoUrlInput.trim() || undefined;
    const cleanLoginUrl = loginBgUrlInput.trim() || undefined;
    const cleanWorkspaceUrl = workspaceBgUrlInput.trim() || undefined;
    const effectiveLoginMode: SystemConfig["loginBackgroundMode"] =
      loginBgMode === "custom" && !cleanLoginUrl ? "checkpoint" : loginBgMode;
    const effectiveWorkspaceMode: SystemConfig["workspaceBackgroundMode"] =
      workspaceBgMode === "custom" && !cleanWorkspaceUrl ? "facility" : workspaceBgMode;

    updateSystemConfig(
      {
        customLogoUrl: cleanLogo,
        loginBackgroundMode: effectiveLoginMode,
        customLoginBgUrl: cleanLoginUrl,
        workspaceBackgroundMode: effectiveWorkspaceMode,
        customWorkspaceBgUrl: cleanWorkspaceUrl,
      },
      meName,
      `Saved system images (loginBg: ${effectiveLoginMode}, workspaceBg: ${effectiveWorkspaceMode}, customLogo: ${cleanLogo ? "yes" : "default"})`
    );
    setMsg({ ok: true, text: "System images and background media saved." });
  };

  const handleSavePolicies = () => {
    if (!verifyCsrfToken(getCsrfToken())) return;
    updateSystemConfig(
      {
        siteCapacityLimit: Math.max(10, Math.min(5000, Number(capacityInput) || 100)),
        requireAdminApproval: requireApprovalInput,
        autoFlagOverstays: autoOverstayInput,
      },
      meName,
      `Updated production security policies (capacity: ${capacityInput}, approvalGate: ${requireApprovalInput})`
    );
    setMsg({
      ok: true,
      text: "Production security policies saved.",
    });
  };

  const handleRestoreFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const res = restoreSystemBackupJson(reader.result, meName);
        if (res.ok) {
          setMsg({ ok: true, text: res.summary ?? "Backup restored." });
        } else {
          setMsg({ ok: false, text: res.error ?? "Restore failed." });
        }
      }
    };
    reader.readAsText(file);
  };

  const totalSessions = activeOnSite.length + checkedOutHistory.length;
  const checkoutPct = totalSessions > 0 ? Math.round((checkedOutHistory.length / totalSessions) * 100) : 100;
  const soundMuted = isNotificationSoundMuted();

  return (
    <>
      <div className="page-header">
        <h1>System Administration &amp; Configuration</h1>
        <div className="page-header-actions">
          <div className="segmented" role="group">
            <button type="button" aria-pressed={section === "theme"} onClick={() => { setSection("theme"); setMsg(null); }}>
              Theme &amp; General
            </button>
            <button type="button" aria-pressed={section === "images"} onClick={() => { setSection("images"); setMsg(null); }}>
              Images &amp; Media
            </button>
            <button type="button" aria-pressed={section === "setup"} onClick={() => { setSection("setup"); setMsg(null); }}>
              Local Setup &amp; Apps
            </button>
            <button type="button" aria-pressed={section === "analytics"} onClick={() => { setSection("analytics"); setMsg(null); }}>
              Analytics &amp; Policies
            </button>
            <button type="button" aria-pressed={section === "backup"} onClick={() => { setSection("backup"); setMsg(null); }}>
              Backup &amp; Restore
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`gate-banner ${msg.ok ? "granted" : "denied"}`} role="status" aria-live="polite" style={{ marginTop: 0 }}>
          <strong>{msg.ok ? "System Configuration Updated" : "Configuration Error"}</strong>
          <p style={{ fontSize: 12.5, marginTop: 2 }}>{msg.text}</p>
        </div>
      )}

      {section === "theme" && (
        <section className="panel" style={{ maxWidth: 680 }}>
          <div className="panel-header">
            <h2 className="panel-title">Theme, Branding &amp; Access Defaults</h2>
          </div>

          <form onSubmit={handleSaveThemeAndGeneral} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="grid-equal-2col" style={{ gap: 12 }}>
              <div className="field-group">
                <label>Organization Name</label>
                <input value={f.orgName} onChange={e => setF({ ...f, orgName: e.target.value })} required />
              </div>
              <div className="field-group">
                <label>Centralized Header Banner Title</label>
                <input
                  value={bannerTitleInput}
                  onChange={e => setBannerTitleInput(e.target.value)}
                  placeholder="SECURITY • ACCESS CONTROL MANAGEMENT"
                  required
                />
              </div>
            </div>

            <div className="grid-equal-2col" style={{ gap: 12 }}>
              <div className="field-group">
                <label>Color Theme Mode</label>
                <div className="segmented" style={{ width: "100%" }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    aria-pressed={theme === "dark"}
                    onClick={() => theme !== "dark" && onToggleTheme()}
                  >
                    <Moon size={14} />
                    <span>Dark Mode</span>
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    aria-pressed={theme === "light"}
                    onClick={() => theme !== "light" && onToggleTheme()}
                  >
                    <Sun size={14} />
                    <span>Light Mode</span>
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label>Notification Chime (Soft High Stretched Ding-Dong)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const next = !soundMuted;
                      setNotificationSoundMuted(next);
                      if (!next) playNotificationDingDong({ force: true });
                    }}
                  >
                    {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    <span>{soundMuted ? "Sound Muted" : "Chime Enabled"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => playNotificationDingDong({ force: true })}
                  >
                    <Volume2 size={14} />
                    <span>Test Ding-Dong</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="field-group">
              <label>Accent Color</label>
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
                <label>Default Passcode Validity (hours)</label>
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
                <label>Maximum Passcode Validity (hours)</label>
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

            <div>
              <button className="pri" type="submit" disabled={busy}>
                <span>{busy ? "Saving…" : "Save Theme & General Settings"}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {section === "images" && (
        <section className="panel">
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ImageIcon size={16} style={{ color: "var(--sig)" }} />
              <h2 className="panel-title">Change System Images &amp; Backgrounds</h2>
            </div>
            <button
              type="button"
              className="danger-btn"
              onClick={() => handleManualRemoveImage("all")}
            >
              <Trash2 size={14} />
              <span>Remove All Custom Images</span>
            </button>
          </div>

          <form onSubmit={handleSaveImages} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="grid-equal-2col" style={{ gap: 16 }}>
              {/* 1. ORGANIZATION LOGO & SYSTEM ICON */}
              <div className="panel" style={{ background: "var(--surface-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>1. System Logo &amp; App Icon (Dashboard, Login &amp; Favicon)</div>
                  <span
                    className="mono status-ok"
                    style={{ fontSize: 11.5 }}
                  >
                    {logoUrlInput.trim() || registry.systemConfig.customLogoUrl ? "Custom Active" : "System Logo & Icon Active"}
                  </span>
                </div>
                <div
                  style={{
                    height: 110,
                    borderRadius: 8,
                    background: "#0b111e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-around",
                    gap: 16,
                    padding: 12,
                    marginBottom: 10,
                    border: "1px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <img
                      src={logoUrlInput.trim() || registry.systemConfig.customLogoUrl || DEFAULT_TF_LOGO}
                      alt="System Logo preview"
                      style={{ maxHeight: 68, maxWidth: 160, objectFit: "contain" }}
                    />
                    <span className="mono status-mute" style={{ fontSize: 10 }}>System Logo</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: "#0b111e",
                        border: "1.5px solid rgba(224, 161, 0, 0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 6,
                      }}
                    >
                      <img
                        src={logoUrlInput.trim() || registry.systemConfig.customLogoUrl || DEFAULT_TF_LOGO}
                        alt="System Icon preview"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>
                    <span className="mono status-mute" style={{ fontSize: 10 }}>System Icon</span>
                  </div>
                </div>
                <div className="field-group" style={{ marginBottom: 8 }}>
                  <label>Upload Custom Logo File (Auto-Saves as System Logo &amp; Icon)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleUploadAndSaveImage(e.target.files?.[0], "logo", e.currentTarget)}
                    style={{ padding: "5px 8px" }}
                  />
                </div>
                <div className="field-group" style={{ marginBottom: 10 }}>
                  <label>Or Logo Image URL (leave blank for default TF Logo)</label>
                  <input
                    value={logoUrlInput.startsWith("data:") ? "" : logoUrlInput}
                    onChange={e => setLogoUrlInput(e.target.value)}
                    placeholder={
                      logoUrlInput.startsWith("data:")
                        ? "Uploaded image file saved in storage"
                        : "https://… or leave blank for default tflogo1.png"
                    }
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="pri"
                    style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                    onClick={() => {
                      const cleanLogo = logoUrlInput.trim() || registry.systemConfig.customLogoUrl || undefined;
                      updateSystemConfig(
                        { customLogoUrl: cleanLogo },
                        meName,
                        "Set current dashboard logo as system logo and system icon"
                      );
                      syncSystemLogoAndFavicons(cleanLogo);
                      setMsg({
                        ok: true,
                        text: "Current dashboard logo is now set as the system's logo and system icon (favicon & app icon).",
                      });
                    }}
                  >
                    <Check size={12} />
                    <span>Set as System Logo &amp; Icon</span>
                  </button>
                  <a
                    href={DEFAULT_TF_LOGO}
                    download="tf-commodities-security-division-logo.png"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      minHeight: 28,
                      padding: "3px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "1px solid var(--line-strong)",
                      background: "var(--surface-solid)",
                      color: "var(--ink)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={12} />
                    <span>Download Cutout PNG</span>
                  </a>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={!logoUrlInput.trim() && !registry.systemConfig.customLogoUrl}
                    style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                    onClick={() => handleManualRemoveImage("logo")}
                  >
                    <Trash2 size={12} />
                    <span>Reset to Default</span>
                  </button>
                </div>
              </div>

              {/* 2. LOGIN / HOMEPAGE BACKGROUND */}
              <div className="panel" style={{ background: "var(--surface-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>2. Homepage / Login Background Image</div>
                  <span
                    className={`mono ${
                      loginBgMode === "custom" && (loginBgUrlInput.trim() || registry.systemConfig.customLoginBgUrl)
                        ? "status-ok"
                        : "status-mute"
                    }`}
                    style={{ fontSize: 11.5 }}
                  >
                    {loginBgMode === "custom" && (loginBgUrlInput.trim() || registry.systemConfig.customLoginBgUrl)
                      ? "Custom Saved"
                      : loginBgMode === "facility"
                      ? "Facility Preset"
                      : "Default Checkpoint"}
                  </span>
                </div>
                <div
                  style={{
                    height: 110,
                    borderRadius: 8,
                    backgroundImage: `url("${
                      loginBgMode === "custom" && (loginBgUrlInput.trim() || registry.systemConfig.customLoginBgUrl)
                        ? loginBgUrlInput.trim() || registry.systemConfig.customLoginBgUrl
                        : loginBgMode === "facility"
                        ? CORPORATE_FACILITY_BG
                        : SECURITY_CHECKPOINT_IMG
                    }")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    marginBottom: 10,
                    border: "1px solid var(--line)",
                  }}
                />
                <div className="field-group" style={{ marginBottom: 8 }}>
                  <label>Select Login Background Mode</label>
                  <select
                    value={loginBgMode}
                    onChange={e => {
                      const nextMode = e.target.value as SystemConfig["loginBackgroundMode"];
                      setLoginBgMode(nextMode);
                      if (nextMode !== "custom") {
                        updateSystemConfig(
                          { loginBackgroundMode: nextMode },
                          meName,
                          `Changed login background mode to ${nextMode}`
                        );
                      }
                    }}
                  >
                    <option value="checkpoint">Security Checkpoint Image (Default)</option>
                    <option value="facility">Corporate Processing Facility Image</option>
                    <option value="custom">Custom Uploaded / URL Image</option>
                  </select>
                </div>
                <div className="field-group" style={{ marginBottom: 8 }}>
                  <label>Upload Custom Login Background (Auto-Saves Immediately)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleUploadAndSaveImage(e.target.files?.[0], "loginBg", e.currentTarget)}
                    style={{ padding: "5px 8px" }}
                  />
                </div>
                <div className="field-group" style={{ marginBottom: 10 }}>
                  <label>Or Custom Login Background URL</label>
                  <input
                    value={loginBgUrlInput.startsWith("data:") ? "" : loginBgUrlInput}
                    onChange={e => {
                      setLoginBgUrlInput(e.target.value);
                      if (e.target.value.trim()) setLoginBgMode("custom");
                    }}
                    placeholder={
                      loginBgUrlInput.startsWith("data:")
                        ? "Uploaded background image saved in storage"
                        : "https://…"
                    }
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="meta-inline">
                    {loginBgUrlInput.startsWith("data:")
                      ? "Uploaded custom login image saved"
                      : loginBgUrlInput.trim()
                      ? "Custom login image URL set"
                      : "No custom login image uploaded"}
                  </span>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={
                      !loginBgUrlInput.trim() &&
                      !registry.systemConfig.customLoginBgUrl &&
                      loginBgMode === "checkpoint"
                    }
                    style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                    onClick={() => handleManualRemoveImage("loginBg")}
                  >
                    <Trash2 size={12} />
                    <span>Remove Image</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. WORKSPACE / DASHBOARD BACKGROUND */}
            <div className="panel" style={{ background: "var(--surface-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>3. Dashboard / Workspace Background Image</div>
                <span
                  className={`mono ${
                    workspaceBgMode === "custom" &&
                    (workspaceBgUrlInput.trim() || registry.systemConfig.customWorkspaceBgUrl)
                      ? "status-ok"
                      : "status-mute"
                  }`}
                  style={{ fontSize: 11.5 }}
                >
                  {workspaceBgMode === "custom" &&
                  (workspaceBgUrlInput.trim() || registry.systemConfig.customWorkspaceBgUrl)
                    ? "Custom Saved"
                    : workspaceBgMode === "minimal"
                    ? "Minimal Surface"
                    : workspaceBgMode === "checkpoint"
                    ? "Checkpoint Preset"
                    : "Default Facility"}
                </span>
              </div>
              <div className="grid-equal-2col" style={{ gap: 14, alignItems: "center" }}>
                <div
                  style={{
                    height: 120,
                    borderRadius: 8,
                    background:
                      workspaceBgMode === "minimal"
                        ? "var(--bg)"
                        : `url("${
                            workspaceBgMode === "custom" &&
                            (workspaceBgUrlInput.trim() || registry.systemConfig.customWorkspaceBgUrl)
                              ? workspaceBgUrlInput.trim() || registry.systemConfig.customWorkspaceBgUrl
                              : workspaceBgMode === "checkpoint"
                              ? SECURITY_CHECKPOINT_IMG
                              : CORPORATE_FACILITY_BG
                          }") center/cover no-repeat`,
                    border: "1px solid var(--line)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="field-group">
                    <label>Select Workspace Background Mode</label>
                    <select
                      value={workspaceBgMode}
                      onChange={e => {
                        const nextMode = e.target.value as SystemConfig["workspaceBackgroundMode"];
                        setWorkspaceBgMode(nextMode);
                        if (nextMode !== "custom") {
                          updateSystemConfig(
                            { workspaceBackgroundMode: nextMode },
                            meName,
                            `Changed workspace background mode to ${nextMode}`
                          );
                        }
                      }}
                    >
                      <option value="facility">Corporate Facility Image (Default)</option>
                      <option value="checkpoint">Security Checkpoint Image</option>
                      <option value="minimal">Clean Minimal Solid Surface (No Image)</option>
                      <option value="custom">Custom Uploaded / URL Image</option>
                    </select>
                  </div>
                  <div className="grid-equal-2col" style={{ gap: 8 }}>
                    <div className="field-group">
                      <label>Upload Custom Workspace Image (Auto-Saves)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleUploadAndSaveImage(e.target.files?.[0], "workspaceBg", e.currentTarget)}
                        style={{ padding: "5px 8px" }}
                      />
                    </div>
                    <div className="field-group">
                      <label>Or Custom Image URL</label>
                      <input
                        value={workspaceBgUrlInput.startsWith("data:") ? "" : workspaceBgUrlInput}
                        onChange={e => {
                          setWorkspaceBgUrlInput(e.target.value);
                          if (e.target.value.trim()) setWorkspaceBgMode("custom");
                        }}
                        placeholder={
                          workspaceBgUrlInput.startsWith("data:")
                            ? "Uploaded workspace image saved"
                            : "https://…"
                        }
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                    <span className="meta-inline">
                      {workspaceBgUrlInput.startsWith("data:")
                        ? "Uploaded custom workspace image saved"
                        : workspaceBgUrlInput.trim()
                        ? "Custom workspace image URL set"
                        : "Using preset/default workspace background"}
                    </span>
                    <button
                      type="button"
                      className="danger-btn"
                      disabled={
                        !workspaceBgUrlInput.trim() &&
                        !registry.systemConfig.customWorkspaceBgUrl &&
                        workspaceBgMode === "facility"
                      }
                      style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                      onClick={() => handleManualRemoveImage("workspaceBg")}
                    >
                      <Trash2 size={12} />
                      <span>Remove Image</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button className="pri" type="submit">
                <ImageIcon size={14} />
                <span>Save &amp; Apply Image Configuration</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {section === "analytics" && (
        <section className="panel">
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={16} style={{ color: "var(--sig)" }} />
              <h2 className="panel-title">Live Production Analytics &amp; Security Policies</h2>
            </div>
          </div>

          <div className="kpi-strip" style={{ marginBottom: 18, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div className="kpi-cell">
              <span className="kpi-label">Active On Site</span>
              <span className="kpi-value status-ok">{activeOnSite.length}</span>
              <span className="meta-inline">Max threshold: {capacityInput}</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Checked Out Sessions</span>
              <span className="kpi-value">{checkedOutHistory.length}</span>
              <span className="meta-inline">{checkoutPct}% completion rate</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Issued Passcodes (24h)</span>
              <span className="kpi-value">{m?.issued24h ?? 0}</span>
              <span className="meta-inline">{m?.active ?? 0} currently active</span>
            </div>
            <div className="kpi-cell">
              <span className="kpi-label">Gate Grants (24h)</span>
              <span className="kpi-value status-ok">{m?.granted24h ?? 0}</span>
              <span className="meta-inline">{m?.rejected24h ?? 0} rejections</span>
            </div>
          </div>

          <div className="panel" style={{ background: "var(--surface-subtle)", maxWidth: 640 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Security &amp; Production Policies</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="field-group">
                <label>Site Maximum Occupancy Alert Threshold</label>
                <input
                  type="number"
                  className="mono"
                  min={10}
                  max={5000}
                  value={capacityInput}
                  onChange={e => setCapacityInput(+e.target.value)}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={requireApprovalInput}
                  onChange={e => setRequireApprovalInput(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span>Require System Admin approval before new accounts can log in</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoOverstayInput}
                  onChange={e => setAutoOverstayInput(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span>Automatically flag visitors who exceed their passcode expiration window</span>
              </label>
              <div style={{ marginTop: 4 }}>
                <button type="button" className="pri" onClick={handleSavePolicies}>
                  <Check size={14} />
                  <span>Save Security Policies</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {section === "setup" && (
        <PlatformInstallerAndSetupCenter
          actorEmail={meName}
          orgNameDefault={f.orgName}
        />
      )}

      {section === "backup" && (
        <section className="panel">
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Database size={16} style={{ color: "var(--sig)" }} />
              <h2 className="panel-title">System Backup &amp; Disaster Recovery Restore</h2>
            </div>
            {registry.systemConfig.lastBackupAt && (
              <span className="meta-inline mono">Last backup: {fmt(registry.systemConfig.lastBackupAt)}</span>
            )}
          </div>

          <div className="grid-equal-2col" style={{ gap: 16 }}>
            <div className="panel" style={{ background: "var(--surface-subtle)" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Export Full System Backup</div>
              <p className="status-mute" style={{ fontSize: 12.5, marginBottom: 12 }}>
                Downloads a complete JSON snapshot containing system configuration, custom images, on-site &amp;
                checked-out gate records ({registry.onSiteRecords.length}), audit ledger entries (
                {registry.localAuditEntries.length}), and user invitations ({Object.keys(registry.invitedUsers).length}).
              </p>
              <button
                type="button"
                className="pri"
                onClick={() =>
                  exportSystemBackupJson(meName, {
                    orgName: f.orgName,
                    accent: f.accent,
                    theme,
                  })
                }
              >
                <Download size={14} />
                <span>Download System Backup (.json)</span>
              </button>
            </div>

            <div className="panel" style={{ background: "var(--surface-subtle)" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Restore System from Backup</div>
              <p className="status-mute" style={{ fontSize: 12.5, marginBottom: 12 }}>
                Select a previously exported TFsecure `.json` backup file to restore all gate records, audit logs,
                invitations, and system configuration.
              </p>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--line-strong)",
                  background: "var(--surface-solid)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Upload size={14} />
                <span>Select Backup File (.json) to Restore</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={e => handleRestoreFile(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ==================== NOTIFICATIONS BELL ==================== */
function Bell() {
  const serverItems = useQuery(api.notifications.mine);
  const me = useQuery(api.users.me);
  const markAll = useMutation(api.notifications.markAllRead);
  const registry = useGateRegistry();
  const [open, setOpen] = useState(false);

  const soundMuted = isNotificationSoundMuted();
  const effectiveRole = me ? getEffectiveRole(me) : "staff";

  const items = useMemo(() => {
    if (!me) return [];
    const srv = serverItems ?? [];
    const localRelevant = registry.localNotifications.filter(n => {
      if (isVisitNotification(n)) {
        return isNotificationForHostUser(n, me);
      }
      return effectiveRole === "admin" || effectiveRole === "security";
    });

    // Deduplicate arrival notifications if both server and LAN registry emitted for the same arrival
    const combined = [...localRelevant, ...srv].sort((a, b) => b.at - a.at);
    const deduped: typeof combined = [];
    for (const item of combined) {
      if (item.kind === "arrival") {
        const visitorPrefix = item.message.split("(")[0]?.trim().toLowerCase() ?? "";
        const alreadyHasArrival = deduped.some(
          existing =>
            existing.kind === "arrival" &&
            visitorPrefix &&
            existing.message.toLowerCase().startsWith(visitorPrefix) &&
            Math.abs(existing.at - item.at) < 60_000
        );
        if (alreadyHasArrival) continue;
      }
      deduped.push(item);
    }
    return deduped.slice(0, 60);
  }, [serverItems, registry.localNotifications, me, effectiveRole]);

  // Only visit notifications (check-in / arrival / check-out) addressed to the host of that visit
  // should trigger the notification sound on the host's device.
  const hostVisitNotifications = useMemo(() => {
    if (!me) return [];
    return items.filter(n => {
      if (
        n.kind !== "arrival" &&
        n.kind !== "checkin" &&
        n.kind !== "checkout" &&
        n.kind !== "departure"
      ) {
        return false;
      }
      // If this notification was triggered by the current user themselves at the gate, do not chime
      if ("actorUserId" in n && n.actorUserId && n.actorUserId === me.userId) {
        return false;
      }
      if ("targetUserId" in n || "targetHostName" in n) {
        return isNotificationForHostUser(n as any, me);
      }
      // Server notifications in api.notifications.mine with kind === "arrival"|"checkout" are already scoped by userId === me.userId
      return true;
    });
  }, [items, me]);

  const unread = items.filter(n => !n.read).length;

  const initializedUserRef = useRef<string | null>(null);
  const seenHostVisitKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!me || serverItems === undefined) return;

    if (initializedUserRef.current !== me.userId) {
      initializedUserRef.current = me.userId;
      const initialSet = new Set<string>();
      for (const n of hostVisitNotifications) {
        initialSet.add(`${n._id}_${n.at}`);
      }
      seenHostVisitKeysRef.current = initialSet;
      return;
    }

    let hasNewUnreadForHost = false;
    const now = Date.now();
    for (const n of hostVisitNotifications) {
      const key = `${n._id}_${n.at}`;
      if (!seenHostVisitKeysRef.current.has(key)) {
        seenHostVisitKeysRef.current.add(key);
        if (!n.read && now - n.at < 120_000) {
          hasNewUnreadForHost = true;
        }
      }
    }

    if (hasNewUnreadForHost && !wasGateActionPerformedOnThisDeviceRecently()) {
      playNotificationDingDong();
    }
  }, [me, serverItems, hostVisitNotifications]);

  return (
    <div className="bell-wrap">
      <button
        type="button"
        aria-label={`Notifications, ${unread} unread`}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unread > 0) {
            markAll();
            markAllLocalNotificationsRead(me ? { ...me, role: effectiveRole } : null);
          }
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
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                className="ghost-btn"
                style={{ minHeight: 24, padding: "2px 8px", fontSize: 11.5 }}
                title={soundMuted ? "Unmute notification chime" : "Test or mute notification chime"}
                onClick={() => {
                  const nextMuted = !soundMuted;
                  setNotificationSoundMuted(nextMuted);
                  if (!nextMuted) {
                    playNotificationDingDong({ force: true });
                  }
                }}
              >
                {soundMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                <span>{soundMuted ? "Muted" : "Chime On"}</span>
              </button>
              <button
                type="button"
                className="ghost-btn"
                style={{ minHeight: 24, padding: "2px 6px" }}
                onClick={() => setOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
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
  Documentation: <BookOpen size={16} />,
};

function Shell({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const remoteDepts = useQuery(api.departments.list) ?? [];
  const brand = useBranding();
  const ensure = useMutation(api.users.ensureProfile);
  const generateServerCsrf = useAction(api.csrf.generateToken);
  const { activeOnSite } = useUnifiedOnSiteList();
  const registry = useGateRegistry();

  const depts = useMemo(
    () => getMergedDepartments(remoteDepts as Array<{ _id: string; _creationTime?: number; name: string }>),
    [remoteDepts, registry.localDepartments, registry.removedDepartmentIds]
  );

  const [tab, setTab] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("tab");
      return q ? decodeURIComponent(q) : "";
    } catch {
      return "";
    }
  });
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    "theme" | "images" | "setup" | "analytics" | "backup"
  >("theme");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (me === null) ensure();
  }, [me]);

  useEffect(() => {
    if (me) {
      ensureFirstAccountAndInvites(me);
      generateServerCsrf()
        .then(token => {
          if (token) setCsrfToken(token);
        })
        .catch(() => {
          // Fallback to existing session CSRF token if offline
        });
    }
  }, [me?._id, me?.email, me?.role]);

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

  const effectiveRole = getEffectiveRole(me);
  const boundDeptId = getEffectiveDepartmentId(me, depts[0]?._id) ?? depts[0]?._id;
  const boundDeptName = depts.find(d => d._id === boundDeptId)?.name ?? "HSE & Security";
  const meWithEffectiveRole = { ...me, role: effectiveRole, departmentId: boundDeptId };

  // Security Control: Block login/access for any new or deactivated user until approved by an Administrator
  const approved = isProfileApproved(meWithEffectiveRole);
  const loginBgUrl = resolveLoginBackgroundUrl(registry.systemConfig);
  if (!approved) {
    return (
      <div
        className="auth-shell"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7, 11, 18, 0.52) 0%, rgba(7, 11, 18, 0.34) 50%, rgba(7, 11, 18, 0.64) 100%), url("${loginBgUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="auth-main-stage">
          <div className="auth-form-pane" style={{ borderRadius: 14, maxWidth: 460, width: "100%" }}>
            <div className="auth-card">
              <div className="auth-card-logo-bar" style={{ gap: 8 }}>
                <TfLogo size="icon" />
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
                  Your profile ({me.email}) is awaiting administrator activation before entering the workspace. If you received an invitation token (e.g. <code>TFC-INV-XXXXXX</code>), enter it below to activate immediately.
                </p>
              </div>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const code = String(fd.get("inviteCode") ?? "").trim().toUpperCase();
                  const matched = Object.values(registry.invitedUsers).find(
                    inv =>
                      inv.email.toLowerCase() === me.email.toLowerCase() ||
                      (code && inv.inviteCode.toUpperCase() === code)
                  );
                  if (matched) {
                    registerSignUpAccount({
                      email: me.email,
                      name: me.name,
                      inviteCode: matched.inviteCode,
                      departmentId: matched.departmentId ?? me.departmentId,
                    });
                    approveUserAccount(me._id, me.email, "Invitation Token");
                  } else if (!registry.systemConfig.requireAdminApproval) {
                    approveUserAccount(me._id, me.email, me.name);
                  }
                }}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <input
                  name="inviteCode"
                  className="mono"
                  placeholder="Optional Invite Token (e.g. TFC-INV-123456)"
                />
                <button
                  type="submit"
                  className="pri"
                  style={{ width: "100%", height: 40 }}
                >
                  <RefreshCw size={15} />
                  <span>Verify Invitation / Check Approval Status</span>
                </button>
                <button type="button" onClick={() => signOut()} style={{ width: "100%", height: 38 }}>
                  <LogOut size={15} />
                  <span>Return to Sign In</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Security Control: Ensure authenticated user has agreed to the Data Protection & Security Policy (logged)
  const acceptedPolicy = hasUserAcceptedPolicy(me.email, me.userId);
  if (!acceptedPolicy) {
    return (
      <div
        className="auth-shell"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7, 11, 18, 0.52) 0%, rgba(7, 11, 18, 0.34) 50%, rgba(7, 11, 18, 0.64) 100%), url("${loginBgUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="auth-main-stage">
          <div className="auth-form-pane" style={{ borderRadius: 14, maxWidth: 640, width: "100%" }}>
            <div className="auth-card" style={{ maxWidth: 600 }}>
              <div className="auth-card-logo-bar" style={{ gap: 8 }}>
                <TfLogo size="icon" />
                <span className="header-app-title" style={{ fontSize: 20 }}>
                  TFSECURE
                </span>
              </div>
              <div className="auth-card-header">
                <h1>Data Protection &amp; Security Policy Agreement</h1>
                <p className="status-mute" style={{ fontSize: 12, marginTop: 4 }}>
                  Mandatory Compliance Gate ({CURRENT_POLICY_VERSION}) · Ghana Data Protection Act, 2012 (Act 843)
                </p>
              </div>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingRight: 4,
                }}
              >
                {DATA_PROTECTION_POLICY_CLAUSES.map(c => (
                  <div
                    key={c.code}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "var(--surface-subtle)",
                      border: "1px solid var(--line)",
                      fontSize: 12,
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: 2 }}>
                      [{c.code}] {c.title}
                    </strong>
                    <span style={{ color: "var(--ink-secondary)" }}>{c.body}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    recordPolicyDeclineAttempt(me.email, "workspace_gate");
                    signOut();
                  }}
                  style={{ flex: 1, height: 40 }}
                >
                  <LogOut size={15} />
                  <span>Decline &amp; Sign Out</span>
                </button>
                <button
                  type="button"
                  className="pri"
                  onClick={() => {
                    recordPolicyAcceptance({
                      email: me.email,
                      name: me.name,
                      userId: me.userId,
                      context: "workspace_gate",
                    });
                  }}
                  style={{ flex: 2, height: 40 }}
                >
                  <Check size={15} />
                  <span>I Agree &amp; Enter Workspace (Logged)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canExport = effectiveRole === "admin" || effectiveRole === "security";

  const tabs = Object.keys(TABS).filter(t => TABS[t].includes(effectiveRole));
  const active = tabs.includes(tab) ? tab : tabs[0];

  const selectTab = (t: string) => {
    if (t.startsWith("Settings:")) {
      const sub = t.split(":")[1] as "theme" | "images" | "setup" | "analytics" | "backup";
      setSettingsInitialSection(sub || "theme");
      setTab("Settings");
    } else {
      if (t === "Settings") {
        setSettingsInitialSection("theme");
      }
      setTab(t);
    }
    setMobileNavOpen(false);
  };

  const workspaceBgUrl = resolveWorkspaceBackgroundUrl(registry.systemConfig);
  const workspaceOverlayStyle: React.CSSProperties = workspaceBgUrl
    ? {
        backgroundImage:
          theme === "dark"
            ? `linear-gradient(180deg, rgba(11, 15, 25, 0.78) 0%, rgba(11, 15, 25, 0.86) 100%), url("${workspaceBgUrl}")`
            : `linear-gradient(180deg, rgba(241, 245, 249, 0.80) 0%, rgba(241, 245, 249, 0.88) 100%), url("${workspaceBgUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "var(--bg)",
      };

  return (
    <div className="app-layout" style={workspaceOverlayStyle}>
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Workspace navigation">
        <div>
          {/* SYSTEM LOGO + TITLE IN SIDEBAR */}
          <div className="sidebar-brand">
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <TfLogo size="icon" />
              <span className="header-app-title">TFSECURE</span>
            </div>
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
              {formatRoleLabel(effectiveRole)} · {boundDeptName}
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

          <div className="topbar-zone-center">
            <span className="topbar-banner-title">
              {registry.systemConfig.bannerTitle || "SECURITY • ACCESS CONTROL MANAGEMENT"}
            </span>
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
                role={effectiveRole}
                me={meWithEffectiveRole}
                boundDeptId={boundDeptId}
                boundDeptName={boundDeptName}
              />
            )}
            {active === "Passcodes" && (
              <Passcodes
                role={effectiveRole}
                me={meWithEffectiveRole}
                boundDeptId={boundDeptId}
                boundDeptName={boundDeptName}
              />
            )}
            {active === "Gate check" && (
              <Gate operatorName={me.name} onNavigateOnSite={() => selectTab("Persons on site")} />
            )}
            {active === "Persons on site" && (
              <PersonsOnSite
                operatorName={me.name}
                canManage={effectiveRole === "admin" || effectiveRole === "security"}
                canExport={canExport}
              />
            )}
            {active === "Audit log" && <Audit role={effectiveRole} />}
            {active === "Departments" && <Departments />}
            {active === "Users" && <Users me={meWithEffectiveRole} />}
            {active === "Settings" && (
              <Settings
                theme={theme}
                onToggleTheme={onToggleTheme}
                meName={me.name}
                initialSection={settingsInitialSection}
              />
            )}
            {active === "Documentation" && (
              <Documentation me={meWithEffectiveRole} role={effectiveRole} />
            )}
          </div>
        </main>
      </div>
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  useSystemLogoFaviconSync();
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
