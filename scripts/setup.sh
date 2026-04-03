#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo "ℹ️ scripts/setup.sh is now a compatibility wrapper."
echo "   Forwarding to scripts/install_linux.sh."

exec "$PROJECT_ROOT/scripts/install_linux.sh" "$@"
