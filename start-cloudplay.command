#!/bin/bash
# Double-click on macOS to start CloudPlay.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then double-click this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
node scripts/start.mjs "$@"
