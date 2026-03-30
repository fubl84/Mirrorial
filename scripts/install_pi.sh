#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
DRY_RUN=false
NO_REBOOT=false
SKIP_ENGINE=false
SKIP_HEALTH_CHECK=false

usage() {
  cat <<EOF
Mirrorial Raspberry Pi installer

Usage:
  ./scripts/install_pi.sh [--dry-run] [--no-reboot] [--skip-engine] [--skip-health-check]

Options:
  --dry-run            Print the steps without executing them.
  --no-reboot          Do not reboot after a successful install.
  --skip-engine        Skip flutter-pi installation and reuse the current engine setup.
  --skip-health-check  Skip the final service verification step.
  --help               Show this message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      ;;
    --no-reboot)
      NO_REBOOT=true
      ;;
    --skip-engine)
      SKIP_ENGINE=true
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

resolve_user_home() {
  local username="$1"
  local resolved=""
  if command -v getent >/dev/null 2>&1; then
    resolved=$(getent passwd "$username" | cut -d: -f6 || true)
  fi
  if [[ -z "$resolved" ]]; then
    resolved=$(eval echo "~$username")
  fi
  echo "$resolved"
}

ACTUAL_USER=${SUDO_USER:-$(id -un)}
ACTUAL_HOME=$(resolve_user_home "$ACTUAL_USER")
LOG_DIR="$ACTUAL_HOME/.config/mirrorial/install-logs"
LOG_FILE="$LOG_DIR/pi-install-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

run_cmd() {
  echo "+ $*"
  if [[ "$DRY_RUN" == "false" ]]; then
    "$@"
  fi
}

run_user_shell() {
  local command="$1"
  echo "+ [${ACTUAL_USER}] $command"
  if [[ "$DRY_RUN" == "true" ]]; then
    return 0
  fi

  if [[ "$(id -un)" == "$ACTUAL_USER" ]]; then
    bash -lc "$command"
  else
    sudo -u "$ACTUAL_USER" -- bash -lc "$command"
  fi
}

require_supported_pi() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "❌ Mirrorial Pi install only supports Linux hosts."
    exit 1
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    echo "❌ apt-get is required. Use Raspberry Pi OS Bookworm 64-bit."
    exit 1
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "❌ systemd is required for Mirrorial v1 deployments."
    exit 1
  fi

  local model="Unknown"
  if [[ -r /proc/device-tree/model ]]; then
    model=$(tr -d '\0' </proc/device-tree/model)
  elif [[ -r /sys/firmware/devicetree/base/model ]]; then
    model=$(tr -d '\0' </sys/firmware/devicetree/base/model)
  fi

  local arch
  arch=$(dpkg --print-architecture 2>/dev/null || uname -m)
  local codename="${VERSION_CODENAME:-unknown}"

  if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    codename="${VERSION_CODENAME:-$codename}"
  fi

  echo "🔎 Preflight"
  echo "  Model: $model"
  echo "  Architecture: $arch"
  echo "  OS codename: $codename"
  echo "  Install user: $ACTUAL_USER"
  echo "  Project root: $PROJECT_ROOT"
  echo "  Log file: $LOG_FILE"

  case "$arch" in
    arm64|aarch64)
      ;;
    *)
      echo "❌ Mirrorial v1 officially supports Raspberry Pi OS Bookworm 64-bit."
      exit 1
      ;;
  esac

  case "$model" in
    *"Raspberry Pi Zero 2"*|*"Raspberry Pi 3"*|*"Raspberry Pi 4"*|*"Raspberry Pi 5"*|*"Raspberry Pi 400"*|*"Compute Module 4"*|*"Compute Module 5"*)
      ;;
    *)
      echo "❌ Unsupported Raspberry Pi model for Mirrorial v1: $model"
      echo "   Supported starting point: Pi Zero 2 W and newer."
      exit 1
      ;;
  esac

  if [[ "$codename" != "bookworm" ]]; then
    echo "❌ Unsupported OS codename: $codename"
    echo "   Use Raspberry Pi OS Bookworm 64-bit for Mirrorial v1."
    exit 1
  fi
}

ensure_sudo_access() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "ℹ️ Dry run: skipping sudo credential validation."
    return 0
  fi

  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi

  echo "🔐 Checking sudo access..."
  sudo -v
}

ensure_swap_if_needed() {
  local mem_total_kb
  mem_total_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  echo "🧠 Memory detected: $((mem_total_kb / 1024)) MB"

  if (( mem_total_kb < 900000 )); then
    echo "ℹ️ Low-memory device detected. Enabling temporary swap for the build."
    run_cmd "$PROJECT_ROOT/scripts/setup_swap.sh"
  fi
}

install_system_packages() {
  echo "📦 Installing OS dependencies..."
  run_cmd sudo apt-get update
  run_cmd sudo apt-get install -y \
    avahi-daemon \
    build-essential \
    ca-certificates \
    cmake \
    curl \
    git \
    libasound2-dev \
    libdrm-dev \
    libegl1-mesa-dev \
    libfontconfig1-dev \
    libgbm-dev \
    libgles2-mesa-dev \
    libinput-dev \
    libsystemd-dev \
    libudev-dev \
    libx11-6 \
    libx11-dev \
    libxext-dev \
    libxkbcommon-dev \
    nodejs \
    npm \
    pkg-config \
    unzip \
    xz-utils
  run_cmd sudo systemctl enable avahi-daemon
  run_cmd sudo systemctl restart avahi-daemon
}

bootstrap_config() {
  if [[ -f "$PROJECT_ROOT/config.json" ]]; then
    echo "ℹ️ config.json already exists. Leaving it in place."
    return 0
  fi

  echo "📝 Bootstrapping config.json from example."
  run_user_shell "cp \"$PROJECT_ROOT/configs/config.json.example\" \"$PROJECT_ROOT/config.json\""
}

install_node_dependencies() {
  echo "📦 Installing backend dependencies..."
  run_user_shell "cd \"$PROJECT_ROOT/backend\" && npm install"

  echo "📦 Installing remote UI dependencies..."
  run_user_shell "cd \"$PROJECT_ROOT/remote_ui\" && npm install && npm run build"
}

install_engine_and_bundle() {
  if [[ "$SKIP_ENGINE" == "true" ]]; then
    echo "ℹ️ Skipping flutter-pi installation by request."
  else
    echo "🎨 Installing flutter-pi..."
    run_cmd "$PROJECT_ROOT/scripts/install_engine.sh"
  fi

  echo "🏗️ Building display bundle..."
  run_user_shell "cd \"$PROJECT_ROOT\" && MIRRORIAL_SKIP_RESTART=1 \"$PROJECT_ROOT/scripts/build_display.sh\""
}

register_services() {
  echo "🔧 Registering Mirrorial services..."
  run_cmd env SERVICE_USER="$ACTUAL_USER" PROJECT_ROOT_OVERRIDE="$PROJECT_ROOT" "$PROJECT_ROOT/scripts/register_services.sh"
}

run_health_check() {
  if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
    echo "ℹ️ Skipping final health check by request."
    return 0
  fi

  echo "🩺 Running service health check..."
  run_cmd "$PROJECT_ROOT/scripts/check_health.sh"
}

maybe_reboot() {
  if [[ "$NO_REBOOT" == "true" ]]; then
    echo "ℹ️ Install finished without reboot because --no-reboot was set."
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "ℹ️ Dry run complete. No reboot executed."
    return 0
  fi

  echo "🔄 Installation finished. Rebooting now..."
  sudo systemctl reboot
}

echo "🚀 Starting Mirrorial Raspberry Pi install..."
require_supported_pi
ensure_sudo_access
ensure_swap_if_needed
install_system_packages
bootstrap_config
install_node_dependencies
install_engine_and_bundle
register_services
run_health_check
echo "✅ Mirrorial install finished successfully."
maybe_reboot
