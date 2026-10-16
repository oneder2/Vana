#!/usr/bin/env bash
# Keep the old entry point without overwriting the reviewed artwork with a stub.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/generate-icons.sh"
