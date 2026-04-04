#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
HOST_ARCH=$(uname -m)
OUTPUT_PATH=""
SKIP_BUILD=false

usage() {
  cat <<EOF
Package a prebuilt Mirrorial display bundle

Usage:
  ./scripts/package_display_bundle.sh [--output FILE] [--skip-build]

Options:
  --output FILE  Write the archive to FILE. Defaults to ./dist/mirrorial-display-bundle-<arch>-flutterpi.tar.gz
  --skip-build   Reuse the existing display_app/bundle instead of rebuilding it first.
  --help         Show this message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ Missing value for --output" >&2
        exit 1
      fi
      OUTPUT_PATH="$1"
      ;;
    --skip-build)
      SKIP_BUILD=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

case "$HOST_ARCH" in
  aarch64|arm64)
    ARCH_LABEL="arm64"
    ;;
  x86_64|amd64)
    ARCH_LABEL="x64"
    ;;
  armv7l|armv6l)
    ARCH_LABEL="arm"
    ;;
  *)
    ARCH_LABEL="$HOST_ARCH"
    ;;
esac

if [[ -z "$OUTPUT_PATH" ]]; then
  OUTPUT_PATH="$PROJECT_ROOT/dist/mirrorial-display-bundle-${ARCH_LABEL}-flutterpi.tar.gz"
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "🏗️ Building display bundle before packaging..."
  MIRRORIAL_SKIP_RESTART=1 bash "$PROJECT_ROOT/scripts/build_display.sh"
fi

if [[ ! -f "$PROJECT_ROOT/display_app/bundle/app.so" ]]; then
  echo "❌ display_app/bundle/app.so does not exist. Build the release bundle first." >&2
  exit 1
fi

echo "📦 Writing prebuilt bundle archive to $OUTPUT_PATH"
tar -C "$PROJECT_ROOT/display_app" -czf "$OUTPUT_PATH" bundle

echo "✅ Prebuilt display bundle ready:"
echo "   $OUTPUT_PATH"
