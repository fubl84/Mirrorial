#!/bin/bash

# Mirrorial - Intelligent Update Script
# Goal: Skip steps if files haven't changed to save time on low-power hardware.

set -e
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER_BIN="$HOME/flutter/bin/flutter"
FORCE=false

# Check for force flag
if [[ "$1" == "-f" || "$1" == "--force" ]]; then
    FORCE=true
    echo "⚠️ Force mode enabled. Running all steps..."
fi

# Helper: Check if directory A has files newer than file B
needs_build() {
    local src_dir=$1
    local target_file=$2
    if [ ! -f "$target_file" ]; then return 0; fi
    if [ "$FORCE" = true ]; then return 0; fi
    
    # Find any file in src_dir newer than target_file
    if [ "$(find "$src_dir" -type f -newer "$target_file" | wc -l)" -gt 0 ]; then
        return 0 # Needs build
    else
        return 1 # Skip
    fi
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

# 1. Backend Dependencies
echo "📦 Checking Backend dependencies..."
if file_changed "$PROJECT_ROOT/backend/package.json" "$PROJECT_ROOT/backend/node_modules"; then
    echo "   -> Changes detected. Running npm install..."
    cd "$PROJECT_ROOT/backend" && npm install
else
    echo "   -> No changes. Skipping."
fi

# 2. Remote UI Dependencies & Build
echo "📦 Checking Remote UI dependencies..."
UI_REBUILD_NEEDED=false
if file_changed "$PROJECT_ROOT/remote_ui/package.json" "$PROJECT_ROOT/remote_ui/node_modules"; then
    echo "   -> Changes detected. Running npm install..."
    cd "$PROJECT_ROOT/remote_ui" && npm install
    UI_REBUILD_NEEDED=true
fi

echo "🏗️ Checking Remote UI build..."
if [ "$UI_REBUILD_NEEDED" = true ] || needs_build "$PROJECT_ROOT/remote_ui/src" "$PROJECT_ROOT/remote_ui/dist/index.html"; then
    echo "   -> Source changes detected. Building Remote UI..."
    cd "$PROJECT_ROOT/remote_ui" && npm run build
    sudo systemctl restart mirror-backend
else
    echo "   -> No changes. Skipping."
fi

# 3. Flutter Display App
echo "🏗️ Checking Flutter SDK..."
if [ ! -f "$FLUTTER_BIN" ]; then
    echo "   -> SDK missing. Running full engine setup..."
    sudo "$PROJECT_ROOT/scripts/build_display.sh"
else
    echo "🎨 Checking Display App code..."
    DISPLAY_BUILD_NEEDED=false
    
    # Check pubspec for dependency changes
    if file_changed "$PROJECT_ROOT/display_app/pubspec.yaml" "$PROJECT_ROOT/display_app/.dart_tool"; then
        echo "   -> pubspec.yaml changed. Running pub get..."
        cd "$PROJECT_ROOT/display_app" && "$FLUTTER_BIN" pub get
        DISPLAY_BUILD_NEEDED=true
    fi

    # Check lib/ for source changes
    if [ "$DISPLAY_BUILD_NEEDED" = true ] || needs_build "$PROJECT_ROOT/display_app/lib" "$PROJECT_ROOT/display_app/bundle/kernel_blob.bin"; then
        echo "   -> Source changes detected. Compiling Flutter bundle..."
        cd "$PROJECT_ROOT/display_app"
        "$FLUTTER_BIN" build bundle
        
        echo "📁 Updating assets..."
        rm -rf "$PROJECT_ROOT/display_app/bundle"
        cp -r "$PROJECT_ROOT/display_app/build/flutter_assets" "$PROJECT_ROOT/display_app/bundle"
        
        echo "🔄 Restarting display engine..."
        sudo systemctl restart mirror-display
    else
        echo "   -> No changes. Skipping."
    fi
fi

echo "✅ Update process finished."
