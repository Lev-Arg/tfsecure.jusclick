import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  Lock,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  CURRENT_POLICY_VERSION,
  hasUserAcceptedPolicy,
  recordPolicyAcceptance,
  togglePilotScenarioCheck,
  useGateRegistry,
} from "../lib/gateRegistry";

export const JUSCLICK_PROPOSAL_SECTIONS = [
  {
    num: "1",
    title: "The Problem",
    summary: "Authorization gaps, host dependency, and exposure from shared visitor records.",
    paragraphs: [
      "A common manual process starts authorization only after a visitor reaches the gate: staff contact the host, wait for confirmation, and record the visit in a shared register. This can work, but it relies on timely communication and careful handling of the register.",
      "The main risks to assess are:",
    ],
    bullets: [
      "Authorization is not identity verification. A host can confirm that a visit is expected without proving who is physically at the gate.",
      "Gate processing depends on host availability, which can delay visitors and interrupt staff.",
      "A shared paper register may expose earlier entries. Digital records also require access controls, retention rules, and careful handling of exports.",
    ],
  },
  {
    num: "2",
    title: "Security, Operations, and Data Protection",
    summary: "Risks to evaluate under the organization's procedures and Ghana's Act 843 obligations.",
    paragraphs: [
      "Pre-authorization and a verifiable passcode can reduce reliance on calls at the gate, but a passcode does not establish the holder's physical identity. Site staff still need to follow the organization's identity, escort, and restricted-area procedures.",
      "Ghana's Data Protection Act, 2012 (Act 843) governs personal-data processing. The organization must determine its lawful purposes, notices, access controls, retention, security, and disclosure practices for visitor data.",
      "A paper register is not automatically unlawful, and using Jusclick-TeQiQ does not by itself establish legal compliance. The organization should assess its actual practices and seek qualified advice where needed.",
      "The goal is to improve authorization and record handling, then verify the operational and privacy outcomes through a controlled pilot.",
    ],
    bullets: [],
  },
  {
    num: "3",
    title: "The Jusclick-TeQiQ Approach",
    summary: "Issue a time-limited passcode, inspect it at the gate, then record check-in.",
    paragraphs: [
      "An authorized user creates a visit record and issues a six-digit passcode with an expiry time. The passcode is linked to the visitor, host, department, and any relevant visit details.",
      "At the gate, an operator inspects the code. A successful inspection displays the matching assignment but does not check the visitor in or consume the passcode. The operator must follow site identity checks, assign a badge, and complete check-in. Check-in records the event and makes the passcode unavailable for reuse.",
      "Gate inspection and check-in require the service to be available. If the system is offline, staff should follow the site's approved contingency process rather than assume the passcode was validated.",
    ],
    bullets: [
      'The system answers: "Does this code match an active visit assignment?"',
      "The operator remains responsible for deciding whether the person may enter under site procedures.",
    ],
  },
  {
    num: "4",
    title: "What Jusclick-TeQiQ Controls",
    summary: "Create and manage visitor, contractor, and supplier passcode assignments.",
    paragraphs: [
      "The system supports visitor, contractor, and supplier assignments. Users can record relevant details such as host, department, company, purpose, phone, ID number, or vehicle plate, subject to the fields used by the workflow.",
      "Access is role-scoped. Administrators and security personnel can review broader operational records; department heads and staff have narrower views. The organization should confirm the configured roles match its procedures.",
    ],
    bullets: [
      "Visitors — Scheduled guests, clients, and other approved visitors.",
      "Contractors — Maintenance and other third-party personnel.",
      "Suppliers — Delivery and dispatch visits.",
    ],
  },
  {
    num: "5",
    title: "An Important Security Boundary",
    summary: "Distinguishing credential verification from physical identity verification at the gate.",
    paragraphs: [
      "A valid passcode shows that the code matches an active visit assignment. It does not prove that its holder is the person named in that assignment.",
      "Gate staff should compare the visitor with appropriate identification and apply any host confirmation, escort, or restricted-area rules required by site policy. The application does not authenticate an ID document or automatically compare it with the visitor.",
      "Keep credential validation and physical identity checks as separate steps in the operating procedure.",
    ],
    bullets: [],
  },
  {
    num: "6",
    title: "Operational Effect",
    summary: "Pilot objectives: reduce avoidable calls and make gate records easier to review.",
    paragraphs: [
      "Pre-authorizing visits may reduce some calls and waiting at the gate. The effect depends on staff adoption, accurate visit details, network availability, and the site's operating procedures; measure it during the pilot.",
      "The application provides structured access records for authorized users. It does not require an organization to stop using paper procedures, and any transition should include an approved fallback and retention plan.",
    ],
    bullets: [
      "Measure gate wait time and the number of host calls.",
      "Confirm staff can issue, inspect, check in, and check out visits reliably.",
      "Review which visitor details are collected and who can access them.",
      "Retain an approved offline or service-outage process.",
    ],
  },
  {
    num: "7",
    title: "Data Protection Considerations",
    summary: "Role-scoped access helps limit exposure; the organization remains accountable for compliance.",
    paragraphs: [
      "The application scopes record access by role and department, reducing the need to expose a shared register at the gate. Authorized users may still see personal data, so access should be limited to operational need.",
      "The organization must define lawful purposes, privacy notices, retention periods, access reviews, export handling, and incident procedures for the data it processes.",
      "Jusclick-TeQiQ provides access-control features; it is not a legal-compliance certification and does not replace the organization's own policies or advice from qualified professionals.",
    ],
    bullets: [],
  },
  {
    num: "8",
    title: "Proposed Client Evaluation (Controlled Pilot)",
    summary: "Operator-led scenarios for evaluating the workflow at TF Commodities.",
    paragraphs: [
      "Run the pilot at a defined entrance with named evaluators, agreed success measures, an outage procedure, and a process for reporting issues.",
      "Use the scenarios below to record operator observations. Marking a scenario reviewed is a manual evaluator attestation; the application does not execute an automated test or independently confirm the expected result.",
    ],
    bullets: [
      "Issue, inspect, check in, and check out a pre-authorized visitor.",
      "Repeat the workflow for a contractor and a supplier/delivery.",
      "Confirm unknown, expired, revoked, and already-used codes are rejected.",
      "Test the 15-unknown-code lockout and confirm the displayed recovery period.",
      "Test identity mismatch rejection and confirm the passcode is invalidated.",
      "Test a host-unavailable case and the service-outage contingency.",
      "Review role permissions, exported files, audit records, and retention procedures.",
    ],
  },
  {
    num: "9",
    title: "Commercial Value & Conclusion",
    summary: "Decide based on measured pilot outcomes, operational fit, and data governance.",
    paragraphs: [
      "Evaluate the system against measured outcomes: gate processing time, successful staff adoption, correct rejection of invalid credentials, record completeness, and manageable data-protection controls.",
      "Jusclick-TeQiQ adds a pre-authorization and passcode-inspection step to the gate workflow. It should be adopted only if the pilot confirms that it fits the organization's risks, staffing, connectivity, and retention requirements.",
      "Prepared for evaluation at TF Commodities by Bright Anderson.",
    ],
    bullets: [
      "Does pre-authorization reduce gate calls and waiting?",
      "Can operators consistently inspect a code and perform required identity checks?",
      "Are role scopes, exports, and audit records adequate for operations?",
      "Are retention, backup, and outage procedures documented?",
    ],
  },
];

export const DATA_PROTECTION_POLICY_CLAUSES = [
  {
    code: "DP-01",
    title: "Purpose Limitation & Confidentiality",
    body: "Visitor, contractor, and supplier records may contain personal data, including contact details, ID references, vehicle plates, host assignments, and access times. Collect and use only the information needed for an approved operational purpose, and do not disclose it to unauthorized people.",
  },
  {
    code: "DP-02",
    title: "Role- and Department-Scoped Access",
    body: "Access depends on the assigned role: staff are limited to their own issued records within their department; department heads see records scoped to their department; security users operate the gate and can access authorized operational records and exports; administrators manage users, settings, and audit review. Administrators must assign roles and departments according to least privilege.",
  },
  {
    code: "DP-03",
    title: "Passcode Checks Do Not Authenticate Identity",
    body: "A valid passcode matches an active visit; it does not prove who is presenting it. Gate staff must follow site procedures for checking identity and authorization. Jusclick-TeQiQ records ID details entered by staff but does not authenticate ID documents or automatically compare them with the visitor.",
  },
  {
    code: "DP-04",
    title: "Disclosure, Exports & Retention",
    body: "Do not expose visitor history to visitors or other unauthorized parties. Operational exports are restricted by role; handle exported files as sensitive records, limit access, and delete or retain them according to the organization's approved retention schedule.",
  },
  {
    code: "DP-05",
    title: "Audit Records & Operator Accountability",
    body: "The application records selected actions with an operator, action, outcome, details, and timestamp. Audit views and local history have defined limits; entries should not be treated as immutable or as a substitute for an approved retention and backup process. Report missing or incorrect records through the site's support process.",
  },
];

export const PILOT_SCENARIOS = [
  {
    id: "S1",
    title: "1. Normal Pre-Authorized Visitor",
    expected: "An authorized user issues a passcode; the operator inspects it, follows site identity checks, assigns a badge, and completes check-in.",
  },
  {
    id: "S2",
    title: "2. Contractor Assignment & Entry",
    expected: "Issue a contractor passcode with the relevant company and visit details; inspect and check in, then confirm the record.",
  },
  {
    id: "S3",
    title: "3. Supplier or Delivery Clearance",
    expected: "Issue and process a supplier visit with relevant vehicle and purpose details; confirm the record is accurate.",
  },
  {
    id: "S4",
    title: "4. Invalid Credential & Brute-Force Protection",
    expected: "Unknown six-digit codes are denied; 15 unknown-code attempts within 10 minutes trigger the configured gate-inspection lockout.",
  },
  {
    id: "S5",
    title: "5. Expired or Cancelled / Revoked Visit",
    expected: "Expired, revoked, already-used, and checked-out codes are rejected with the corresponding status.",
  },
  {
    id: "S6",
    title: "6. Visitor Arriving Outside Expected Conditions (Identity Mismatch)",
    expected: "The operator compares the visitor with site-required identity details; on mismatch, reject the visit and record the reason.",
  },
  {
    id: "S7",
    title: "7. Host Unavailable Scenario",
    expected: "Process an already-authorized visit without live host confirmation, if site policy permits; record any escalation or exception.",
  },
  {
    id: "S8",
    title: "8. Entry (Check-In) and Departure (Check-Out) Audit Recording",
    expected: "Confirm check-in and check-out events appear in the available access and audit records; verify retention separately.",
  },
  {
    id: "S9",
    title: "9. Register Transition & Data Handling",
    expected: "Evaluate whether the site's approved paper process can be reduced; do not discontinue required records until retention, outage, and compliance procedures are approved.",
  },
];

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PolicyAgreementModal({
  open,
  onClose,
  onAccept,
  userEmail,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  userEmail?: string;
  userName?: string;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(7, 11, 18, 0.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Data Protection and Security Policies"
    >
      <div
        className="panel"
        style={{
          width: "min(760px, 96vw)",
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-solid)",
          border: "1px solid var(--line-strong)",
          boxShadow: "var(--shadow-pop)",
          padding: 20,
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={18} style={{ color: "var(--sig)" }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Data Protection &amp; Security Operations Policy ({CURRENT_POLICY_VERSION})
              </h2>
            </div>
            <p className="status-mute" style={{ fontSize: 12, marginTop: 4 }}>
              Internal access and visitor-data policy · Supports, but does not establish, compliance with Act 843
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose} style={{ minHeight: 28, padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            overflowY: "auto",
            paddingRight: 6,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderTop: "1px solid var(--line)",
            borderBottom: "1px solid var(--line)",
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          {DATA_PROTECTION_POLICY_CLAUSES.map(clause => (
            <div
              key={clause.code}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                background: "var(--surface-subtle)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className="mono status-ok" style={{ fontSize: 11, fontWeight: 700 }}>
                  [{clause.code}]
                </span>
                <strong style={{ fontSize: 13 }}>{clause.title}</strong>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--ink-secondary)", margin: 0, lineHeight: 1.5 }}>
                {clause.body}
              </p>
            </div>
          ))}

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              background: "var(--warn-bg)",
              border: "1px solid var(--warn-border)",
              fontSize: 12,
              color: "var(--ink)",
            }}
          >
            <strong>Record notice:</strong> Clicking <em>&ldquo;I Agree &amp; Accept Policy&rdquo;</em> creates an application acceptance record{" "}
            {userEmail ? ` for ${userEmail}` : ""}. Retention and availability depend on the deployment&apos;s storage, sync, and backup procedures.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span className="meta-inline">
            {userName || userEmail ? `Operator: ${userName || userEmail}` : "Required prior to authentication"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose}>
              <span>Close</span>
            </button>
            <button
              type="button"
              className="pri"
              onClick={() => {
                onAccept();
                onClose();
              }}
            >
              <Check size={14} />
              <span>I Agree &amp; Accept Policy (Logged)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Documentation({
  me,
  role,
}: {
  me: { _id: string; userId: string; name: string; email: string; role: string };
  role: string;
}) {
  const registry = useGateRegistry();
  const [subTab, setSubTab] = useState<"proposal" | "policies" | "pilot">("proposal");
  const [search, setSearch] = useState("");
  const [policyFeedback, setPolicyFeedback] = useState("");

  const isAccepted = hasUserAcceptedPolicy(me.email, me.userId);
  const myAcceptanceRecord =
    registry.policyAcceptances[me.email.toLowerCase()] ??
    registry.policyAcceptances[me.userId] ??
    registry.policyAcceptances.__latest_session__;

  const allAcceptances = useMemo(() => {
    const seen = new Set<string>();
    const list = [];
    for (const [k, rec] of Object.entries(registry.policyAcceptances)) {
      if (k === "__latest_session__") continue;
      if (seen.has(rec.email)) continue;
      seen.add(rec.email);
      list.push(rec);
    }
    return list.sort((a, b) => b.acceptedAt - a.acceptedAt);
  }, [registry.policyAcceptances]);

  const filteredProposalSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return JUSCLICK_PROPOSAL_SECTIONS;
    return JUSCLICK_PROPOSAL_SECTIONS.filter(
      s =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.paragraphs.some(p => p.toLowerCase().includes(q)) ||
        s.bullets.some(b => b.toLowerCase().includes(q))
    );
  }, [search]);

  const reviewedScenarioCount = PILOT_SCENARIOS.filter(
    s => registry.pilotScenarioChecks[s.id]?.verified
  ).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>System Guide &amp; Security Policies</h1>
          <div className="meta-inline" style={{ marginTop: 2 }}>
            Jusclick-TeQiQ architecture · Internal data-handling policy · TF Commodities pilot review
          </div>
        </div>

        <div className="page-header-actions no-print">
          <div className="segmented" role="group">
            <button
              type="button"
              aria-pressed={subTab === "proposal"}
              onClick={() => setSubTab("proposal")}
            >
              Architecture &amp; Overview
            </button>
            <button
              type="button"
              aria-pressed={subTab === "policies"}
              onClick={() => setSubTab("policies")}
            >
              Data &amp; Security Policy
            </button>
            <button
              type="button"
              aria-pressed={subTab === "pilot"}
              onClick={() => setSubTab("pilot")}
            >
              Pilot Review ({reviewedScenarioCount}/{PILOT_SCENARIOS.length})
            </button>
          </div>
          <button type="button" onClick={() => window.print()}>
            <Printer size={14} />
            <span>Print Dossier</span>
          </button>
        </div>
      </div>

      {subTab === "proposal" && (
        <>
          <section className="panel">
            <div className="panel-header" style={{ flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <BookOpen size={16} style={{ color: "var(--sig)" }} />
                  <h2 className="panel-title">
                    Jusclick-TeQiQ — Visitor and Temporary Access Management
                  </h2>
                </div>
                <p className="status-mute" style={{ fontSize: 12.5, marginTop: 4 }}>
                  Prepared by <strong>Bright Anderson</strong> · Pilot evaluation for <strong>TF Commodities</strong>
                </p>
              </div>
              <div className="search-box no-print" style={{ minWidth: 240 }}>
                <Search size={14} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search documentation sections…"
                />
              </div>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: "var(--surface-subtle)",
                border: "1px solid var(--line)",
                marginBottom: 16,
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            >
              <strong>Pilot context:</strong> Use this guide to assess whether pre-authorized visitor, contractor, and supplier access
              fits site operations. Measure gate wait times, host calls, staff adoption, data handling, and outage readiness; do not assume
              the system eliminates manual procedures or establishes compliance.
            </div>

            <div className="doc-sections">
              {filteredProposalSections.map(sec => (
                <article key={sec.num} className="doc-section">
                  <div className="doc-section-header">
                    <h3>
                      <span className="mono" style={{ color: "var(--sig)", marginRight: 8 }}>
                        0{sec.num}.
                      </span>
                      {sec.title}
                    </h3>
                    <span className="meta-inline">{sec.summary}</span>
                  </div>

                  <div className="doc-section-body">
                    {sec.paragraphs.map((p, idx) => (
                      <p key={idx} style={{ margin: 0, color: "var(--ink)" }}>
                        {p}
                      </p>
                    ))}

                    {sec.bullets.length > 0 && (
                      <ul style={{ margin: "4px 0 0", paddingLeft: 20, color: "var(--ink-secondary)" }}>
                        {sec.bullets.map((b, idx) => (
                          <li key={idx} style={{ marginBottom: 4 }}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <section className="doc-architecture">
              <div>
                <h3>System architecture</h3>
                <p>Application, authorization, storage, and gate workflow boundaries.</p>
              </div>
              <iframe
                className="doc-architecture-frame"
                src="/architecture-diagram.html"
                title="Jusclick-TeQiQ system architecture diagram"
                referrerPolicy="no-referrer"
              />
            </section>
          </section>
        </>
      )}

      {subTab === "policies" && (
        <>
          <section className="panel">
            <div className="panel-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Lock size={16} style={{ color: "var(--sig)" }} />
                <h2 className="panel-title">Internal Data Handling &amp; Security Policy</h2>
              </div>
              <span className={`mono ${isAccepted ? "status-ok" : "status-warn"}`} style={{ fontSize: 12 }}>
                {isAccepted
                  ? `Agreement recorded (${myAcceptanceRecord ? fmtTime(myAcceptanceRecord.acceptedAt) : CURRENT_POLICY_VERSION})`
                  : "Acceptance Required"}
              </span>
            </div>

            {policyFeedback && (
              <div className="gate-banner granted" role="status" style={{ marginTop: 0, marginBottom: 14 }}>
                <strong>Agreement record created</strong>
                <p style={{ fontSize: 12.5, marginTop: 2 }}>{policyFeedback}</p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {DATA_PROTECTION_POLICY_CLAUSES.map(clause => (
                <div
                  key={clause.code}
                  className="policy-clause"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className="mono status-ok" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      [{clause.code}]
                    </span>
                    <strong style={{ fontSize: 13.5 }}>{clause.title}</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
                    {clause.body}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                paddingTop: 12,
                borderTop: "1px solid var(--line)",
              }}
            >
              <div style={{ fontSize: 12.5 }}>
                <strong>Your Policy Status:</strong>{" "}
                {myAcceptanceRecord ? (
                  <span className="status-ok">
                    Agreed to {myAcceptanceRecord.policyVersion} on {fmtTime(myAcceptanceRecord.acceptedAt)}
                  </span>
                ) : (
                  <span className="status-warn">No acceptance record found for this account</span>
                )}
              </div>
              <button
                type="button"
                className="pri"
                onClick={() => {
                  const rec = recordPolicyAcceptance({
                    email: me.email,
                    name: me.name,
                    userId: me.userId,
                    context: "workspace_gate",
                  });
                  setPolicyFeedback(
                    `Recorded policy acceptance (${rec.policyVersion}) for ${me.name} (${me.email}) at ${fmtTime(rec.acceptedAt)}.`
                  );
                }}
              >
                <CheckCircle2 size={14} />
                <span>{isAccepted ? "Reaffirm Policy Agreement" : "Record Policy Agreement"}</span>
              </button>
            </div>
          </section>

          {(role === "admin" || role === "security") && (
            <section className="panel">
              <div className="panel-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={16} style={{ color: "var(--sig)" }} />
                  <h2 className="panel-title">Available Policy Acceptance Records ({allAcceptances.length})</h2>
                </div>
                <span className="meta-inline">Records available in this registry; retention depends on deployment storage and backup.</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User / Operator</th>
                      <th>Email</th>
                      <th>Policy Version</th>
                      <th>Acceptance Stage</th>
                      <th>Logged Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAcceptances.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="status-mute" style={{ textAlign: "center", padding: 18 }}>
                          No policy acceptances logged yet.
                        </td>
                      </tr>
                    ) : (
                      allAcceptances.map(rec => (
                        <tr key={`${rec.email}_${rec.acceptedAt}`}>
                          <td style={{ fontWeight: 600 }}>{rec.name}</td>
                          <td className="mono">{rec.email}</td>
                          <td className="mono status-ok">{rec.policyVersion}</td>
                          <td className="mono" style={{ fontSize: 12 }}>{rec.context}</td>
                          <td className="mono" style={{ fontSize: 12 }}>{fmtTime(rec.acceptedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {subTab === "pilot" && (
        <section className="panel">
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={16} style={{ color: "var(--sig)" }} />
              <h2 className="panel-title">TF Commodities Pilot Review</h2>
            </div>
            <span className="mono status-ok" style={{ fontSize: 12 }}>
              {reviewedScenarioCount} / {PILOT_SCENARIOS.length} Scenarios Reviewed
            </span>
          </div>

          <p className="status-mute" style={{ fontSize: 13, marginBottom: 14 }}>
            Record evaluator observations during the TF Commodities pilot. Marking a scenario reviewed stores the evaluator and
            timestamp in the browser registry and creates a local <code className="mono">pilot.evaluate</code> entry; it does not
            execute a test or guarantee a server-side audit record.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Expected Operational &amp; Security Behavior</th>
                  <th>Status</th>
                  <th className="no-print" style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {PILOT_SCENARIOS.map(sc => {
                  const check = registry.pilotScenarioChecks[sc.id];
                  const verified = Boolean(check?.verified);
                  return (
                    <tr key={sc.id}>
                      <td style={{ fontWeight: 600 }}>{sc.title}</td>
                      <td style={{ color: "var(--ink-secondary)", fontSize: 12.5 }}>{sc.expected}</td>
                      <td>
                        {verified ? (
                          <div>
                            <span className="status-ok" style={{ fontWeight: 600 }}>Reviewed</span>
                            <div className="meta-inline mono">
                              by {check?.verifiedBy} · {check ? fmtTime(check.verifiedAt) : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="status-mute">Not reviewed</span>
                        )}
                      </td>
                      <td className="no-print" style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={verified ? "" : "pri"}
                          style={{ minHeight: 28, padding: "3px 10px", fontSize: 12 }}
                          onClick={() => togglePilotScenarioCheck(sc.id, me.name)}
                        >
                          <Check size={12} />
                          <span>{verified ? "Reset Review" : "Record Review"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
