#!/usr/bin/env python3
"""Generate the "Which file do I need?" header for a GitHub release body.

Usage: gen_release_body.py <artifacts_dir> <tag> <owner/repo>

Scans the artifacts directory for installer bundles and emits a Markdown
table mapping each platform to its download, followed by platform notes.
The build workflow passes this as the release body; GitHub appends its
auto-generated changelog notes after it.

Exits non-zero if any of the three primary installers (.exe, .dmg,
.AppImage) is missing, so a broken matrix build can't publish a release
with a hole in the download table.
"""

import sys
from pathlib import Path

PRIMARY = [
    # (glob, platform label, extra note)
    ("*-setup.exe", "**Windows**", "Installer; auto-updates from here on"),
    ("*.dmg", "**macOS** (Apple Silicon)", "See unsigned-app note below"),
    ("*.AppImage", "**Linux** (any distro)", "`chmod +x` then run; auto-updates"),
]

SECONDARY = [
    ("*.deb", "Linux (Debian/Ubuntu package)", "No auto-update - prefer the AppImage"),
    ("*.rpm", "Linux (Fedora/openSUSE package)", "No auto-update - prefer the AppImage"),
]


def find(root: Path, pattern: str) -> str | None:
    matches = sorted(p.name for p in root.rglob(pattern))
    return matches[0] if matches else None


def main() -> int:
    root = Path(sys.argv[1])
    rows: list[str] = []
    missing: list[str] = []

    for pattern, label, note in PRIMARY:
        name = find(root, pattern)
        if name is None:
            missing.append(pattern)
        else:
            rows.append(f"| {label} | [`{name}`]({{base}}/{name}) | {note} |")

    for pattern, label, note in SECONDARY:
        name = find(root, pattern)
        if name is not None:
            rows.append(f"| {label} | [`{name}`]({{base}}/{name}) | {note} |")

    if missing:
        print(f"ERROR: missing primary installers: {missing}", file=sys.stderr)
        return 1

    tag = sys.argv[2] if len(sys.argv) > 2 else ""
    repo = sys.argv[3] if len(sys.argv) > 3 else "tvollstaedt/exodium"
    base = f"https://github.com/{repo}/releases/download/{tag}"
    body = "\n".join(
        [
            "## Which file do I need?",
            "",
            "| Platform | Download | Notes |",
            "|---|---|---|",
            *rows,
            "",
            "Everything else (`.sig`, `latest.json`, `.app.tar.gz`) is auto-update plumbing, and the `Exodium-windows/-macos/-linux` files are permalink copies for the README download buttons - you don't need any of them.",
            "",
            "### macOS: \"Exodium is damaged\" on first launch",
            "",
            "The app isn't signed with an Apple Developer ID yet, so Gatekeeper blocks it. Run this once after dragging it to Applications:",
            "",
            "```",
            "xattr -cr /Applications/Exodium.app",
            "```",
            "",
            # NOTE: GitHub renders release bodies like comments - single
            # newlines become visible <br> breaks. Keep each paragraph on ONE
            # line, and end the body exactly at "---" with no trailing blank
            # (generate_release_notes appends "Full Changelog" right after).
            "The macOS and Windows warnings exist because Exodium isn't code-signed yet - certificates cost real money. Donating via [GitHub Sponsors](https://github.com/sponsors/tvollstaedt) or [Ko-fi](https://ko-fi.com/tvollstaedt) helps fund them.",
            "",
            "---",
        ]
    ).replace("{base}", base)
    print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
