#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f deploy.sh ]; then
  exec bash deploy.sh rollback
fi

echo "rollback failed: deploy.sh not found" >&2
exit 1
