#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

find_flutter_bin() {
  local candidates=()

  if [[ -n "${FLUTTER_BIN:-}" ]]; then
    candidates+=("$FLUTTER_BIN")
  fi
  if [[ -n "${FLUTTER_SDK_PATH:-}" ]]; then
    candidates+=("$FLUTTER_SDK_PATH/bin/flutter")
  fi

  candidates+=(
    "$PROJECT_ROOT/.local/flutter/bin/flutter"
    "$HOME/flutter/bin/flutter"
    "$HOME/development/flutter/bin/flutter"
  )

  if command -v flutter >/dev/null 2>&1; then
    candidates+=("$(command -v flutter)")
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

if ! FLUTTER_BIN_PATH=$(find_flutter_bin); then
  cat <<'EOF' >&2
Flutter SDK not found.

Supported options:
- install Flutter anywhere and export FLUTTER_SDK_PATH=/absolute/path/to/flutter
- install Flutter into $HOME/flutter
- place a project-local SDK at ./.local/flutter
- make `flutter` available on PATH

Then run:
  ./scripts/check_display.sh

For local macOS development:
  ./scripts/run_mac.sh
EOF
  exit 1
fi

exec "$FLUTTER_BIN_PATH" "$@"
