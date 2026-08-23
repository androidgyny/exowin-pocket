#!/bin/sh
# build-dosbox-x-appimage.sh — Build DOSBox-X from a PINNED tag and package it
# as an "anylinux" AppImage (works on old and musl-based distros, no FUSE).
#
# Upstream publishes NO Linux binaries at all, so this is the only way Linux
# users get the same 2025.02.01 build the pack's play.confs were authored
# against (a drifting DOSBox-X may change conf-key behavior - same reason
# get-emulators.sh pins the macOS build).
#
# Runs inside ghcr.io/pkgforge-dev/archlinux:latest prepared by
# pkgforge-dev/anylinux-setup-action, which provides quick-sharun (sharun +
# uruntime packaging). Recipe adapted from pkgforge-dev/DOSBox-X-AppImage
# (MIT) with two deliberate differences: we compile the pinned tag from
# source instead of packaging Arch's current dosbox-x-sdl2, and we ship NO
# self-updater hook - the pack is versioned by Exodium's content-pack
# machinery, and an emulator that updates itself out from under the pinned
# confs is exactly what the pin exists to prevent.
#
# Outputs into ./dist:
#   DOSBox-X.AppImage                    the emulator (stable name - the
#                                        resolver probes for exactly this)
#   dosbox-x-<version>-source.tar.gz     GPL source correspondence
set -eu

VERSION="${DOSBOX_X_VERSION:-2025.02.01}"
ARCH="$(uname -m)"

echo "Installing build dependencies..."
pacman -Syu --noconfirm \
    base-devel git autoconf automake \
    sdl2 sdl2_net fluidsynth libslirp libpcap \
    alsa-lib libxtst libxrandr libxkbfile mesa glu libdecor
# Smaller replacements for the heavyweight common deps (mesa etc.), same as
# every Anylinux recipe.
get-debloated-pkgs --add-common --prefer-nano

echo "Building DOSBox-X v${VERSION} from source (SDL2)..."
git clone --depth 1 --branch "dosbox-x-v${VERSION}" \
    https://github.com/joncampbell123/dosbox-x.git
mkdir -p ./dist
# GPL source correspondence for the binary we are about to ship: the exact
# tree that got compiled, attached to the same content release.
git -C dosbox-x archive --format=tar.gz --prefix="dosbox-x-${VERSION}/" \
    -o "$(pwd)/dist/dosbox-x-${VERSION}-source.tar.gz" HEAD

cd dosbox-x
# build-sdl2 forwards extra args to ./configure; /usr keeps the icon/desktop
# paths where the packaging step expects them.
./build-sdl2 --prefix=/usr
make install
cd ..

# Where make install actually landed things (prefix fallback, just in case).
DOSBOX_BIN="$(command -v dosbox-x)"
ICON="$(ls /usr/share/icons/hicolor/scalable/apps/dosbox-x.svg \
          /usr/local/share/icons/hicolor/scalable/apps/dosbox-x.svg \
          ./dosbox-x/contrib/icons/dosbox-x.svg 2>/dev/null | head -1)"
DESKTOP="$(ls /usr/share/applications/*dosbox-x*.desktop \
              /usr/local/share/applications/*dosbox-x*.desktop \
              /usr/share/applications/com.dosbox_x.DOSBox-X.desktop 2>/dev/null | head -1)"

export ARCH VERSION ICON DESKTOP
export OUTPATH=./dist
export DEPLOY_OPENGL=1
export DEPLOY_PULSE=1

echo "Packaging with quick-sharun..."
quick-sharun "$DOSBOX_BIN" /usr/lib/libfluidsynth.so* /usr/lib/libXtst.so*
echo 'ANYLINUX_DO_NOT_LOAD_LIBS=libpipewire-0.3.so*:${ANYLINUX_DO_NOT_LOAD_LIBS}' >> ./AppDir/.env

# Hard gate: 67 network-parent games boot their guest network through slirp
# (and pcap multiplayer needs libpcap). A build that silently lost either
# would ship a broken network stack and nobody would notice until a game
# dial fails.
for lib in libslirp libpcap; do
    if ! find ./AppDir -name "${lib}.so*" | grep -q .; then
        echo "ERROR: ${lib} missing from the AppDir - the build lost network support."
        exit 1
    fi
done

quick-sharun --make-appimage
quick-sharun --test ./dist/*.AppImage

# Stable name: resolve_dosbox_x probes content/emulators/dosbox-x/DOSBox-X.AppImage.
for f in ./dist/*.AppImage; do
    mv "$f" ./dist/DOSBox-X.AppImage
    break
done
rm -f ./dist/*.zsync
chmod +x ./dist/DOSBox-X.AppImage

echo "Done:"
ls -la ./dist
