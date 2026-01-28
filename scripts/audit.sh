#!/usr/bin/env bash
# Thin wrapper — delegates to the Node audit script
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/audit.mjs" "$@"
