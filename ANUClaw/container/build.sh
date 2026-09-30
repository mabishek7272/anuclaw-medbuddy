#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${ANUCLAW_IMAGE:-anuclaw-agent:latest}"

echo "Building ANUClaw agent container: $IMAGE_NAME"
echo "This will take 5-10 minutes on first build..."

# Detect runtime (docker or apple container)
if command -v container &>/dev/null && [[ "$(uname)" == "Darwin" ]]; then
  echo "Using Apple Container runtime"
  container build --tag "$IMAGE_NAME" "$SCRIPT_DIR"
else
  echo "Using Docker runtime"
  docker build --tag "$IMAGE_NAME" "$SCRIPT_DIR"
fi

echo ""
echo "✅ Container built: $IMAGE_NAME"
echo "Run 'npm start' to launch ANUClaw"
