#!/bin/bash

# Mirrorial - One-Command Setup Script
set -e

echo "🚀 Starting Mirrorial Setup..."

# 1. Update & Install System Dependencies
echo "📦 Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    libgbm-dev libdrm-dev libegl-dev libgles-dev \
    libasound2-dev libsystemd-dev libinput-dev \
    libvulkan-dev libx11-6 \
    avahi-daemon curl git nodejs npm

# 2. Configure Avahi for mirror.local
echo "📡 Configuring mirror.local..."
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon

# 3. Setup Flutter-Pi
echo "🎨 Setting up Flutter-Pi (Native Engine)..."
# In a real scenario, we might download a pre-built binary for Pi Zero 2W
# For now, we clone and provide instructions or a build step.
if [ ! -d "/opt/flutter-pi" ]; then
    sudo git clone https://github.com/ardera/flutter-pi.git /opt/flutter-pi
    # Build instructions would go here if not using binary
fi

# 4. Backend Setup
echo "⚙️ Setting up Mirrorial Backend..."
cd backend
npm install
cd ..

# 5. Remote UI Setup
echo "🌐 Setting up Remote UI..."
cd remote_ui
npm install
npm run build
cd ..

# 6. Initialize Config
if [ ! -f "config.json" ]; then
    cp configs/config.json.example config.json
    echo "📄 Initialized config.json from example."
fi

# 7. Systemd Service Registration
echo "🔄 Registering system services..."
# (Template for mirror-backend.service)
sudo tee /etc/systemd/system/mirror-backend.service > /dev/null <<EOF
[Unit]
Description=Mirrorial Backend Service
After=network.target

[Service]
ExecStart=/usr/bin/node /home/$(whoami)/Mirrorial/backend/index.js
WorkingDirectory=/home/$(whoami)/Mirrorial/backend
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# (Template for mirror-display.service)
sudo tee /etc/systemd/system/mirror-display.service > /dev/null <<EOF
[Unit]
Description=Mirrorial Flutter Display
After=mirror-backend.service

[Service]
ExecStart=/opt/flutter-pi/flutter-pi --release /home/$(whoami)/Mirrorial/display_app/bundle
Restart=always
User=$(whoami)
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mirror-backend
sudo systemctl enable mirror-display

echo "✅ Mirrorial Setup Complete! Reboot your Pi to start the mirror."
