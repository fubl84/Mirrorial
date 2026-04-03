#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
DRY_RUN=false
NO_REBOOT=false
SKIP_ENGINE=false
SKIP_HEALTH_CHECK=false
REQUESTED_PROFILE="auto"

# shellcheck source=./lib/install_common.sh
source "$PROJECT_ROOT/scripts/lib/install_common.sh"
# shellcheck source=./lib/preflight.sh
source "$PROJECT_ROOT/scripts/lib/preflight.sh"

usage() {
  cat <<EOF
Mirrorial Linux installer

Usage:
  ./scripts/install_linux.sh [--dry-run] [--no-reboot] [--skip-engine] [--skip-health-check] [--profile PROFILE]

Options:
  --dry-run            Print the steps without executing them.
  --no-reboot          Do not reboot after a successful install.
  --skip-engine        Skip flutter-pi installation and reuse the current engine setup.
  --skip-health-check  Skip the final service verification step.
  --profile PROFILE    Force a detected install profile. Available: rpi-bookworm, rpi-trixie, generic-debian-drm.
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
    --profile)
      shift
      if [[ $# -eq 0 ]]; then
        echo "❌ Missing value for --profile" >&2
        exit 1
      fi
      REQUESTED_PROFILE="$1"
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

ACTUAL_USER=${SUDO_USER:-$(id -un)}
ACTUAL_HOME=$(resolve_user_home "$ACTUAL_USER")
LOG_DIR="$ACTUAL_HOME/.config/mirrorial/install-logs"
LOG_FILE="$LOG_DIR/linux-install-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "🚀 Starting Mirrorial Linux install..."
detect_install_host
print_host_report
echo "  Install user: $ACTUAL_USER"
echo "  Project root: $PROJECT_ROOT"
echo "  Log file: $LOG_FILE"
choose_install_profile "$REQUESTED_PROFILE"
print_selected_profile
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
