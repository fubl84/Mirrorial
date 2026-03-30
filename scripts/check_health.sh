#!/bin/bash

# Mirrorial - Health Check Script
set -euo pipefail

echo "🔍 Mirrorial Service Status Check"
echo "-----------------------------------"

if ! command -v systemctl >/dev/null 2>&1; then
    echo "❌ systemctl is not available on this host."
    exit 1
fi

check_service() {
    local unit="$1"
    local label="$2"
    local status
    status=$(systemctl is-active "$unit" 2>/dev/null || true)
    status=${status:-unknown}
    echo "$label: $status"
    if [ "$status" != "active" ]; then
        echo "⚠️ Recent logs for $unit:"
        sudo journalctl -u "$unit" -n 10 --no-pager || true
    fi
}

# 1. Check Backend
check_service mirror-backend.service "📦 Backend Service"

# 2. Check Display
check_service mirror-display.service "🎨 Display Service"

# 3. Check Port 3000
echo "📡 Checking port 3000..."
if command -v ss >/dev/null 2>&1 && sudo ss -tulpn | grep -q ":3000"; then
    echo "✅ Port 3000 is listening."
else
    echo "❌ Port 3000 is NOT listening."
fi

# 4. Check Avahi (mirror.local)
echo "📡 Checking mirror.local..."
if systemctl is-active avahi-daemon >/dev/null 2>&1; then
    echo "✅ Avahi-daemon is running."
else
    echo "❌ Avahi-daemon is NOT running."
fi

echo "-----------------------------------"
