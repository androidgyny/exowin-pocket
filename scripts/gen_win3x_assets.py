#!/usr/bin/env python3
"""
Rebuild the bundled eXoWin3x assets from the pack's own metadata ZIPs.

Both inputs come off the eXoWin3x torrent (see init-dev.sh --win3x):
    <data>/eXoWin3x/eXoWin3x/Content/!Win3Xmetadata.zip   config overlay, 648 MB
    <data>/eXoWin3x/eXoWin3x/Content/XOWin3xMetadata.zip  media + XML, 2.3 GB

Produces:
    metadata/Win3x.xml.gz        the catalogue (from xml/Windows 3x.xml)
    metadata/Win3x_configs.zip   .conf/.bat only - the source zip's 660 MB of
                                 PDFs and screenshots stay out of the bundle
    metadata/dosbox3x.txt        title -> emulator variant, read out of each
                                 launcher bat's `.\\dosbox\\<variant>\\dosbox.exe`

Usage:
    python3 scripts/gen_win3x_assets.py [<content_dir>]
    (default: ~/.exodium-dev/eXoWin3x/eXoWin3x/Content, or $XDO_DEV_DATA)
"""

import gzip
import os
import re
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LAUNCHER_VARIANT = re.compile(r"\.\\dosbox\\([^\\]+)\\dosbox\.exe", re.I)


def is_launcher(name: str) -> bool:
    """A game's own launch bat - not install.bat, not the Extras/ helpers."""
    return name.endswith(".bat") and "/Extras/" not in name and not name.endswith("install.bat")


def main() -> None:
    default = Path(os.environ.get("XDO_DEV_DATA", Path.home() / ".exodium-dev"))
    content = Path(sys.argv[1]) if len(sys.argv) > 1 else default / "eXoWin3x/eXoWin3x/Content"
    configs_zip, media_zip = content / "!Win3Xmetadata.zip", content / "XOWin3xMetadata.zip"
    for p in (configs_zip, media_zip):
        if not p.is_file():
            sys.exit(f"Missing {p}\nRun: pnpm run init-dev --win3x")

    with zipfile.ZipFile(media_zip) as zf:
        xml = zf.read("xml/Windows 3x.xml")
    out = REPO / "metadata/Win3x.xml.gz"
    out.write_bytes(gzip.compress(xml, 9))
    print(f"{out.name}: {out.stat().st_size / 1048576:.1f} MB")

    with zipfile.ZipFile(configs_zip) as zin:
        # Read the launcher bats BEFORE writing the output zip: writestr()
        # mutates the ZipInfo it is handed, and those are zin's own objects -
        # reading from zin afterwards walks into the wrong header offsets.
        lines = []
        for name in zin.namelist():
            if not is_launcher(name):
                continue
            match = LAUNCHER_VARIANT.search(zin.read(name).decode("cp437", "replace"))
            if match:
                lines.append(f"{Path(name).stem}:{match.group(1)}\\dosbox.exe")

        out = REPO / "metadata/Win3x_configs.zip"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
            kept = [i for i in zin.infolist()
                    if not i.is_dir() and i.filename.lower().endswith((".conf", ".bat"))]
            for info in kept:
                zout.writestr(info, zin.read(info.filename))
        print(f"{out.name}: {len(kept)} entries, {out.stat().st_size / 1048576:.1f} MB")

    out = REPO / "metadata/dosbox3x.txt"
    out.write_text("\n".join(sorted(lines)) + "\n", encoding="utf-8")
    print(f"{out.name}: {len(lines)} entries")


if __name__ == "__main__":
    main()
