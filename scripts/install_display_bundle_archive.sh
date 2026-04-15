#!/bin/bash

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 ARCHIVE DESTINATION SOURCE_LABEL" >&2
  exit 64
fi

ARCHIVE="$1"
DESTINATION="$2"
SOURCE_LABEL="$3"
BUNDLE_DIR="$DESTINATION/bundle"

install_tar_bundle() {
  local archive="$1"
  tar -xzf "$archive" -C "$DESTINATION"
}

install_zip_bundle() {
  local archive="$1"
  local work_dir=""
  local nested_tar=""
  local app_so=""
  local found_bundle=""

  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/mirrorial-prebuilt-bundle.XXXXXX")
  unzip -q "$archive" -d "$work_dir"

  nested_tar=$(find "$work_dir" -type f \( -name '*.tar.gz' -o -name '*.tgz' \) -print -quit)
  if [[ -n "$nested_tar" ]]; then
    tar -xzf "$nested_tar" -C "$DESTINATION"
    rm -rf "$work_dir"
    return 0
  fi

  if [[ -f "$work_dir/bundle/app.so" ]]; then
    cp -a "$work_dir/bundle" "$DESTINATION/"
    rm -rf "$work_dir"
    return 0
  fi

  app_so=$(find "$work_dir" -type f -name app.so -print -quit)
  if [[ -n "$app_so" ]]; then
    found_bundle=$(dirname "$app_so")
    mkdir -p "$BUNDLE_DIR"
    cp -a "$found_bundle/." "$BUNDLE_DIR/"
    rm -rf "$work_dir"
    return 0
  fi

  echo "❌ Zip display bundle does not contain a nested .tar.gz archive or bundle/app.so: $archive" >&2
  rm -rf "$work_dir"
  exit 1
}

case "$SOURCE_LABEL" in
  *.tar.gz|*.tgz)
    install_tar_bundle "$ARCHIVE"
    ;;
  *.zip)
    install_zip_bundle "$ARCHIVE"
    ;;
  *)
    if unzip -tq "$ARCHIVE" >/dev/null 2>&1; then
      install_zip_bundle "$ARCHIVE"
    elif tar -tzf "$ARCHIVE" >/dev/null 2>&1; then
      install_tar_bundle "$ARCHIVE"
    else
      echo "❌ Unsupported display bundle archive: $SOURCE_LABEL" >&2
      exit 1
    fi
    ;;
esac
