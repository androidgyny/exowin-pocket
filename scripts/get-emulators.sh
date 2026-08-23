#!/usr/bin/env bash
# get-emulators.sh — DEV-ONLY: download the Win9x emulators (DOSBox-X, 86Box)
# for the current platform into src-tauri/resources/.
#
# Release builds do NOT bundle these anymore - users get them as content
# packs (see content-packs.yml / build-emulator-packs.sh). This script keeps
# a dev machine launching Win9x games without installing the packs: the
# resolvers probe src-tauri/resources/ in debug builds (resource_candidate's
# CARGO_MANIFEST_DIR fallback).
#
# eXoWin9x games boot Windows 95/98: DOSBox-X runs the x98-variant games
# (Staging cannot boot Win9x guests), 86Box runs the 86box-variant handful.
# WINDOWS DOWNLOADS NOTHING: eXo's EXTWin9x.zip carries Windows builds of both
# emulators next to the parent VHDs, and no game launches without those VHDs,
# so a bundled Windows build could never run. DOSBox-X publishes NO Linux
# binaries (Flatpak/distro only), so Linux resolves it from the pack, PATH or
# Flatpak at runtime and only gets 86Box here.
#
# Usage:
#   pnpm run get-emulators                 # download for current platform
#   pnpm run get-emulators -- --force      # re-download
#   DOSBOX_X_VERSION=2025.02.01 E86BOX_VERSION=6.0 pnpm run get-emulators
set -euo pipefail

FORCE=0
for arg in "$@"; do
  [[ "$arg" == "--force" ]] && FORCE=1
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RES_DIR="$REPO_ROOT/src-tauri/resources"

# Pinned near eXo's own x98 build (exes dated 2025-02-01) - a drifting
# DOSBox-X may change conf-key behavior under the pack's play.confs.
DOSBOX_X_VERSION="${DOSBOX_X_VERSION:-2025.02.01}"
E86BOX_VERSION="${E86BOX_VERSION:-6.0}"

OS="$(uname -s)"
ARCH="$(uname -m)"

mkdir -p "$RES_DIR/dosbox-x" "$RES_DIR/86box"

STAMP="$RES_DIR/.win9x-emulators-version"
WANT_STAMP="dosbox-x=$DOSBOX_X_VERSION 86box=$E86BOX_VERSION os=$OS"
if [[ "$FORCE" -eq 0 && "$(cat "$STAMP" 2>/dev/null || true)" == "$WANT_STAMP" ]]; then
  echo "Win9x emulators already present ($WANT_STAMP), skipping."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fetch() { # fetch <url> <out>
  echo "Downloading $(basename "$2")..."
  # Retries with resume: these downloads share bandwidth with torrent
  # traffic and HTTP/2 streams were observed dying mid-transfer.
  curl -fL --progress-bar --retry 5 --retry-delay 3 --retry-all-errors \
    -C - -o "$2" "$1"
}

gh_api() { # gh_api <url>
  # The unauthenticated API allowance is per source IP and CI runners share
  # theirs, so an asset lookup that works locally can be rate-limited there.
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" "$1"
  else
    curl -fsSL "$1"
  fi
}

# ── DOSBox-X ─────────────────────────────────────────────────────────────────

dbx_url() { # dbx_url <grep-pattern>
  # Release assets embed a build timestamp
  # (dosbox-x-macosx-arm64-20250201150724.zip), so resolve them from the
  # release's asset list instead of hardcoding. macOS is the only consumer,
  # hence the lookup lives here rather than at the top.
  local api="https://api.github.com/repos/joncampbell123/dosbox-x/releases/tags/dosbox-x-v${DOSBOX_X_VERSION}"
  gh_api "$api" | grep -o 'https://[^"]*download/[^"]*' | grep -E "$1" | head -1
}

case "$OS" in
  Darwin)
    # No presence short-circuit here: the stamp check above already handles
    # "same versions, skip" - a directory check on top of it kept a STALE
    # dosbox-x.app in place after a DOSBOX_X_VERSION bump.
    case "$ARCH" in
      arm64)  DBX_URL="$(dbx_url 'macosx-arm64-[^"]*\.zip')" ;;
      x86_64) DBX_URL="$(dbx_url 'macosx-x86_64-[^"]*\.zip')" ;;
      *) echo "Unsupported macOS arch: $ARCH"; exit 1 ;;
    esac
    [[ -z "$DBX_URL" ]] && { echo "ERROR: no DOSBox-X macOS asset for v${DOSBOX_X_VERSION}"; exit 1; }
    fetch "$DBX_URL" "$TMP_DIR/dosbox-x-mac.zip"
    unzip -q "$TMP_DIR/dosbox-x-mac.zip" -d "$TMP_DIR/dbx"
    APP_SRC="$(find "$TMP_DIR/dbx" -type d -name "dosbox-x.app" | head -1)"
    if [[ -z "$APP_SRC" ]]; then
      echo "ERROR: dosbox-x.app not found in $DBX_URL"; exit 1
    fi
    rm -rf "$RES_DIR/dosbox-x/dosbox-x.app"
    mkdir -p "$RES_DIR/dosbox-x"
    cp -R "$APP_SRC" "$RES_DIR/dosbox-x/dosbox-x.app"
    rm -f "$RES_DIR/dosbox-x/.placeholder"
    xattr -cr "$RES_DIR/dosbox-x/dosbox-x.app" 2>/dev/null || true
    codesign --force --deep --sign - "$RES_DIR/dosbox-x/dosbox-x.app"
    echo "Installed: $RES_DIR/dosbox-x/dosbox-x.app"
    ;;
  Linux)
    echo "DOSBox-X: no official Linux binaries - resolved from PATH/Flatpak at runtime."
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "DOSBox-X: Windows uses eXo's own x98 build from EXTWin9x.zip - nothing to download."
    ;;
esac

# ── 86Box ────────────────────────────────────────────────────────────────────

pick_url() { # pick_url <grep-pattern>
  # Asset names embed a build number (e.g. 86Box-Linux-x86_64-b9001.AppImage),
  # so resolve them from the release's asset list instead of hardcoding.
  local api="https://api.github.com/repos/86Box/86Box/releases/tags/v${E86BOX_VERSION}"
  gh_api "$api" | grep -o 'https://[^"]*download/[^"]*' | grep -E "$1" | head -1
}

case "$OS" in
  Darwin)
    URL="$(pick_url '86Box-macOS-[^"]*\.zip')"
    [[ -z "$URL" ]] && { echo "ERROR: no 86Box macOS asset"; exit 1; }
    fetch "$URL" "$TMP_DIR/86box-mac.zip"
    unzip -q "$TMP_DIR/86box-mac.zip" -d "$TMP_DIR/e86"
    APP_SRC="$(find "$TMP_DIR/e86" -type d -name "86Box.app" | head -1)"
    [[ -z "$APP_SRC" ]] && { echo "ERROR: 86Box.app not found"; exit 1; }
    rm -rf "$RES_DIR/86box/86Box.app"
    mkdir -p "$RES_DIR/86box"
    cp -R "$APP_SRC" "$RES_DIR/86box/86Box.app"
    rm -f "$RES_DIR/86box/.placeholder"
    xattr -cr "$RES_DIR/86box/86Box.app" 2>/dev/null || true
    codesign --force --deep --sign - "$RES_DIR/86box/86Box.app"
    echo "Installed: $RES_DIR/86box/86Box.app"
    ;;
  Linux)
    case "$ARCH" in
      x86_64)  URL="$(pick_url '86Box-Linux-x86_64[^"]*\.AppImage')" ;;
      aarch64) URL="$(pick_url '86Box[^"]*Linux-arm64[^"]*\.AppImage')" ;;
      *) echo "Unsupported Linux arch: $ARCH"; exit 1 ;;
    esac
    [[ -z "$URL" ]] && { echo "ERROR: no 86Box Linux asset"; exit 1; }
    mkdir -p "$RES_DIR/86box"
    fetch "$URL" "$RES_DIR/86box/86Box.AppImage"
    chmod +x "$RES_DIR/86box/86Box.AppImage"
    rm -f "$RES_DIR/86box/.placeholder"
    echo "Installed: $RES_DIR/86box/86Box.AppImage"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "86Box: Windows uses eXo's own build from EXTWin9x.zip - nothing to download."
    ;;
esac

echo "$WANT_STAMP" > "$STAMP"
echo "Win9x emulators ready."
