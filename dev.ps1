# Notempus Development Startup Script (Windows PowerShell)
# Usage: ./dev.ps1
# Or in PowerShell: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition

# Set up environment
$env:PATH = "$SCRIPT_DIR\.tools\node\bin;$env:PATH"
$env:COREPACK_HOME = "$SCRIPT_DIR\.tools\corepack"

Write-Host "🚀 Notempus Development Server" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 Project directory: $SCRIPT_DIR"

# Get Node version
try {
  $NODE_VERSION = & "$SCRIPT_DIR\.tools\node\bin\node.exe" --version
  Write-Host "📦 Node: $NODE_VERSION"
} catch {
  Write-Host "⚠️  Node binary not found at .tools/node/bin/node.exe" -ForegroundColor Yellow
  exit 1
}

Write-Host ""

# Check if node_modules exists
$NODE_MODULES_PATH = Join-Path $SCRIPT_DIR "node_modules"

if (-Not (Test-Path $NODE_MODULES_PATH)) {
  Write-Host "📥 Installing dependencies..."
  & "$SCRIPT_DIR\.tools\node\bin\pnpm.exe" install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ pnpm install failed" -ForegroundColor Red
    exit 1
  }
  Write-Host "✅ Dependencies installed" -ForegroundColor Green
  Write-Host ""
} else {
  Write-Host "✓ Dependencies already installed (skipping pnpm install)" -ForegroundColor Green
  Write-Host ""
}

# Start development server
Write-Host "▶️  Starting development server..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "Web:        http://localhost:3000"
Write-Host "Guest chat: http://localhost:3000/chat?guest=true"
Write-Host "API:        http://127.0.0.1:4000"
Write-Host ""
Write-Host "Press Ctrl+C to stop"
Write-Host ""

& "$SCRIPT_DIR\.tools\node\bin\pnpm.exe" dev
