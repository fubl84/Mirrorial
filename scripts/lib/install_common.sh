#!/bin/bash

set -euo pipefail

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

run_repo_script() {
  local script_path="$1"
  shift || true
  run_cmd bash "$script_path" "$@"
}

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
    run_repo_script "$PROJECT_ROOT/scripts/setup_swap.sh"
  fi
}

install_system_packages() {
  echo "📦 Installing OS dependencies..."
  run_cmd sudo apt-get update
  run_cmd sudo apt-get install -y \
    avahi-daemon \
    build-essential \
    ca-certificates \
    clang \
    cmake \
    curl \
    git \
    lld \
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
    run_repo_script "$PROJECT_ROOT/scripts/install_engine.sh"
  fi

  echo "🏗️ Building display bundle..."
  run_user_shell "cd \"$PROJECT_ROOT\" && MIRRORIAL_SKIP_RESTART=1 bash \"$PROJECT_ROOT/scripts/build_display.sh\""
}

register_services() {
  echo "🔧 Registering Mirrorial services..."
  run_cmd env SERVICE_USER="$ACTUAL_USER" PROJECT_ROOT_OVERRIDE="$PROJECT_ROOT" bash "$PROJECT_ROOT/scripts/register_services.sh"
}

run_health_check() {
  if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
    echo "ℹ️ Skipping final health check by request."
    return 0
  fi

  echo "🩺 Running service health check..."
  run_repo_script "$PROJECT_ROOT/scripts/check_health.sh"
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
