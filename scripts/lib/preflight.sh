#!/bin/bash

set -euo pipefail

HOST_KERNEL=""
HOST_ARCH=""
HOST_MACHINE=""
HOST_CODENAME="unknown"
HOST_OS_ID="unknown"
HOST_OS_LIKE=""
HOST_MODEL="Unknown"
HOST_HAS_APT="false"
HOST_HAS_SYSTEMD="false"
HOST_HAS_DRM="false"
HOST_IS_PI="false"
HOST_IS_DEBIAN_LIKE="false"

SELECTED_PROFILE_ID=""
SELECTED_PROFILE_LABEL=""
SELECTED_PROFILE_TIER=""
SELECTED_PROFILE_SUMMARY=""
SELECTED_PROFILE_NOTES=""
SELECTED_PROFILE_EXPERIMENTAL="false"

detect_install_host() {
  HOST_KERNEL=$(uname -s)
  HOST_ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
  HOST_MACHINE=$(uname -m)
  HOST_HAS_APT=$([[ -x "$(command -v apt-get 2>/dev/null)" ]] && echo "true" || echo "false")
  HOST_HAS_SYSTEMD=$([[ -x "$(command -v systemctl 2>/dev/null)" ]] && echo "true" || echo "false")

  if [[ -e /dev/dri/card0 || -d /sys/class/drm ]]; then
    HOST_HAS_DRM="true"
  fi

  if [[ -r /etc/os-release ]]; then
    . /etc/os-release
    HOST_CODENAME="${VERSION_CODENAME:-$HOST_CODENAME}"
    HOST_OS_ID="${ID:-$HOST_OS_ID}"
    HOST_OS_LIKE="${ID_LIKE:-$HOST_OS_LIKE}"
  fi

  if [[ -r /proc/device-tree/model ]]; then
    HOST_MODEL=$(tr -d '\0' </proc/device-tree/model)
  elif [[ -r /sys/firmware/devicetree/base/model ]]; then
    HOST_MODEL=$(tr -d '\0' </sys/firmware/devicetree/base/model)
  fi

  if [[ "$HOST_MODEL" == *"Raspberry Pi"* ]]; then
    HOST_IS_PI="true"
  fi

  case " $HOST_OS_ID $HOST_OS_LIKE " in
    *" debian "*|*" raspbian "*|*" ubuntu "*)
      HOST_IS_DEBIAN_LIKE="true"
      ;;
  esac
}

profile_exists() {
  case "$1" in
    rpi-bookworm|rpi-trixie|generic-debian-drm)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

load_profile() {
  local profile_id="$1"
  case "$profile_id" in
    rpi-bookworm)
      SELECTED_PROFILE_ID="rpi-bookworm"
      SELECTED_PROFILE_LABEL="Raspberry Pi OS Bookworm 64-bit"
      SELECTED_PROFILE_TIER="supported"
      SELECTED_PROFILE_SUMMARY="Official Raspberry Pi deployment path for Mirrorial v1."
      SELECTED_PROFILE_NOTES="Targets Raspberry Pi Zero 2 W and newer on Bookworm 64-bit."
      SELECTED_PROFILE_EXPERIMENTAL="false"
      ;;
    rpi-trixie)
      SELECTED_PROFILE_ID="rpi-trixie"
      SELECTED_PROFILE_LABEL="Raspberry Pi OS Trixie 64-bit"
      SELECTED_PROFILE_TIER="experimental"
      SELECTED_PROFILE_SUMMARY="Current Raspberry Pi OS path using the same install flow as Bookworm."
      SELECTED_PROFILE_NOTES="Proceed with real-device validation because package and graphics behavior may differ from Bookworm."
      SELECTED_PROFILE_EXPERIMENTAL="true"
      ;;
    generic-debian-drm)
      SELECTED_PROFILE_ID="generic-debian-drm"
      SELECTED_PROFILE_LABEL="Generic Debian-family Linux with DRM/KMS"
      SELECTED_PROFILE_TIER="experimental"
      SELECTED_PROFILE_SUMMARY="Best-effort install path for other Linux boards with direct-rendered graphics."
      SELECTED_PROFILE_NOTES="Requires apt, systemd, DRM/KMS access, and a host where flutter-pi can run."
      SELECTED_PROFILE_EXPERIMENTAL="true"
      ;;
    *)
      echo "❌ Unknown install profile: $profile_id" >&2
      return 1
      ;;
  esac
}

profile_matches_host() {
  local profile_id="$1"

  case "$profile_id" in
    rpi-bookworm)
      [[ "$HOST_KERNEL" == "Linux" ]] \
        && [[ "$HOST_HAS_APT" == "true" ]] \
        && [[ "$HOST_HAS_SYSTEMD" == "true" ]] \
        && [[ "$HOST_IS_PI" == "true" ]] \
        && [[ "$HOST_ARCH" =~ ^(arm64|aarch64)$ ]] \
        && [[ "$HOST_CODENAME" == "bookworm" ]]
      ;;
    rpi-trixie)
      [[ "$HOST_KERNEL" == "Linux" ]] \
        && [[ "$HOST_HAS_APT" == "true" ]] \
        && [[ "$HOST_HAS_SYSTEMD" == "true" ]] \
        && [[ "$HOST_IS_PI" == "true" ]] \
        && [[ "$HOST_ARCH" =~ ^(arm64|aarch64)$ ]] \
        && [[ "$HOST_CODENAME" == "trixie" ]]
      ;;
    generic-debian-drm)
      [[ "$HOST_KERNEL" == "Linux" ]] \
        && [[ "$HOST_HAS_APT" == "true" ]] \
        && [[ "$HOST_HAS_SYSTEMD" == "true" ]] \
        && [[ "$HOST_HAS_DRM" == "true" ]] \
        && [[ "$HOST_IS_DEBIAN_LIKE" == "true" ]] \
        && [[ "$HOST_ARCH" =~ ^(arm64|aarch64|amd64|x86_64)$ ]]
      ;;
    *)
      return 1
      ;;
  esac
}

choose_install_profile() {
  local requested_profile="${1:-auto}"

  if [[ "$requested_profile" != "auto" ]]; then
    if ! profile_exists "$requested_profile"; then
      echo "❌ Unknown profile: $requested_profile" >&2
      echo "   Available profiles: rpi-bookworm, rpi-trixie, generic-debian-drm" >&2
      exit 1
    fi

    if ! profile_matches_host "$requested_profile"; then
      echo "❌ Requested profile '$requested_profile' does not match this host." >&2
      print_host_report >&2
      exit 1
    fi

    load_profile "$requested_profile"
    return 0
  fi

  local candidate
  for candidate in rpi-bookworm rpi-trixie generic-debian-drm; do
    if profile_matches_host "$candidate"; then
      load_profile "$candidate"
      return 0
    fi
  done

  echo "❌ No supported install profile matched this host." >&2
  echo "   Mirrorial currently supports:" >&2
  echo "   - Raspberry Pi OS Bookworm 64-bit on Raspberry Pi Zero 2 W and newer" >&2
  echo "   - Experimental Raspberry Pi OS Trixie 64-bit on Raspberry Pi devices" >&2
  echo "   - Experimental Debian-family Linux boards with apt, systemd, DRM/KMS, and arm64/amd64" >&2
  print_host_report >&2
  exit 1
}

print_host_report() {
  cat <<EOF
🔎 Preflight
  Model: $HOST_MODEL
  Architecture: $HOST_ARCH
  Machine: $HOST_MACHINE
  OS ID: $HOST_OS_ID
  OS codename: $HOST_CODENAME
  Debian-like: $HOST_IS_DEBIAN_LIKE
  apt-get: $HOST_HAS_APT
  systemd: $HOST_HAS_SYSTEMD
  DRM/KMS: $HOST_HAS_DRM
  Raspberry Pi: $HOST_IS_PI
EOF
}

print_selected_profile() {
  cat <<EOF
🧭 Selected install profile
  ID: $SELECTED_PROFILE_ID
  Label: $SELECTED_PROFILE_LABEL
  Support tier: $SELECTED_PROFILE_TIER
  Summary: $SELECTED_PROFILE_SUMMARY
  Notes: $SELECTED_PROFILE_NOTES
EOF

  if [[ "$SELECTED_PROFILE_EXPERIMENTAL" == "true" ]]; then
    echo "⚠️ Experimental profile selected. Validate on the target device before treating it as production-ready."
  fi
}
