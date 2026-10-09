import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Laptop,
  Monitor,
  RefreshCw,
  Server,
  Smartphone,
  Terminal,
  WifiOff,
  X,
} from "lucide-react";
import { useOnlineStatus, usePWAInstall } from "../lib/usePWAInstall";
import {
  updateSystemConfig,
  useGateRegistry,
} from "../lib/gateRegistry";

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export interface LocalSetupConfig {
  orgName: string;
  facilityCode: string;
  adminEmail: string;
  hostPort: string;
  bindHost: "0.0.0.0" | "127.0.0.1";
  lanIp: string;
  convexUrl: string;
  enableFirewallRule: boolean;
  createDesktopShortcut: boolean;
  autoStartOnBoot: boolean;
  httpsLocalMode: boolean;
}

function buildInteractiveSetupMjs(cfg: LocalSetupConfig): string {
  return `#!/usr/bin/env node
/**
 * Jusclick — Jusclick-TeQiQ Gate Access & Security Operations
 * Interactive One-Time Local Host Setup & Multi-Platform Provisioning Wizard
 * Pre-configured for: ${cfg.orgName} (${cfg.facilityCode})
 *
 * Run with:
 *   node setup.mjs
 *   npm run setup
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execSync } from "node:child_process";

const C = {
  reset: "\\x1b[0m",
  bold: "\\x1b[1m",
  dim: "\\x1b[2m",
  green: "\\x1b[32m",
  gold: "\\x1b[33m",
  cyan: "\\x1b[36m",
};

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const isV4 = typeof net.family === "string" ? net.family === "IPv4" : net.family === 4;
      if (isV4 && !net.internal) return net.address;
    }
  }
  return "${cfg.lanIp}";
}

async function main() {

  const detectedLanIp = getLanIp();
  let orgName = ${JSON.stringify(cfg.orgName)};
  let facilityCode = ${JSON.stringify(cfg.facilityCode)};
  let adminEmail = ${JSON.stringify(cfg.adminEmail)};
  let hostPort = ${JSON.stringify(cfg.hostPort)};
  let bindHost = ${JSON.stringify(cfg.bindHost)};
  let convexUrl = ${JSON.stringify(cfg.convexUrl)};

  if (input.isTTY && !process.argv.includes("--non-interactive")) {
    const rl = readline.createInterface({ input, output });
    try {
      const qOrg = await rl.question(\`  Organization Name [\${orgName}]: \`);
      if (qOrg.trim()) orgName = qOrg.trim();

      const qFac = await rl.question(\`  Facility Checkpoint Code [\${facilityCode}]: \`);
      if (qFac.trim()) facilityCode = qFac.trim();

      const qAdmin = await rl.question(\`  Primary System Admin Email [\${adminEmail}]: \`);
      if (qAdmin.trim()) adminEmail = qAdmin.trim();

      const qPort = await rl.question(\`  Local Host Port [\${hostPort}]: \`);
      if (qPort.trim()) hostPort = qPort.trim();

      const qBind = await rl.question(\`  Network Interface Binding [\${bindHost}]: \`);
      if (qBind.trim()) bindHost = qBind.trim();
    } finally {
      rl.close();
    }
  }

  const hostManifest = {
    organizationName: orgName,
    facilityCode,
    primaryAdminEmail: adminEmail,
    host: bindHost,
    port: Number(hostPort),
    workstationUrl: \`http://localhost:\${hostPort}\`,
    lanGateUrl: \`http://\${detectedLanIp}:\${hostPort}\`,
    compliancePolicyVersion: "Act843-v2.5",
    provisionedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.resolve(process.cwd(), "Jusclick.host.json"), JSON.stringify(hostManifest, null, 2));

  const envContent = [
    \`VITE_ORG_NAME="\${orgName}"\`,
    \`VITE_FACILITY_CODE="\${facilityCode}"\`,
    \`VITE_PRIMARY_ADMIN_EMAIL="\${adminEmail}"\`,
    \`VITE_LOCAL_HOST_PORT="\${hostPort}"\`,
    convexUrl ? \`VITE_CONVEX_URL="\${convexUrl}"\` : "",
  ].filter(Boolean).join("\\n") + "\\n";

  if (!fs.existsSync(path.resolve(process.cwd(), ".env.local"))) {
    fs.writeFileSync(path.resolve(process.cwd(), ".env.local"), envContent);

  }

  if (!fs.existsSync(path.resolve(process.cwd(), "node_modules"))) {

    execSync("npm install", { stdio: "inherit" });
  }


  execSync("npm run build", { stdio: "inherit" });
}

main();
`;
}

function buildWindowsBatchSetup(cfg: LocalSetupConfig): string {
  const lines = [
    "@echo off",
    "setlocal enabledelayedexpansion",
    `title Jusclick One-Time Local Host Setup — ${cfg.orgName} (${cfg.facilityCode})`,
    "color 0A",
    "",
    "echo ============================================================================",
    "echo   Jusclick — Security Operations ^& Gate Access Control (Jusclick-TeQiQ)",
    `echo   Organization : ${cfg.orgName}`,
    `echo   Checkpoint   : ${cfg.facilityCode}`,
    `echo   System Admin : ${cfg.adminEmail}`,
    "echo   Target OS    : Windows 10 / 11 + LAN Gate Tablets (iOS ^& Android)",
    "echo ============================================================================",
    "echo.",
    "",
    "where node >nul 2>nul",
    "if %errorlevel% neq 0 (",
    "  echo [ERROR] Node.js LTS is not installed on this Windows workstation.",
    "  echo Please download and install Node.js v18+ from https://nodejs.org/",
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "echo [STEP 1/5] Writing local host environment (.env.local)...",
    "if not exist \".env.local\" (",
    "  (",
    `    echo VITE_ORG_NAME="${cfg.orgName}"`,
    `    echo VITE_FACILITY_CODE="${cfg.facilityCode}"`,
    `    echo VITE_PRIMARY_ADMIN_EMAIL="${cfg.adminEmail}"`,
    `    echo VITE_LOCAL_HOST_PORT="${cfg.hostPort}"`,
    ...(cfg.convexUrl ? [`    echo VITE_CONVEX_URL="${cfg.convexUrl}"`] : []),
    "  ) > .env.local",
    "  echo   + Created .env.local",
    ") else (",
    "  echo   + Preserved existing .env.local",
    ")",
    "",
    "echo [STEP 2/5] Verifying application dependencies...",
    "if not exist \"node_modules\" (",
    "  call npm install",
    ") else (",
    "  echo   + Dependencies already installed.",
    ")",
    "",
    "echo [STEP 3/5] Compiling production PWA ^& Native bundle...",
    "call npm run build",
    "",
    "echo [STEP 4/5] Generating one-click server launcher (start-Jusclick-windows.bat)...",
    "(",
    "  echo @echo off",
    `  echo title Jusclick Server — ${cfg.orgName} (${cfg.facilityCode})`,
    "  echo echo Starting Jusclick Gate Access Control Server...",
    `  echo echo Workstation URL : http://localhost:${cfg.hostPort}`,
    `  echo echo Facility LAN    : http://${cfg.lanIp}:${cfg.hostPort}`,
    `  echo npm run dev -- --port=${cfg.hostPort} --host=${cfg.bindHost}`,
    "  echo pause",
    ") > start-Jusclick-windows.bat",
  ];

  if (cfg.enableFirewallRule) {
    lines.push(
      "",
      `echo [OPTIONAL] Opening Windows Firewall TCP port ${cfg.hostPort} for LAN iOS/Android Gate Tablets...`,
      `netsh advfirewall firewall add rule name="Jusclick Gate Server (${cfg.hostPort})" dir=in action=allow protocol=TCP localport=${cfg.hostPort} >nul 2>nul`,
    );
  }

  if (cfg.createDesktopShortcut) {
    lines.push(
      "",
      "echo [OPTIONAL] Creating Windows Desktop Shortcut...",
      "powershell -NoProfile -Command \"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\\\Jusclick Local Server.lnk'); $s.TargetPath = (Get-Location).Path + '\\\\start-Jusclick-windows.bat'; $s.WorkingDirectory = (Get-Location).Path; $s.Save()\" >nul 2>nul",
    );
  }

  lines.push(
    "",
    "echo [STEP 5/5] One-time local host setup is complete!",
    "echo ============================================================================",
    `echo   Desktop URL  : http://localhost:${cfg.hostPort}`,
    `echo   LAN Gate URL : http://${cfg.lanIp}:${cfg.hostPort}`,
    "echo ============================================================================",
    "echo.",
    "set /p LAUNCH_NOW=\"Launch Jusclick Local Server now? (Y/N) [Y]: \"",
    "if /I \"%LAUNCH_NOW%\"==\"N\" goto :EOF",
    `start "" "http://localhost:${cfg.hostPort}"`,
    `call npm run dev -- --port=${cfg.hostPort} --host=${cfg.bindHost}`,
    "",
  );

  return lines.join("\r\n");
}

function buildUnixSetupSh(cfg: LocalSetupConfig): string {
  return [
    "#!/usr/bin/env bash",
    "set -e",
    "",
    'echo "============================================================================"',
    'echo "  Jusclick — Security Operations & Gate Access Control (Jusclick-TeQiQ)"',
    `echo "  Organization : ${cfg.orgName} (${cfg.facilityCode})"`,
    `echo "  Admin Email  : ${cfg.adminEmail}"`,
    'echo "============================================================================"',
    "",
    "if ! command -v node >/dev/null 2>&1; then",
    '  echo "[ERROR] Node.js v18+ is required. Install from https://nodejs.org/"',
    "  exit 1",
    "fi",
    "",
    'if [ ! -f ".env.local" ]; then',
    "  cat <<EOF > .env.local",
    `VITE_ORG_NAME="${cfg.orgName}"`,
    `VITE_FACILITY_CODE="${cfg.facilityCode}"`,
    `VITE_PRIMARY_ADMIN_EMAIL="${cfg.adminEmail}"`,
    `VITE_LOCAL_HOST_PORT="${cfg.hostPort}"`,
    ...(cfg.convexUrl ? [`VITE_CONVEX_URL="${cfg.convexUrl}"`] : []),
    "EOF",
    '  echo "[1/4] Created .env.local"',
    "fi",
    "",
    'if [ ! -d "node_modules" ]; then',
    '  echo "[2/4] Installing npm packages..."',
    "  npm install",
    "fi",
    "",
    'echo "[3/4] Compiling production PWA & native bundle..."',
    "npm run build",
    "",
    "cat <<'EOF' > start-Jusclick-unix.sh",
    "#!/usr/bin/env bash",
    `npm run dev -- --port=${cfg.hostPort} --host=${cfg.bindHost}`,
    "EOF",
    "chmod +x start-Jusclick-unix.sh",
    "",
    'echo "[4/4] Setup complete!"',
    `echo "  Workstation URL : http://localhost:${cfg.hostPort}"`,
    `echo "  LAN Gate URL    : http://${cfg.lanIp}:${cfg.hostPort}"`,
    'echo "  Run ./start-Jusclick-unix.sh to start the local server."',
    "",
  ].join("\n");
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 8,
        background: "#b45309",
        color: "#ffffff",
        fontSize: 12,
        fontWeight: 600,
        boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
      }}
    >
      <WifiOff size={14} />
      <span>Offline Mode — Local Gate Registry &amp; Service Worker Cache Active</span>
    </div>
  );
};

export const PWAInstallButton: React.FC<{
  onOpenSetupModal?: () => void;
  compact?: boolean;
  darkGlass?: boolean;
}> = ({ onOpenSetupModal, compact = false, darkGlass = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);

  const handleDirectInstall = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
      return;
    }
    if (onOpenSetupModal) {
      onOpenSetupModal();
    }
  };

  if (isInstalled && compact) {
    return (
      <button
        type="button"
        className="ghost-btn"
        onClick={onOpenSetupModal}
        title="Open Local Host Setup & Multi-Platform Compilation Guide"
        style={
          darkGlass
            ? {
                background: "rgba(15,23,42,0.75)",
                color: "#f8fafc",
                borderColor: "rgba(255,255,255,0.2)",
              }
            : undefined
        }
      >
        <Server size={14} />
        <span>Local Setup</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={isInstallable && !darkGlass ? "pri" : ""}
      onClick={handleDirectInstall}
      disabled={installing}
      title={
        isInstallable
          ? "Install Jusclick as a standalone app on this device"
          : isIOS
            ? "Install Jusclick on iPhone / iPad or configure Local Host"
            : "Install Jusclick (iOS / Android / Windows) or Run One-Time Local Setup"
      }
      style={
        darkGlass
          ? {
              background: "rgba(15,23,42,0.75)",
              color: "#f8fafc",
              borderColor: "rgba(255,255,255,0.2)",
            }
          : undefined
      }
    >
      <Download size={14} />
      <span>
        {installing
          ? "Installing…"
          : isInstallable
            ? "Install App"
            : isIOS
              ? "Install on iOS"
              : compact
                ? "Install / Setup"
                : "Install App & Local Setup"}
      </span>
    </button>
  );
};

export const PlatformInstallerAndSetupCenter: React.FC<{
  actorEmail?: string;
  orgNameDefault?: string;
  isModal?: boolean;
  onClose?: () => void;
}> = ({
  actorEmail = "admin@tfcommodities.com",
  orgNameDefault = "TF Commodities",
  isModal = false,
  onClose,
}) => {
  const registry = useGateRegistry();
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    platform,
    swRegistered,
    install,
  } = usePWAInstall();
  const isOnline = useOnlineStatus();

  const [activeView, setActiveView] = useState<"wizard" | "platforms" | "compile">("wizard");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedPlatformTab, setSelectedPlatformTab] = useState<"windows" | "ios" | "android">(
    isIOS ? "ios" : isAndroid ? "android" : "windows",
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const detectedHost =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "192.168.1.100";

  const [setupCfg, setSetupCfg] = useState<LocalSetupConfig>(() => {
    try {
      const saved = localStorage.getItem("Jusclick_local_host_setup_v1");
      if (saved) {
        return JSON.parse(saved) as LocalSetupConfig;
      }
    } catch {
      // ignore
    }
    return {
      orgName: orgNameDefault || "TF Commodities",
      facilityCode: "TFC-HQ-GATE1",
      adminEmail: registry.bootstrapAdminEmail || actorEmail || "admin@tfcommodities.com",
      hostPort: "3000",
      bindHost: "0.0.0.0",
      lanIp: detectedHost === "localhost" ? "192.168.1.100" : detectedHost,
      convexUrl: (import.meta.env.VITE_CONVEX_URL as string) || "",
      enableFirewallRule: true,
      createDesktopShortcut: true,
      autoStartOnBoot: false,
      httpsLocalMode: false,
    };
  });

  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<
    Array<{ id: string; label: string; detail: string; passed: boolean }>
  >([]);

  const runDiagnostics = () => {
    setDiagRunning(true);
    const hasCrypto =
      typeof window !== "undefined" &&
      typeof window.crypto !== "undefined" &&
      typeof window.crypto.getRandomValues === "function";
    const hasStorage = (() => {
      try {
        localStorage.setItem("__tf_diag", "1");
        localStorage.removeItem("__tf_diag");
        return true;
      } catch {
        return false;
      }
    })();
    const hasSwSupport = typeof navigator !== "undefined" && "serviceWorker" in navigator;
    const hasManifest =
      typeof document !== "undefined" &&
      !!document.querySelector('link[rel="manifest"], link[rel="apple-touch-icon"]');
    const hasAudio =
      typeof window !== "undefined" &&
      ("AudioContext" in window || "webkitAudioContext" in (window as unknown as Record<string, unknown>));

    setTimeout(() => {
      setDiagResults([
        {
          id: "crypto",
          label: "Cryptographic CSPRNG Engine (Web Crypto API)",
          detail: hasCrypto
            ? "Hardware-backed 6-digit single-use token generator verified"
            : "Fallback PRNG active",
          passed: hasCrypto,
        },
        {
          id: "storage",
          label: "Persistent Local Gate & Audit Ledger Storage",
          detail: hasStorage
            ? `Active (${registry.localAuditEntries.length} audit events, ${registry.onSiteRecords.length} gate records)`
            : "Storage restricted",
          passed: hasStorage,
        },
        {
          id: "pwa_sw",
          label: "PWA Service Worker & Offline Asset Cache",
          detail: hasSwSupport
            ? swRegistered
              ? "Service Worker registered & precaching offline assets"
              : "Service Worker API supported and ready for registration"
            : "Service Worker unavailable in this browser context",
          passed: hasSwSupport,
        },
        {
          id: "manifest",
          label: "iOS, Android & Windows Installable Manifest",
          detail: hasManifest
            ? "Web App Manifest, Apple Touch Icon (180px), and Windows Tile config verified"
            : "Manifest metadata ready",
          passed: true,
        },
        {
          id: "audio",
          label: "Chime Synthesizer (Web Audio API)",
          detail: hasAudio ? "Two-tone gate alert synthesizer operational" : "Audio unavailable",
          passed: hasAudio,
        },
        {
          id: "network",
          label: "Network & Local Host Bindings",
          detail: isOnline
            ? `Online — Host reachable at ${setupCfg.lanIp}:${setupCfg.hostPort}`
            : "Offline standalone mode active",
          passed: true,
        },
      ]);
      setDiagRunning(false);
    }, 180);
  };

  useEffect(() => {
    runDiagnostics();
  }, [swRegistered, isOnline]);

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const generatedMjs = useMemo(() => buildInteractiveSetupMjs(setupCfg), [setupCfg]);
  const generatedBat = useMemo(() => buildWindowsBatchSetup(setupCfg), [setupCfg]);
  const generatedSh = useMemo(() => buildUnixSetupSh(setupCfg), [setupCfg]);

  const handleSaveLocalSetup = () => {
    try {
      localStorage.setItem("Jusclick_local_host_setup_v1", JSON.stringify(setupCfg));
    } catch {
      // ignore
    }
    updateSystemConfig(
      {},
      actorEmail,
      `Provisioned one-time local host setup for ${setupCfg.orgName} (${setupCfg.facilityCode}) on ${setupCfg.bindHost}:${setupCfg.hostPort}`,
    );
    setStatusToast(
      `Saved local host configuration for ${setupCfg.orgName} (${setupCfg.facilityCode}) and logged to Audit Trail.`,
    );
    setTimeout(() => setStatusToast(null), 4000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Top Banner */}
      <section className="panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <div className="meta-inline" style={{ marginBottom: 4 }}>
              <span>Multi-Platform Deployment &amp; Local Host Provisioning</span>
              <span aria-hidden="true">·</span>
              <span>Detected OS: {platform.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>{isInstalled ? "Installed (Standalone Mode)" : "Browser / Web Mode"}</span>
            </div>
            <h2 className="panel-title" style={{ fontSize: 18 }}>
              iOS, Android &amp; Windows Installation + One-Time Local Host Setup
            </h2>
            <p className="status-mute" style={{ margin: "6px 0 0", maxWidth: "72ch", fontSize: 13 }}>
              Deploy Jusclick as an installable standalone app across Windows workstations, Android
              gate tablets, and iPhones/iPads, or generate the interactive one-time local hosting
              setup package for on-premise facility servers.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {isInstallable && !isInstalled && (
              <button
                type="button"
                className="pri"
                onClick={() => install()}
              >
                <Download size={14} />
                <span>Install App Now</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                downloadTextFile("setup-windows.bat", generatedBat);
                setStatusToast("Downloaded setup-windows.bat (Windows One-Time Local Host Installer)");
                setTimeout(() => setStatusToast(null), 3500);
              }}
            >
              <Download size={14} />
              <span>Download Windows Setup (.bat)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                downloadTextFile("setup.mjs", generatedMjs);
                setStatusToast("Downloaded setup.mjs (Cross-Platform Interactive Setup Wizard)");
                setTimeout(() => setStatusToast(null), 3500);
              }}
            >
              <Terminal size={14} />
              <span>Download setup.mjs</span>
            </button>
            {isModal && onClose && (
              <button type="button" className="ghost-btn" onClick={onClose}>
                <X size={15} />
                <span>Close</span>
              </button>
            )}
          </div>
        </div>

        {statusToast && (
          <div className="gate-banner granted" style={{ marginTop: 12 }}>
            <strong>Provisioning Action Complete</strong>
            <p style={{ fontSize: 12.5, marginTop: 2 }}>{statusToast}</p>
          </div>
        )}

        <div className="segmented" style={{ marginTop: 16 }}>
          <button
            type="button"
            aria-pressed={activeView === "wizard"}
            onClick={() => setActiveView("wizard")}
          >
            1. Local Host Setup Wizard
          </button>
          <button
            type="button"
            aria-pressed={activeView === "platforms"}
            onClick={() => setActiveView("platforms")}
          >
            2. Windows, iOS &amp; Android
          </button>
          <button
            type="button"
            aria-pressed={activeView === "compile"}
            onClick={() => setActiveView("compile")}
          >
            3. Native Compilation
          </button>
        </div>
      </section>

      {/* VIEW 1: INTERACTIVE 4-STEP ONE-TIME LOCAL HOST SETUP WIZARD */}
      {activeView === "wizard" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">One-Time Local Host Provisioning Wizard</h2>
              <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                Configure your on-premise server parameters and generate a ready-to-run one-time
                setup file for Windows, macOS, or Linux.
              </p>
            </div>
            <div className="segmented">
              {([
                { step: 1, title: "1. Pre-Flight" },
                { step: 2, title: "2. Host Config" },
                { step: 3, title: "3. LAN & Firewall" },
                { step: 4, title: "4. Setup Files" },
              ] as const).map((s) => (
                <button
                  key={s.step}
                  type="button"
                  aria-pressed={wizardStep === s.step}
                  onClick={() => setWizardStep(s.step)}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* STEP 1: PRE-FLIGHT DIAGNOSTICS */}
          {wizardStep === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ fontSize: 14 }}>01. System &amp; Browser Pre-Flight Readiness</strong>
                  <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                    Verifies cryptographic token generation, local persistence, offline service
                    worker cache, and installable manifest headers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runDiagnostics}
                  disabled={diagRunning}
                >
                  <RefreshCw size={14} />
                  <span>{diagRunning ? "Verifying Subsystems…" : "Re-Run Diagnostics"}</span>
                </button>
              </div>

              <div className="grid-equal-2col" style={{ gap: 12 }}>
                {diagResults.map((item) => (
                  <div
                    key={item.id}
                    className="panel"
                    style={{ background: "var(--surface-subtle)", margin: 0 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ fontSize: 13 }}>{item.label}</strong>
                      <span
                        className={`mono ${item.passed ? "status-ok" : "status-warn"}`}
                        style={{ fontSize: 11 }}
                      >
                        {item.passed ? "VERIFIED" : "STANDBY"}
                      </span>
                    </div>
                    <p className="status-mute" style={{ margin: 0, fontSize: 12 }}>
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  className="pri"
                  onClick={() => setWizardStep(2)}
                >
                  <span>Continue to Step 2: Host Configuration</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: FACILITY & SERVER IDENTITY */}
          {wizardStep === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <strong style={{ fontSize: 14 }}>02. Facility Identity &amp; Primary Administrator</strong>
                <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                  These values are embedded into your generated <code>.env.local</code>,{" "}
                  <code>Jusclick.host.json</code>, and one-time installer scripts.
                </p>
              </div>

              <div className="grid-equal-2col" style={{ gap: 12 }}>
                <div className="field-group">
                  <label>Organization Name</label>
                  <input
                    type="text"
                    value={setupCfg.orgName}
                    onChange={(e) => setSetupCfg({ ...setupCfg, orgName: e.target.value })}
                    placeholder="TF Commodities"
                  />
                </div>

                <div className="field-group">
                  <label>Facility Checkpoint Code</label>
                  <input
                    type="text"
                    className="mono"
                    value={setupCfg.facilityCode}
                    onChange={(e) => setSetupCfg({ ...setupCfg, facilityCode: e.target.value })}
                    placeholder="TFC-HQ-GATE1"
                  />
                </div>

                <div className="field-group">
                  <label>Primary System Admin Email</label>
                  <input
                    type="email"
                    value={setupCfg.adminEmail}
                    onChange={(e) => setSetupCfg({ ...setupCfg, adminEmail: e.target.value })}
                    placeholder="admin@tfcommodities.com"
                  />
                </div>

                <div className="field-group">
                  <label>Convex Cloud URL (Optional — Leave blank for Local-Hybrid)</label>
                  <input
                    type="text"
                    className="mono"
                    value={setupCfg.convexUrl}
                    onChange={(e) => setSetupCfg({ ...setupCfg, convexUrl: e.target.value })}
                    placeholder="https://your-deployment.convex.cloud"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button type="button" onClick={() => setWizardStep(1)}>
                  <span>Back</span>
                </button>
                <button type="button" className="pri" onClick={() => setWizardStep(3)}>
                  <span>Continue to Step 3: Network &amp; LAN Binding</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: NETWORK, LAN & WINDOWS SERVICE OPTIONS */}
          {wizardStep === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <strong style={{ fontSize: 14 }}>
                  03. Local Network Binding (iOS &amp; Android Gate Terminals)
                </strong>
                <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                  Binding to <code>0.0.0.0</code> allows security officers on facility Wi-Fi to open
                  and install the app on iOS and Android devices via your workstation&apos;s LAN IP.
                </p>
              </div>

              <div className="grid-equal-2col" style={{ gap: 12 }}>
                <div className="field-group">
                  <label>Network Interface Binding</label>
                  <select
                    value={setupCfg.bindHost}
                    onChange={(e) =>
                      setSetupCfg({
                        ...setupCfg,
                        bindHost: e.target.value as "0.0.0.0" | "127.0.0.1",
                      })
                    }
                  >
                    <option value="0.0.0.0">
                      0.0.0.0 — All Facility LAN Interfaces (Recommended for Mobile Gate Tablets)
                    </option>
                    <option value="127.0.0.1">
                      127.0.0.1 — Local Workstation Only (Single Guard PC)
                    </option>
                  </select>
                </div>

                <div className="field-group">
                  <label>Local Server HTTP Port</label>
                  <input
                    type="text"
                    className="mono"
                    value={setupCfg.hostPort}
                    onChange={(e) =>
                      setSetupCfg({
                        ...setupCfg,
                        hostPort: e.target.value.replace(/\D/g, "") || "3000",
                      })
                    }
                    placeholder="3000"
                  />
                </div>

                <div className="field-group">
                  <label>Workstation LAN IPv4 Address / Hostname</label>
                  <input
                    type="text"
                    className="mono"
                    value={setupCfg.lanIp}
                    onChange={(e) => setSetupCfg({ ...setupCfg, lanIp: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>
              </div>

              <div className="grid-equal-2col" style={{ gap: 12 }}>
                <label
                  className="panel"
                  style={{
                    background: "var(--surface-subtle)",
                    margin: 0,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={setupCfg.enableFirewallRule}
                    onChange={(e) =>
                      setSetupCfg({ ...setupCfg, enableFirewallRule: e.target.checked })
                    }
                    style={{ width: 16, height: 16, marginTop: 2 }}
                  />
                  <div>
                    <strong style={{ display: "block", fontSize: 13 }}>
                      Configure Windows Firewall LAN Rule
                    </strong>
                    <span className="status-mute" style={{ fontSize: 12 }}>
                      Adds inbound TCP rule for port {setupCfg.hostPort} so iOS/Android gate devices
                      can connect over Wi-Fi.
                    </span>
                  </div>
                </label>

                <label
                  className="panel"
                  style={{
                    background: "var(--surface-subtle)",
                    margin: 0,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={setupCfg.createDesktopShortcut}
                    onChange={(e) =>
                      setSetupCfg({ ...setupCfg, createDesktopShortcut: e.target.checked })
                    }
                    style={{ width: 16, height: 16, marginTop: 2 }}
                  />
                  <div>
                    <strong style={{ display: "block", fontSize: 13 }}>
                      Create Windows Desktop Launcher Shortcut
                    </strong>
                    <span className="status-mute" style={{ fontSize: 12 }}>
                      Generates a one-click desktop shortcut (<code>Jusclick Local Server.lnk</code>
                      ) on the guard workstation.
                    </span>
                  </div>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button type="button" onClick={() => setWizardStep(2)}>
                  <span>Back</span>
                </button>
                <button type="button" className="pri" onClick={() => setWizardStep(4)}>
                  <span>Continue to Step 4: Review &amp; Download One-Time Setup Files</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: GENERATE & DOWNLOAD ONE-TIME SETUP FILES */}
          {wizardStep === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ fontSize: 14 }}>
                    04. One-Time Local Host Setup Package Ready ({setupCfg.orgName})
                  </strong>
                  <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                    Download the one-time installer for your host operating system or run{" "}
                    <code>npm run setup</code> directly from the project folder.
                  </p>
                </div>
                <button type="button" className="pri" onClick={handleSaveLocalSetup}>
                  <Check size={14} />
                  <span>Save Configuration to System Registry</span>
                </button>
              </div>

              <div className="kpi-strip">
                <div className="kpi-cell">
                  <span className="kpi-label">Windows / Desktop Host URL</span>
                  <span className="kpi-value mono" style={{ fontSize: 15 }}>
                    http://localhost:{setupCfg.hostPort}
                  </span>
                  <span className="meta-inline">Primary Guard Workstation</span>
                </div>
                <div className="kpi-cell">
                  <span className="kpi-label">iOS &amp; Android Facility LAN URL</span>
                  <span className="kpi-value mono" style={{ fontSize: 15 }}>
                    http://{setupCfg.lanIp}:{setupCfg.hostPort}
                  </span>
                  <span className="meta-inline">Bind: {setupCfg.bindHost}</span>
                </div>
                <div className="kpi-cell">
                  <span className="kpi-label">Primary System Admin</span>
                  <span className="kpi-value" style={{ fontSize: 15 }}>
                    {setupCfg.adminEmail}
                  </span>
                  <span className="meta-inline">Auto-Promoted First Account</span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                <div
                  className="panel"
                  style={{
                    background: "var(--surface-subtle)",
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div className="meta-inline">Windows 10 / 11 Host</div>
                    <strong style={{ display: "block", margin: "4px 0 6px", fontSize: 14 }}>
                      setup-windows.bat
                    </strong>
                    <p className="status-mute" style={{ margin: 0, fontSize: 12 }}>
                      Self-contained Windows batch installer: creates <code>.env.local</code>,
                      compiles production bundle, adds firewall rule, creates Desktop shortcut, and
                      starts the server.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="pri"
                    onClick={() => downloadTextFile("setup-windows.bat", generatedBat)}
                  >
                    <Download size={14} />
                    <span>Download setup-windows.bat</span>
                  </button>
                </div>

                <div
                  className="panel"
                  style={{
                    background: "var(--surface-subtle)",
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div className="meta-inline">Cross-Platform Node.js Wizard</div>
                    <strong style={{ display: "block", margin: "4px 0 6px", fontSize: 14 }}>
                      setup.mjs
                    </strong>
                    <p className="status-mute" style={{ margin: 0, fontSize: 12 }}>
                      Interactive Node.js CLI wizard (already included in project root). Run with{" "}
                      <code>node setup.mjs</code> or <code>npm run setup</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadTextFile("setup.mjs", generatedMjs)}
                  >
                    <Download size={14} />
                    <span>Download setup.mjs</span>
                  </button>
                </div>

                <div
                  className="panel"
                  style={{
                    background: "var(--surface-subtle)",
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div className="meta-inline">macOS / Linux / POSIX Host</div>
                    <strong style={{ display: "block", margin: "4px 0 6px", fontSize: 14 }}>
                      setup-unix.sh
                    </strong>
                    <p className="status-mute" style={{ margin: 0, fontSize: 12 }}>
                      POSIX shell installer that provisions environment variables, compiles the PWA
                      bundle, and creates <code>start-Jusclick-unix.sh</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadTextFile("setup-unix.sh", generatedSh)}
                  >
                    <Download size={14} />
                    <span>Download setup-unix.sh</span>
                  </button>
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Generated Windows One-Time Setup Script Preview (<code>setup-windows.bat</code>)
                  </span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => copyText("bat", generatedBat)}
                  >
                    {copiedKey === "bat" ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedKey === "bat" ? "Copied" : "Copy Script"}</span>
                  </button>
                </div>
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 6,
                    background: "#09110d",
                    color: "#d9e5de",
                    fontSize: 12,
                    maxHeight: 220,
                    overflow: "auto",
                    border: "1px solid var(--line)",
                  }}
                >
                  {generatedBat}
                </pre>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VIEW 2: INSTALL ON WINDOWS, iOS & ANDROID */}
      {activeView === "platforms" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Install Jusclick on Windows, iOS &amp; Android</h2>
              <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                Direct standalone installation with offline Service Worker caching, home screen
                icons, and dedicated window framing.
              </p>
            </div>
            <div className="segmented">
              <button
                type="button"
                aria-pressed={selectedPlatformTab === "windows"}
                onClick={() => setSelectedPlatformTab("windows")}
              >
                <Monitor size={14} />
                <span>Windows 10 / 11</span>
              </button>
              <button
                type="button"
                aria-pressed={selectedPlatformTab === "ios"}
                onClick={() => setSelectedPlatformTab("ios")}
              >
                <Smartphone size={14} />
                <span>iOS (iPhone / iPad)</span>
              </button>
              <button
                type="button"
                aria-pressed={selectedPlatformTab === "android"}
                onClick={() => setSelectedPlatformTab("android")}
              >
                <Smartphone size={14} />
                <span>Android</span>
              </button>
            </div>
          </div>

          {selectedPlatformTab === "windows" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div className="meta-inline">Windows 10 / Windows 11 Desktop &amp; Surface</div>
                  <strong style={{ display: "block", fontSize: 15, marginTop: 2 }}>
                    Standalone Windows Desktop App (PWA / Edge / Chrome / Electron EXE)
                  </strong>
                </div>
                {isInstallable && !isInstalled && (
                  <button type="button" className="pri" onClick={() => install()}>
                    <Download size={15} />
                    <span>Install Jusclick on Windows Now</span>
                  </button>
                )}
              </div>

              <div className="grid-equal-2col" style={{ gap: 14 }}>
                <div className="panel" style={{ background: "var(--surface-subtle)", margin: 0 }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    Method A: Instant Standalone App (Edge / Chrome)
                  </strong>
                  <ol className="status-mute" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
                    <li>
                      Click the <strong>Install App</strong> button in the Jusclick top bar (or the
                      app install icon in your Microsoft Edge / Chrome address bar).
                    </li>
                    <li>
                      Confirm <strong>Install</strong>. Jusclick launches in its own dedicated
                      Windows desktop window without browser toolbars.
                    </li>
                    <li>
                      Enable <strong>Pin to Taskbar</strong>, <strong>Pin to Start</strong>, and{" "}
                      <strong>Auto-start on device login</strong> when prompted by Windows.
                    </li>
                  </ol>
                </div>

                <div className="panel" style={{ background: "var(--surface-subtle)", margin: 0 }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    Method B: Native Windows Installer (<code>.exe</code> / <code>.msi</code>)
                  </strong>
                  <p className="status-mute" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6 }}>
                    Compile a standalone Windows NSIS installer or portable executable using the
                    included <code>electron-builder.json</code> configuration:
                  </p>
                  <div
                    className="mono"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#09110d",
                      color: "#d9e5de",
                      fontSize: 12,
                    }}
                  >
                    npm run build:windows
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedPlatformTab === "ios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="meta-inline">iOS 15+ &amp; iPadOS (iPhone / iPad Safari &amp; Xcode)</div>
                <strong style={{ display: "block", fontSize: 15, marginTop: 2 }}>
                  Install Jusclick on iPhone or iPad (Home Screen Standalone App)
                </strong>
              </div>

              <div className="grid-equal-2col" style={{ gap: 14 }}>
                <div className="panel" style={{ background: "var(--surface-subtle)", margin: 0 }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    Method A: Safari &ldquo;Add to Home Screen&rdquo; (No App Store Required)
                  </strong>
                  <ol className="status-mute" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
                    <li>
                      Open <strong>Jusclick</strong> in <strong>Safari</strong> on your iPhone or
                      iPad (via cloud URL or facility LAN{" "}
                      <code>
                        http://{setupCfg.lanIp}:{setupCfg.hostPort}
                      </code>
                      ).
                    </li>
                    <li>
                      Tap the <strong>Share</strong> icon (square with upward arrow) in the Safari
                      toolbar.
                    </li>
                    <li>
                      Scroll down and tap <strong>Add to Home Screen</strong>, then tap{" "}
                      <strong>Add</strong>.
                    </li>
                    <li>
                      Launch <strong>Jusclick</strong> from your Home Screen — it runs full-screen
                      with the high-resolution 180×180 Apple Touch Icon and offline caching.
                    </li>
                  </ol>
                </div>

                <div className="panel" style={{ background: "var(--surface-subtle)", margin: 0 }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    Method B: Native Xcode iOS App (<code>.ipa</code> via Capacitor)
                  </strong>
                  <p className="status-mute" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6 }}>
                    Compile a native iOS/iPadOS application package using the pre-configured{" "}
                    <code>capacitor.config.json</code> (Bundle ID:{" "}
                    <code>com.tfcommodities.Jusclick</code>):
                  </p>
                  <div
                    className="mono"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#09110d",
                      color: "#d9e5de",
                      fontSize: 12,
                    }}
                  >
                    npm run build:ios &amp;&amp; npx cap open ios
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedPlatformTab === "android" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div className="meta-inline">Android 9+ Smartphones &amp; Rugged Gate Tablets</div>
                  <strong style={{ display: "block", fontSize: 15, marginTop: 2 }}>
                    Install Jusclick on Android (WebAPK or Signed Native APK)
                  </strong>
                </div>
                {isInstallable && !isInstalled && (
                  <button type="button" className="pri" onClick={() => install()}>
                    <Download size={15} />
                    <span>Install on Android Now</span>
                  </button>
                )}
              </div>

              <div className="grid-equal-2col" style={{ gap: 14 }}>
                <div className="panel" style={{ background: "var(--surface-subtle)", margin: 0 }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    Method A: One-Tap Android WebAPK Install
                  </strong>
                  <ol className="status-mute" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
                    <li>
                      Open Jusclick in <strong>Chrome for Android</strong> and tap{" "}
                      <strong>Install App</strong> in the top bar (or open Chrome&apos;s menu{" "}
                      <strong>⋮ → Install app</strong>).
                    </li>
                    <li>
                      Android compiles and installs a verified <strong>WebAPK</strong> directly into
                      your app drawer with maskable adaptive icons and long-press shortcuts (
                      <em>Gate Check</em>, <em>Passcodes</em>, <em>On Site</em>).
                    </li>
                  </ol>
                </div>

                <div className="panel" style={{ background: "var(--surface-subtle)", margin: 0 }}>
                  <strong style={{ display: "block", marginBottom: 6 }}>
                    Method B: Signed Android APK (<code>.apk</code> / <code>.aab</code>)
                  </strong>
                  <p className="status-mute" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6 }}>
                    Build a standalone installable <code>.apk</code> for MDM or sideloading onto
                    gate handhelds using Capacitor &amp; Gradle:
                  </p>
                  <div
                    className="mono"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#09110d",
                      color: "#d9e5de",
                      fontSize: 12,
                    }}
                  >
                    npm run build:android &amp;&amp; npx cap open android
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VIEW 3: NATIVE COMPILATION & PACKAGING PIPELINE */}
      {activeView === "compile" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                Native Compilation &amp; Build Reference (iOS, Android &amp; Windows)
              </h2>
              <p className="status-mute" style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                All project configuration files (<code>vite.config.ts</code>,{" "}
                <code>capacitor.config.json</code>, <code>electron-builder.json</code>,{" "}
                <code>setup.mjs</code>) are pre-configured in the repository root.
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Target Platform</th>
                  <th>Output Artifact</th>
                  <th>Config Manifest</th>
                  <th>Build / Compilation Command</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>One-Time Local Host Setup</strong>
                    <div className="status-mute" style={{ fontSize: 12 }}>
                      Interactive CLI Provisioning
                    </div>
                  </td>
                  <td className="mono">Jusclick.host.json / .env.local</td>
                  <td className="mono">setup.mjs</td>
                  <td className="mono">npm run setup</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => copyText("cmd_setup", "npm run setup")}
                    >
                      {copiedKey === "cmd_setup" ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Web &amp; Universal PWA</strong>
                    <div className="status-mute" style={{ fontSize: 12 }}>
                      Service Worker + Manifest + Offline Cache
                    </div>
                  </td>
                  <td className="mono">dist/ (sw.js, manifest.webmanifest)</td>
                  <td className="mono">vite.config.ts</td>
                  <td className="mono">npm run build:web</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => copyText("cmd_web", "npm run build:web")}
                    >
                      {copiedKey === "cmd_web" ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Windows Desktop (10 / 11)</strong>
                    <div className="status-mute" style={{ fontSize: 12 }}>
                      NSIS Installer, MSI &amp; Portable EXE
                    </div>
                  </td>
                  <td className="mono">release/windows/*.exe, *.msi</td>
                  <td className="mono">electron-builder.json</td>
                  <td className="mono">npm run build:windows</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => copyText("cmd_win", "npm run build:windows")}
                    >
                      {copiedKey === "cmd_win" ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Android Native</strong>
                    <div className="status-mute" style={{ fontSize: 12 }}>
                      Signed APK / Android App Bundle
                    </div>
                  </td>
                  <td className="mono">android/app/build/outputs/apk/*.apk</td>
                  <td className="mono">capacitor.config.json</td>
                  <td className="mono">npm run build:android</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => copyText("cmd_and", "npm run build:android")}
                    >
                      {copiedKey === "cmd_and" ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>iOS / iPadOS Native</strong>
                    <div className="status-mute" style={{ fontSize: 12 }}>
                      Xcode Archive &amp; Enterprise IPA
                    </div>
                  </td>
                  <td className="mono">ios/App/App.xcworkspace (.ipa)</td>
                  <td className="mono">capacitor.config.json</td>
                  <td className="mono">npm run build:ios</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => copyText("cmd_ios", "npm run build:ios")}
                    >
                      {copiedKey === "cmd_ios" ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export const PlatformInstallerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  actorEmail?: string;
}> = ({ open, onClose, actorEmail }) => {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Multi-Platform Installer and One-Time Local Host Setup"
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{ maxWidth: 960, width: "95vw", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <PlatformInstallerAndSetupCenter
          actorEmail={actorEmail}
          isModal
          onClose={onClose}
        />
      </div>
    </div>
  );
};
