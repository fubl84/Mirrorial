#!/bin/bash

# Mirrorial - Dependency Installation Script
set -e

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo "📦 Installing Backend dependencies..."
cd "$PROJECT_ROOT/backend"
npm install

echo "📦 Installing Remote UI dependencies..."
cd "$PROJECT_ROOT/remote_ui"
npm install

echo "🏗️ Building Remote UI..."
npm run build

echo "✅ Node.js dependencies installed and Remote UI built."
