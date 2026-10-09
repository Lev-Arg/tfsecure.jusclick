@echo off
setlocal enabledelayedexpansion
title Jusclick — One-Time Local Host Setup Wizard (Windows)

echo ============================================================================
echo   Jusclick — Security Operations ^& Gate Access Control (Jusclick-TeQiQ)
echo   One-Time Local Host Setup ^& Windows Desktop Provisioning
echo ============================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js v18+ is required to run the Jusclick Local Host Server.
  echo Please install Node.js LTS from https://nodejs.org/ and re-run this file.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing required packages...
  call npm install
)

echo [2/3] Launching Interactive One-Time Setup Wizard...
node setup.mjs

echo.
echo [3/3] Setup finished. You can launch the local server anytime using:
echo       start-Jusclick-windows.bat   or   npm run dev
echo.
pause
