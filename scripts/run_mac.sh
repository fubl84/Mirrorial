#!/bin/bash

# Mirrorial - Mac Development Runner
# ---------------------------------
# This script starts all components for local development.

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo "🍏 Starting Mirrorial Development Environment on Mac..."

# 1. Start Backend (in background)
echo "📦 Starting Backend (Port 3000)..."
cd "$PROJECT_ROOT/backend"
npm install
node index.js &
BACKEND_PID=$!
sleep 2 # Give backend a moment to start

# 2. Start Remote UI (in background)
echo "🌐 Starting Remote UI Dev Server..."
cd "$PROJECT_ROOT/remote_ui"
npm install
npm run dev &
UI_PID=$!

# 3. Start Flutter Display (Desktop Mode)
echo "🎨 Starting Flutter Display..."
cd "$PROJECT_ROOT/display_app"

# Initialize macOS support if missing
if [ ! -d "macos" ]; then
    echo "🏗️ Initializing macOS desktop support..."
    flutter create --platforms=macos .
fi

flutter pub get
flutter run -d macos

# Cleanup on exit
trap "kill $BACKEND_PID $UI_PID" EXIT
