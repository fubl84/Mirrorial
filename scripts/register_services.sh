#!/bin/bash

# Mirrorial - Service Registration Script
set -euo pipefail

# Detect absolute path of the project root
PROJECT_ROOT=${PROJECT_ROOT_OVERRIDE:-$(cd "$(dirname "$0")/.." && pwd)}
# Detect the actual user who invoked sudo (if applicable)
ACTUAL_USER=${SERVICE_USER:-${SUDO_USER:-$(whoami)}}
# Detect node path
NODE_PATH=$(command -v node)
USER_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

if [ -z "$USER_HOME" ]; then
    echo "❌ Error: Could not resolve the home directory for $ACTUAL_USER."
    exit 1
fi

if [ -z "$NODE_PATH" ]; then
    echo "❌ Error: 'node' not found in PATH."
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "❌ Error: systemd is required to register Mirrorial services."
    exit 1
fi

echo "🔧 Registering services for user: $ACTUAL_USER"
echo "📂 Project root: $PROJECT_ROOT"
echo "📦 Node path: $NODE_PATH"

# 1. Register Backend Service
echo "📝 Creating mirror-backend.service..."
sudo tee /etc/systemd/system/mirror-backend.service > /dev/null <<EOF
[Unit]
Description=Mirrorial Backend Service
After=network.target

[Service]
ExecStart=$NODE_PATH $PROJECT_ROOT/backend/index.js
WorkingDirectory=$PROJECT_ROOT/backend
Restart=always
User=$ACTUAL_USER
Environment=HOME=$USER_HOME
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# 2. Register Display Service
echo "📝 Creating mirror-display.service..."
sudo tee /etc/systemd/system/mirror-display.service > /dev/null <<EOF
[Unit]
Description=Mirrorial Flutter Display
After=mirror-backend.service

[Service]
ExecStart=/opt/flutter-pi/flutter-pi --release $PROJECT_ROOT/display_app/bundle
Restart=always
User=$ACTUAL_USER
WorkingDirectory=$PROJECT_ROOT
Environment=HOME=$USER_HOME
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

# 3. Enable and Start
echo "🔄 Reloading systemd and starting services..."
sudo systemctl daemon-reload
sudo systemctl enable mirror-backend.service
sudo systemctl enable mirror-display.service
sudo systemctl restart mirror-backend.service
sudo systemctl restart mirror-display.service

echo "✅ Services registered and started!"
