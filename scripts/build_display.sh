#!/bin/bash

# Mirrorial - Flutter Display Build Script
set -e

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER_SDK_DIR="$HOME/flutter"
FLUTTER_BIN="$FLUTTER_SDK_DIR/bin/flutter"

echo "🏗️ Preparing to build Mirrorial Display..."

# 1. Install Flutter SDK if missing
if [ ! -f "$FLUTTER_BIN" ]; then
    ARCH=$(uname -m)
    echo "📥 Flutter SDK not found. Detected architecture: $ARCH"
    mkdir -p "$FLUTTER_SDK_DIR"
    
    # Use Latest Stable Version as of March 2026
    VERSION="3.41.4"
    
    if [ "$ARCH" == "aarch64" ]; then
        URL="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_arm64_${VERSION}-stable.tar.xz"
    else
        URL="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${VERSION}-stable.tar.xz"
    fi
    
    echo "📥 Downloading from $URL..."
    # Download with status check
    curl -f -L "$URL" -o "/tmp/flutter.tar.xz"
    
    if [ $? -eq 0 ]; then
        echo "📦 Extracting Flutter SDK..."
        tar -xJ -f "/tmp/flutter.tar.xz" -C "$HOME"
        rm "/tmp/flutter.tar.xz"
    else
        echo "❌ Error: Failed to download Flutter SDK. Check your internet connection or the URL."
        exit 1
    fi
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
