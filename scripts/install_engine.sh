#!/bin/bash

# Mirrorial - Flutter-Pi Engine Installation Script
set -e

echo "🎨 Installing and Building Flutter-Pi Engine..."

# 1. Install Build Dependencies
echo "📦 Installing build dependencies..."
sudo apt-get update
sudo apt-get install -y \
    cmake libsystemd-dev libinput-dev libudev-dev \
    libgbm-dev libdrm-dev libgles2-mesa-dev libegl1-mesa-dev \
    libasound2-dev libx11-dev libxext-dev

# 2. Clone and Build
echo "🏗️ Cloning and Building Flutter-Pi (this may take a few minutes)..."
BUILD_DIR="/tmp/flutter-pi-build"
rm -rf "$BUILD_DIR"
git clone https://github.com/ardera/flutter-pi.git "$BUILD_DIR"
cd "$BUILD_DIR"
mkdir build && cd build
cmake ..
make -j$(nproc)

# 3. Install
echo "🚀 Installing Flutter-Pi to /usr/local/bin..."
sudo make install

# Create a symlink to /opt/flutter-pi/flutter-pi for compatibility
sudo mkdir -p /opt/flutter-pi
sudo ln -sf /usr/local/bin/flutter-pi /opt/flutter-pi/flutter-pi

echo "✅ Flutter-Pi Engine installed successfully!"
