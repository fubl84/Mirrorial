#!/bin/bash

# Mirrorial - Mac Development Runner
# ---------------------------------
# This script starts all components for local development.

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo "🍏 Starting Mirrorial Development Environment on Mac..."

# 1. Start Backend (in background)
echo "📦 Starting Backend API..."
cd "$PROJECT_ROOT/backend"
npm install
node index.js &
BACKEND_PID=$!
sleep 2

# 2. Start Remote UI (in background)
echo "🌐 Starting Remote UI Dev Server (Vite)..."
cd "$PROJECT_ROOT/remote_ui"
npm install
npm run dev &
UI_PID=$!

echo "-------------------------------------------------------"
echo "🚀 Mirrorial Dev Environment Ready!"
echo "📡 Backend API: http://localhost:3000/api"
echo "🛠  Config UI:  http://localhost:5173"
echo "-------------------------------------------------------"

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
