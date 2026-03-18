#!/bin/bash

# Mirrorial - Swap Configuration Script
# Pi Zero 2W needs more than 512MB RAM for npm build / cmake
set -e

SWAP_FILE="/var/mirrorial_swap"

if [ -f "$SWAP_FILE" ]; then
    echo "✅ Swap file already exists."
    exit 0
fi

echo "🧠 Setting up 1GB temporary swap file for build process..."
sudo fallocate -l 1G "$SWAP_FILE"
sudo chmod 600 "$SWAP_FILE"
sudo mkswap "$SWAP_FILE"
sudo swapon "$SWAP_FILE"

echo "✅ Swap enabled. Memory headroom increased."
echo "Note: You can run 'sudo swapoff $SWAP_FILE' after installation."
