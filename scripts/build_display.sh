#!/bin/bash

# Mirrorial - Flutter Display Build Script
set -e

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER_SDK_DIR="$HOME/flutter"
FLUTTER_BIN="$FLUTTER_SDK_DIR/bin/flutter"

echo "🏗️ Preparing to build Mirrorial Display..."

# 1. Install Flutter SDK if missing or broken
SHOULD_INSTALL=false
if [ ! -f "$FLUTTER_BIN" ]; then
    SHOULD_INSTALL=true
else
    # Check if the binary actually runs (detect Exec format error)
    if ! "$FLUTTER_BIN" --version > /dev/null 2>&1; then
        echo "⚠️ Existing Flutter SDK is broken or wrong architecture. Removing..."
        rm -rf "$FLUTTER_SDK_DIR"
        SHOULD_INSTALL=true
    fi
fi

if [ "$SHOULD_INSTALL" = true ]; then
    echo "📥 Installing Flutter SDK via official Git clone (ARM64 compatible)..."
    git clone https://github.com/flutter/flutter.git -b stable "$FLUTTER_SDK_DIR"
    
    echo "⚙️ Initializing Flutter artifacts..."
    "$FLUTTER_BIN" --version
fi

# 2. Build the Flutter Bundle
echo "🛠️ Building Flutter bundle..."
cd "$PROJECT_ROOT/display_app"

"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" build bundle

# 3. Prepare the directory for flutter-pi
echo "📁 Organizing bundle..."
rm -rf "$PROJECT_ROOT/display_app/bundle"
cp -r "$PROJECT_ROOT/display_app/build/flutter_assets" "$PROJECT_ROOT/display_app/bundle"

echo "✅ Build complete!"
echo "🔄 Restarting display service..."
sudo systemctl restart mirror-display
