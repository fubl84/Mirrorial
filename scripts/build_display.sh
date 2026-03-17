#!/bin/bash

# Mirrorial - Flutter Display Build Script
set -e

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER_SDK_DIR="$HOME/flutter-sdk"
FLUTTER_BIN="$FLUTTER_SDK_DIR/bin/flutter"

echo "🏗️ Preparing to build Mirrorial Display..."

# 1. Install Flutter SDK if missing
if [ ! -f "$FLUTTER_BIN" ]; then
    echo "📥 Flutter SDK not found. Downloading portable SDK for ARM64..."
    mkdir -p "$FLUTTER_SDK_DIR"
    # Note: Using the stable Linux ARM64 release
    curl -L https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.24.3-stable.tar.xz | tar -xJ -C "$HOME"
fi

# 2. Build the Flutter Bundle
echo "🛠️ Building Flutter bundle (this will take time on a Pi Zero 2W)..."
cd "$PROJECT_ROOT/display_app"

# Ensure dependencies are fetched
"$FLUTTER_BIN" pub get

# Build the bundle
# We use 'build bundle' which is the standard way to package for flutter-pi
"$FLUTTER_BIN" build bundle

# 3. Prepare the directory for flutter-pi
echo "📁 Organizing bundle for the display engine..."
# flutter-pi expects the contents of build/flutter_assets
rm -rf "$PROJECT_ROOT/display_app/bundle"
cp -r "$PROJECT_ROOT/display_app/build/flutter_assets" "$PROJECT_ROOT/display_app/bundle"

echo "✅ Build complete! Bundle is ready at $PROJECT_ROOT/display_app/bundle"
echo "🔄 Restarting display service..."
sudo systemctl restart mirror-display
