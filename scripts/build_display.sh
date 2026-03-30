#!/bin/bash

# Mirrorial - Flutter Display Build Script (Optimized)
set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER_SDK_DIR="$HOME/flutter"
FLUTTER_BIN="$FLUTTER_SDK_DIR/bin/flutter"
RESTART_DISPLAY=${MIRRORIAL_SKIP_RESTART:-0}

# CRITICAL: Redirect temp folders away from RAM-disk (/tmp) to the SD card
export TMPDIR="$HOME/.mirrorial_tmp"
export PUB_CACHE="$HOME/.pub-cache"
mkdir -p "$TMPDIR"
mkdir -p "$PUB_CACHE"

echo "🏗️ Preparing to build Mirrorial Display..."

# 1. Install or Update Flutter SDK
if [ ! -d "$FLUTTER_SDK_DIR/.git" ]; then
    echo "📥 Installing Flutter SDK (One-time setup)..."
    rm -rf "$FLUTTER_SDK_DIR" # Clear any broken non-git folders
    git clone https://github.com/flutter/flutter.git -b stable "$FLUTTER_SDK_DIR"
else
    echo "🔄 Flutter SDK exists. Checking for updates..."
    cd "$FLUTTER_SDK_DIR"
    # Detect architecture/corruption. If broken, reset.
    if ! bin/flutter --version > /dev/null 2>&1; then
        echo "⚠️ SDK corrupted or wrong architecture. Performing hard reset..."
        git clean -xfd
        git checkout .
    else
        # Just a quick pull to keep it current
        git pull origin stable
    fi
    cd "$PROJECT_ROOT"
fi

# 2. Build the Flutter Bundle
echo "🛠️ Building Flutter bundle..."
cd "$PROJECT_ROOT/display_app"

# Ensure we use our SD-card cache for pub
"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" build bundle

# 3. Organize bundle
echo "📁 Organizing bundle..."
rm -rf "$PROJECT_ROOT/display_app/bundle"
cp -r "$PROJECT_ROOT/display_app/build/flutter_assets" "$PROJECT_ROOT/display_app/bundle"

# 4. Cleanup
rm -rf "$TMPDIR"/*

echo "✅ Build complete!"

if [[ "$RESTART_DISPLAY" == "1" ]]; then
    echo "ℹ️ Skipping display service restart."
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files mirror-display.service >/dev/null 2>&1; then
    echo "🔄 Restarting display service..."
    sudo systemctl restart mirror-display.service
else
    echo "ℹ️ mirror-display.service is not registered yet. Skipping restart."
fi
