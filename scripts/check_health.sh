#!/bin/bash

# Mirrorial - Health Check Script
echo "🔍 Mirrorial Service Status Check"
echo "-----------------------------------"

# 1. Check Backend
BACKEND_STATUS=$(systemctl is-active mirror-backend)
echo "📦 Backend Service: $BACKEND_STATUS"
if [ "$BACKEND_STATUS" != "active" ]; then
    echo "⚠️ Backend Logs:"
    sudo journalctl -u mirror-backend -n 10 --no-pager
fi

# 2. Check Display
DISPLAY_STATUS=$(systemctl is-active mirror-display)
echo "🎨 Display Service: $DISPLAY_STATUS"
if [ "$DISPLAY_STATUS" != "active" ]; then
    echo "⚠️ Display Logs:"
    sudo journalctl -u mirror-display -n 10 --no-pager
fi

# 3. Check Port 3000
echo "📡 Checking port 3000..."
if sudo ss -tulpn | grep -q ":3000"; then
    echo "✅ Port 3000 is listening."
else
    echo "❌ Port 3000 is NOT listening."
fi

# 4. Check Avahi (mirror.local)
echo "📡 Checking mirror.local..."
if systemctl is-active avahi-daemon > /dev/null; then
    echo "✅ Avahi-daemon is running."
else
    echo "❌ Avahi-daemon is NOT running."
fi

echo "-----------------------------------"
