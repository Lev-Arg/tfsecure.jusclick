#!/usr/bin/env node
/**
 * Jusclick — Jusclick-TeQiQ Gate Access & Security Operations
 * Interactive One-Time Local Host Setup & Multi-Platform Provisioning Wizard
 *
 * Run with:
 *   node setup.mjs
 *   npm run setup
 *   node setup.mjs --non-interactive
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execSync, spawn } from "node:child_process";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  gold: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bgGreen: "\x1b[42m\x1b[30m",
};

function banner() {
  console.log("");
  console.log(`${C.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}  Jusclick — Security Operations & Gate Access Control (Jusclick-TeQiQ v2.5)${C.reset}`);
  console.log(`${C.gold}  Interactive One-Time Local Host Setup & Multi-Platform Installer${C.reset}`);
  console.log(`${C.dim}  Supports Windows Desktop, iOS (Safari / Capacitor), Android (APK / PWA)${C.reset}`);
  console.log(`${C.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log("");
}

function getLanIpAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
      if (net.family === familyV4Value && !net.internal) {
        results.push({ interface: name, address: net.address });
      }
    }
  }
  return results;
}

function checkCommand(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

async function main() {
  const isNonInteractive = process.argv.includes("--non-interactive") || !input.isTTY;
  banner();

  console.log(`${C.bold}01. Pre-Flight Environment Diagnostics${C.reset}`);
  const nodeVer = process.version;
  const npmVer = checkCommand("npm -v") || "not detected";
  const gitVer = checkCommand("git --version") || "not detected";
  const lanIps = getLanIpAddresses();
  const primaryLanIp = lanIps[0]?.address || "127.0.0.1";

  console.log(`  • Operating System : ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`  • Node.js Runtime  : ${C.green}${nodeVer}${C.reset}`);
  console.log(`  • NPM Package Mgr  : ${C.green}${npmVer}${C.reset}`);
  console.log(`  • Git Version      : ${gitVer}`);
  console.log(`  • Facility LAN IP  : ${C.cyan}${primaryLanIp}${C.reset} ${lanIps.length > 1 ? `(+${lanIps.length - 1} other interfaces)` : ""}`);
  console.log("");

  let orgName = "TF Commodities";
  let facilityCode = "TFC-HQ-GATE1";
  let adminEmail = "admin@tfcommodities.com";
  let hostPort = "3000";
  let bindHost = "0.0.0.0";
  let convexUrl = process.env.VITE_CONVEX_URL || "";
  let runBuildNow = "y";
  let createLaunchers = "y";
  let startServerNow = "n";

  if (!isNonInteractive) {
    const rl = readline.createInterface({ input, output });
    try {
      console.log(`${C.bold}02. Interactive Facility & Local Host Configuration${C.reset}`);
      console.log(`${C.dim}  Press Enter to accept the recommended default in brackets.${C.reset}\n`);

      const qOrg = await rl.question(`  Organization Name [${C.gold}${orgName}${C.reset}]: `);
      if (qOrg.trim()) orgName = qOrg.trim();

      const qFac = await rl.question(`  Facility Checkpoint Code [${C.gold}${facilityCode}${C.reset}]: `);
      if (qFac.trim()) facilityCode = qFac.trim();

      const qAdmin = await rl.question(`  Primary System Admin Email [${C.gold}${adminEmail}${C.reset}]: `);
      if (qAdmin.trim()) adminEmail = qAdmin.trim();

      const qPort = await rl.question(`  Local Host HTTP Port [${C.gold}${hostPort}${C.reset}]: `);
      if (qPort.trim() && /^\d+$/.test(qPort.trim())) hostPort = qPort.trim();

      const qBind = await rl.question(`  Network Interface Binding (0.0.0.0 allows iOS/Android LAN tablets) [${C.gold}${bindHost}${C.reset}]: `);
      if (qBind.trim()) bindHost = qBind.trim();

      const qConvex = await rl.question(`  Convex Deployment URL (optional, leave blank for local offline-first mode) [${C.gold}${convexUrl || "local-hybrid"}${C.reset}]: `);
      if (qConvex.trim()) convexUrl = qConvex.trim();

      const qBuild = await rl.question(`  Install dependencies & compile production bundle now? (y/n) [${C.gold}y${C.reset}]: `);
      if (qBuild.trim()) runBuildNow = qBuild.trim().toLowerCase();

      const qLaunch = await rl.question(`  Generate one-click Windows (.bat) & Unix (.sh) startup launchers? (y/n) [${C.gold}y${C.reset}]: `);
      if (qLaunch.trim()) createLaunchers = qLaunch.trim().toLowerCase();

      const qStart = await rl.question(`  Launch local production server immediately after setup? (y/n) [${C.gold}n${C.reset}]: `);
      if (qStart.trim()) startServerNow = qStart.trim().toLowerCase();
    } finally {
      rl.close();
    }
  } else {
    console.log(`${C.dim}  Running in non-interactive mode with default enterprise parameters...${C.reset}`);
  }

  console.log("");
  console.log(`${C.bold}03. Writing One-Time Local Host Configuration${C.reset}`);

  const setupConfig = {
    organizationName: orgName,
    facilityCode,
    primaryAdminEmail: adminEmail,
    host: bindHost,
    port: Number(hostPort),
    lanAddress: `http://${primaryLanIp}:${hostPort}`,
    localhostAddress: `http://localhost:${hostPort}`,
    convexUrl: convexUrl || null,
    compliancePolicyVersion: "Act843-v2.5",
    platforms: {
      windows: "PWA Standalone / Electron NSIS & Portable (.exe)",
      ios: "iOS Safari Add to Home Screen (WebKit Standalone) / Capacitor Xcode (.ipa)",
      android: "Android Chrome WebAPK / Capacitor Android Studio (.apk)",
    },
    provisionedAt: new Date().toISOString(),
  };

  const configPath = path.resolve(process.cwd(), "Jusclick.host.json");
  fs.writeFileSync(configPath, JSON.stringify(setupConfig, null, 2), "utf8");
  console.log(`  ✓ Saved host manifest: ${C.cyan}Jusclick.host.json${C.reset}`);

  const envLines = [
    `# Jusclick One-Time Local Host Environment — Generated ${setupConfig.provisionedAt}`,
    `VITE_ORG_NAME="${orgName}"`,
    `VITE_FACILITY_CODE="${facilityCode}"`,
    `VITE_PRIMARY_ADMIN_EMAIL="${adminEmail}"`,
    `VITE_LOCAL_HOST_PORT="${hostPort}"`,
  ];
  if (convexUrl) {
    envLines.push(`VITE_CONVEX_URL="${convexUrl}"`);
  }
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envLines.join("\n") + "\n", "utf8");
    console.log(`  ✓ Created environment file: ${C.cyan}.env.local${C.reset}`);
  } else {
    console.log(`  • Existing ${C.cyan}.env.local${C.reset} preserved`);
  }

  if (createLaunchers.startsWith("y")) {
    const winBat = [
      "@echo off",
      "title Jusclick Local Host Server (" + orgName + " - " + facilityCode + ")",
      "echo ======================================================================",
      "echo   Jusclick Gate Access Control - Local Host Server",
      "echo   Organization : " + orgName + " (" + facilityCode + ")",
      "echo   Local URL    : http://localhost:" + hostPort,
      "echo   Facility LAN : http://" + primaryLanIp + ":" + hostPort,
      "echo ======================================================================",
      "npm run dev -- --port=" + hostPort + " --host=" + bindHost,
      "pause",
    ].join("\r\n");
    fs.writeFileSync(path.resolve(process.cwd(), "start-Jusclick-windows.bat"), winBat, "utf8");

    const unixSh = [
      "#!/usr/bin/env bash",
      "set -e",
      'echo "======================================================================"',
      'echo "  Jusclick Gate Access Control - Local Host Server"',
      'echo "  Organization : ' + orgName + " (" + facilityCode + ')"',
      'echo "  Local URL    : http://localhost:' + hostPort + '"',
      'echo "  Facility LAN : http://' + primaryLanIp + ":" + hostPort + '"',
      'echo "======================================================================"',
      "npm run dev -- --port=" + hostPort + " --host=" + bindHost,
    ].join("\n");
    const unixPath = path.resolve(process.cwd(), "start-Jusclick-unix.sh");
    fs.writeFileSync(unixPath, unixSh, "utf8");
    try {
      fs.chmodSync(unixPath, 0o755);
    } catch {
      // ignore chmod on Windows
    }
    console.log(`  ✓ Created Windows launcher: ${C.cyan}start-Jusclick-windows.bat${C.reset}`);
    console.log(`  ✓ Created macOS/Linux launcher: ${C.cyan}start-Jusclick-unix.sh${C.reset}`);
  }

  if (runBuildNow.startsWith("y") && !isNonInteractive) {
    console.log("");
    console.log(`${C.bold}04. Installing Dependencies & Compiling Production Assets${C.reset}`);
    try {
      if (!fs.existsSync(path.resolve(process.cwd(), "node_modules"))) {
        console.log("  • Running npm install...");
        execSync("npm install", { stdio: "inherit" });
      }
      console.log("  • Compiling TypeScript & PWA Service Worker bundle (npm run build)...");
      execSync("npm run build", { stdio: "inherit" });
      console.log(`  ✓ ${C.green}Production PWA & Native Web Bundle compiled to ./dist${C.reset}`);
    } catch (err) {
      console.log(`  ! Build warning: ${err?.message || err}`);
    }
  }

  console.log("");
  console.log(`${C.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}  SETUP COMPLETE — Jusclick Local Host & Multi-Platform Summary${C.reset}`);
  console.log(`${C.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`  • Desktop Workstation URL : ${C.cyan}http://localhost:${hostPort}${C.reset}`);
  console.log(`  • Facility LAN Gate URL   : ${C.cyan}http://${primaryLanIp}:${hostPort}${C.reset}`);
  console.log(`  • Primary System Admin    : ${C.gold}${adminEmail}${C.reset} (First account auto-promoted)`);
  console.log(`  • Windows Installation    : Open in Edge/Chrome → Click "Install App" in top bar`);
  console.log(`  • Android Installation    : Open LAN URL in Chrome → Tap "Install App" (WebAPK)`);
  console.log(`  • iOS / iPadOS Install    : Open LAN URL in Safari → Share → "Add to Home Screen"`);
  console.log(`${C.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log("");

  if (startServerNow.startsWith("y") && !isNonInteractive) {
    console.log(`  Starting Jusclick local server on http://${bindHost}:${hostPort} ...`);
    const child = spawn("npm", ["run", "dev", "--", `--port=${hostPort}`, `--host=${bindHost}`], {
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  }
}

main().catch((err) => {
  console.error("Setup encountered an error:", err);
  process.exit(1);
});
