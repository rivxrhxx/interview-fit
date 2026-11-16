#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script must be run on macOS." >&2
  exit 1
fi

missing=0
for command in node npm cargo rustc; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing prerequisite: $command" >&2
    missing=1
  fi
done

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Missing Xcode Command Line Tools. Run: xcode-select --install" >&2
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo "Install the missing prerequisites, then rerun this script." >&2
  exit 1
fi

npm install
npm run verify:harness
npm run build

echo "Setup complete. Start the desktop app with: npm run tauri dev"
