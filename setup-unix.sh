#!/usr/bin/env bash
set -e

echo "============================================================================"
echo "  TFsecure — Security Operations & Gate Access Control (Jusclick-TeQiQ)"
echo "  One-Time Local Host Setup & Multi-Platform Provisioning (macOS / Linux)"
echo "============================================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js v18+ is required. Install from https://nodejs.org/ and retry."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/3] Installing required packages..."
  npm install
fi

echo "[2/3] Launching Interactive One-Time Setup Wizard..."
node setup.mjs

echo ""
echo "[3/3] Setup finished. Start the local server anytime with: ./start-tfsecure-unix.sh"
