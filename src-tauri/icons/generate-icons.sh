#!/usr/bin/env bash
# Compatibility entry point. Install Pillow, then run from any directory.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/../../scripts/generate-app-icons.py"
