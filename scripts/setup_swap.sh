#!/bin/bash

# Mirrorial - Swap Configuration Script
# Pi Zero 2W class devices need extra headroom for Flutter/bootstrap builds
set -euo pipefail

SWAP_FILE="/var/mirrorial_swap"
SWAP_SIZE_MB="${MIRRORIAL_SWAP_SIZE_MB:-2048}"

if ! [[ "$SWAP_SIZE_MB" =~ ^[0-9]+$ ]] || (( SWAP_SIZE_MB < 1024 )); then
    echo "❌ MIRRORIAL_SWAP_SIZE_MB must be an integer >= 1024." >&2
    exit 1
fi

if [ -f "$SWAP_FILE" ]; then
    echo "✅ Swap file already exists at $SWAP_FILE."
    if ! swapon --show=NAME | grep -qx "$SWAP_FILE"; then
        echo "ℹ️ Enabling existing swap file..."
        sudo swapon "$SWAP_FILE"
    fi
    exit 0
fi

echo "🧠 Setting up ${SWAP_SIZE_MB}MB temporary swap file for build process..."
sudo fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE"
sudo chmod 600 "$SWAP_FILE"
sudo mkswap "$SWAP_FILE"
sudo swapon "$SWAP_FILE"

echo "✅ Swap enabled. Memory headroom increased."
echo "Note: You can run 'sudo swapoff $SWAP_FILE' after installation."
