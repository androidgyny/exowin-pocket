#!/usr/bin/env python3
"""
Rebuild the bundled eXoWin9x assets from the pack's own metadata ZIPs.

Both inputs come off the eXoWin9x torrent (see init-dev.sh --win9x):
    <data>/eXoWin9x/eXoWin9x/Content/!Win9Xmetadata.zip   config overlay, 8.4 GB
    <data>/eXoWin9x/eXoWin9x/Content/XOWin9xMetadata.zip  media + XML, 4.6 GB

Produces:
    metadata/Win9x.xml.gz        the catalogue (from xml/Windows 9x.xml)
    metadata/Win9x_configs.zip   .conf/.bat/.cfg only (play.conf for DOSBox-X
                                 games, play.cfg for 86Box games) - manuals
                                 and extras stay out of the bundle
    metadata/dosbox9x.txt        title -> engine variant, read out of which
                                 generic 9xlaunch*.bat each launcher calls.
                                 Slugs: x98 (DOSBox-X), 86box, 86boxME,
                                 86boxNetHost, 86boxNetJoin, pcbox - written
                                 as "<title>:<slug>\\dosbox.exe" so
                                 generate_db's existing parser applies.

Usage:
    python3 scripts/gen_win9x_assets.py [<content_dir>]
    (default: ~/.exodium-dev/eXoWin9x/eXoWin9x/Content, or $XDO_DEV_DATA)
"""

import gzip
import os
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
# Which generic launcher does the per-game bat call?
#   call ..\..\..\..\util\9xlaunch.bat  /  9xlaunch86Box.bat  /  ...
LAUNCHER_CALL = re.compile(r"9xlaunch(\w*)\.bat", re.I)
SLUGS = {
    "": "x98",
    "86box": "86box",
    "86boxme": "86boxME",
    "86boxnethost": "86boxNetHost",
    "86boxnetjoin": "86boxNetJoin",
    "pcbox": "pcbox",
}


def is_launcher(name: str) -> bool:
    """A game's own launch bat - not install.bat, not the Extras/ helpers."""
    return name.endswith(".bat") and "/Extras/" not in name and not name.endswith("install.bat")


def main() -> None:
    default = Path(os.environ.get("XDO_DEV_DATA", Path.home() / ".exodium-dev"))
    content = Path(sys.argv[1]) if len(sys.argv) > 1 else default / "eXoWin9x/eXoWin9x/Content"
    configs_zip, media_zip = content / "!Win9Xmetadata.zip", content / "XOWin9xMetadata.zip"
    for p in (configs_zip, media_zip):
        if not p.is_file():
            sys.exit(f"Missing {p}\nRun: pnpm run init-dev --win9x")

    # Unlike Win3x there is no finished "Windows 9x.xml" in the zip: eXo ships
    # per-volume body fragments (xml/all/1994-1996.9x, more volumes to come)
    # and merge_9xall.bat wraps them in the LaunchBox root element at setup
    # time. Replicate that merge, using the "all" set (the "family" set is the
    # same minus adult titles - Exodium does not curate).
    with zipfile.ZipFile(media_zip) as zf:
        fragments = sorted(n for n in zf.namelist()
                           if n.startswith("xml/all/") and n.endswith(".9x"))
        if not fragments:
            sys.exit(f"No xml/all/*.9x fragments found in {media_zip}")
        parts = [b'<?xml version="1.0" standalone="yes"?>\n<LaunchBox>\n']
        parts += [zf.read(n) for n in fragments]
        parts.append(b"\n</LaunchBox>\n")
        xml = b"".join(parts)
    out = REPO / "metadata/Win9x.xml.gz"
    out.write_bytes(gzip.compress(xml, 9))
    print(f"{out.name}: {out.stat().st_size / 1048576:.1f} MB ({len(fragments)} volume fragment(s))")

    with zipfile.ZipFile(configs_zip) as zin:
        # Read the launcher bats BEFORE writing the output zip: writestr()
        # mutates the ZipInfo it is handed, and those are zin's own objects -
        # reading from zin afterwards walks into the wrong header offsets.
        lines = []
        histogram = Counter()
        for name in zin.namelist():
            if not is_launcher(name):
                continue
            match = LAUNCHER_CALL.search(zin.read(name).decode("cp437", "replace"))
            if match:
                slug = SLUGS.get(match.group(1).lower())
                if slug is None:
                    print(f"WARN: unknown launcher variant {match.group(0)!r} in {name}")
                    continue
                histogram[slug] += 1
                lines.append(f"{Path(name).stem}:{slug}\\dosbox.exe")

        out = REPO / "metadata/Win9x_configs.zip"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
            kept = [i for i in zin.infolist()
                    if not i.is_dir() and i.filename.lower().endswith((".conf", ".bat", ".cfg"))]
            for info in kept:
                zout.writestr(info, zin.read(info.filename))
        print(f"{out.name}: {len(kept)} entries, {out.stat().st_size / 1048576:.1f} MB")

    out = REPO / "metadata/dosbox9x.txt"
    out.write_text("\n".join(sorted(lines)) + "\n", encoding="utf-8")
    print(f"{out.name}: {len(lines)} entries")
    for slug, n in histogram.most_common():
        print(f"  {slug}: {n}")


if __name__ == "__main__":
    main()
