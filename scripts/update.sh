#!/bin/bash

# Mirrorial - Intelligent Update Script
set -e
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER_BIN="$PROJECT_ROOT/scripts/flutterw.sh"
FORCE=false

# Redirect temp folders to SD card
export TMPDIR="$HOME/.mirrorial_tmp"
export PUB_CACHE="$HOME/.pub-cache"
mkdir -p "$TMPDIR"
mkdir -p "$PUB_CACHE"

if [[ "$1" == "-f" || "$1" == "--force" ]]; then FORCE=true; fi

# Helper: Check if directory A has files newer than file B
needs_build() {
    local src_dir=$1
    local target_file=$2
    if [ ! -f "$target_file" ]; then return 0; fi
    if [ "$FORCE" = true ]; then return 0; fi
    if [ "$(find "$src_dir" -type f -newer "$target_file" | wc -l)" -gt 0 ]; then return 0; else return 1; fi
}

# Helper: Check if file A is newer than file B
file_changed() {
    local src_file=$1
    local target_indicator=$2
    if [ ! -e "$target_indicator" ]; then return 0; fi
    if [ "$FORCE" = true ]; then return 0; fi
    if [ "$src_file" -nt "$target_indicator" ]; then return 0; else return 1; fi
}

echo "🔄 Starting Mirrorial Intelligent Update..."

# 1. Backend
echo "📦 Checking Backend..."
if file_changed "$PROJECT_ROOT/backend/package.json" "$PROJECT_ROOT/backend/node_modules"; then
    cd "$PROJECT_ROOT/backend" && npm install
fi

# 2. Remote UI
echo "📦 Checking Remote UI..."
UI_REBUILD_NEEDED=false
if file_changed "$PROJECT_ROOT/remote_ui/package.json" "$PROJECT_ROOT/remote_ui/node_modules"; then
    cd "$PROJECT_ROOT/remote_ui" && npm install
    UI_REBUILD_NEEDED=true
fi
if [ "$UI_REBUILD_NEEDED" = true ] || needs_build "$PROJECT_ROOT/remote_ui/src" "$PROJECT_ROOT/remote_ui/dist/index.html"; then
    cd "$PROJECT_ROOT/remote_ui" && npm run build
    sudo systemctl restart mirror-backend
fi

# 3. Flutter Display (Validate SDK First)
echo "🏗️ Checking Flutter SDK..."
SDK_VALID=true
if [ ! -x "$FLUTTER_BIN" ]; then
  SDK_VALID=false
elif ! "$FLUTTER_BIN" --version > /dev/null 2>&1; then
    echo "⚠️ Flutter SDK is broken (Exec format error?)."
    SDK_VALID=false
fi

if [ "$SDK_VALID" = false ]; then
    echo "   -> Running full engine repair/setup..."
    "$PROJECT_ROOT/scripts/build_display.sh"
else
    echo "🎨 Checking Display App code..."
    DISPLAY_BUILD_NEEDED=false
    if file_changed "$PROJECT_ROOT/display_app/pubspec.yaml" "$PROJECT_ROOT/display_app/.dart_tool"; then
        cd "$PROJECT_ROOT/display_app" && "$FLUTTER_BIN" pub get
        DISPLAY_BUILD_NEEDED=true
    fi
    if [ "$DISPLAY_BUILD_NEEDED" = true ] || needs_build "$PROJECT_ROOT/display_app/lib" "$PROJECT_ROOT/display_app/bundle/kernel_blob.bin"; then
        cd "$PROJECT_ROOT/display_app"
        "$FLUTTER_BIN" build bundle
        rm -rf "$PROJECT_ROOT/display_app/bundle"
        cp -r "$PROJECT_ROOT/display_app/build/flutter_assets" "$PROJECT_ROOT/display_app/bundle"
        sudo systemctl restart mirror-display
    fi
fi

echo "✅ Update process finished."
