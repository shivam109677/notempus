#!/bin/bash

# Notempus Development Startup Script
# Supports: Linux, macOS, Git Bash, WSL
# Usage: ./dev.sh

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set up environment
export PATH="$SCRIPT_DIR/.tools/node/bin:$PATH"
export COREPACK_HOME="$SCRIPT_DIR/.tools/corepack"

echo "🚀 Notempus Development Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Project directory: $SCRIPT_DIR"
echo "📦 Node: $($SCRIPT_DIR/.tools/node/bin/node --version)"
echo ""

# Only install if node_modules doesn't exist
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "📥 Installing dependencies..."
  $SCRIPT_DIR/.tools/node/bin/pnpm install
  echo "✅ Dependencies installed"
  echo ""
else
  echo "✓ Dependencies already installed (skipping pnpm install)"
  echo ""
fi

# Start development server
echo "▶️  Starting development server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Web:        http://localhost:3000"
echo "Guest chat: http://localhost:3000/chat?guest=true"
echo "API:        http://127.0.0.1:4000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

$SCRIPT_DIR/.tools/node/bin/pnpm dev
