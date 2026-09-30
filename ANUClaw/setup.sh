#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║          ANUClaw Setup v1.0.0            ║"
echo "║  Unified AI Research & Medical Assistant ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Prerequisites check ───────────────────────────────────────────────────────
check() { command -v "$1" &>/dev/null; }

echo "Checking prerequisites..."

if ! check node; then
  echo "❌ Node.js not found. Install Node.js 20+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 20 ]]; then
  echo "❌ Node.js 20+ required (found v$NODE_VERSION)"
  exit 1
fi
echo "✅ Node.js $(node --version)"

if ! check docker && ! check container; then
  echo "❌ Docker or Apple Container not found."
  echo "   Install Docker Desktop: https://docker.com/products/docker-desktop"
  exit 1
fi

if check docker; then
  echo "✅ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
elif check container; then
  echo "✅ Apple Container $(container --version)"
fi

# ── Install dependencies ──────────────────────────────────────────────────────
echo ""
echo "Installing Node.js dependencies..."
npm install

# ── Environment configuration ─────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo ""
  echo "📝 Created .env from template"
  echo ""
  echo "┌─────────────────────────────────────────────┐"
  echo "│  Required: Add your API key to .env          │"
  echo "│                                              │"
  echo "│  ANTHROPIC_API_KEY=your_key_here             │"
  echo "│                                              │"
  echo "│  Optional: Add channel tokens for           │"
  echo "│  Telegram, Discord, Slack, WhatsApp, etc.   │"
  echo "└─────────────────────────────────────────────┘"
  echo ""

  read -p "Open .env in your editor now? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    "${EDITOR:-nano}" .env
  fi
else
  echo "✅ .env already exists"
fi

# ── Build TypeScript ──────────────────────────────────────────────────────────
echo ""
echo "Building TypeScript..."
npm run build
echo "✅ Build complete"

# ── Build agent container ──────────────────────────────────────────────────────
echo ""
read -p "Build agent container now? (recommended, takes 5-10 min) [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  bash container/build.sh
else
  echo "⚠️  Skipping container build. Run './container/build.sh' before starting."
fi

# ── Workspace directories ──────────────────────────────────────────────────────
mkdir -p workspace groups logs

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Setup Complete! 🎉               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys and channel tokens"
echo "  2. Run: npm start"
echo "  3. Open http://localhost:3721 for the web UI"
echo ""
echo "Or use Claude Code inside this project:"
echo "  claude"
echo "  > /setup"
echo ""
