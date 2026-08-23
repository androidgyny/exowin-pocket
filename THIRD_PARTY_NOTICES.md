# Third-Party Notices

ExoWin Pocket includes or depends on third-party open source software. Dependency versions are pinned in `pnpm-lock.yaml` and `src-tauri/Cargo.lock`; the authoritative license terms for each package are provided by the respective package distributions.

## Included Application Dependencies

- Tauri and Tauri plugins
- SolidJS
- Ark UI
- Vite, TypeScript, and Vitest development tooling
- Rust crates listed in `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, including SQLite, torrent, archive, HTTP, image, logging, and async-runtime libraries

These dependencies are included under their own licenses. Each package's own license file remains controlling.

## External Runtime Requirements

The following are required for Android gameplay but are not bundled with ExoWin Pocket:

- RetroArch for Android
- DOSBox Pure libretro core
- A user-supplied, legally licensed Windows 3.1 or Windows for Workgroups 3.11 DOSZ image
- A compatible user-supplied `RUNEXIT.EXE` helper

Users must install and configure these separately. Their projects, licenses, trademarks, and distribution terms are independent from ExoWin Pocket.

## External Content

ExoWin Pocket can browse metadata and download content from an external eXoWin3x-related torrent selected by the user. The repository does not include downloaded games, Windows, drivers, helper binaries, ROMs, manuals, screenshots, videos, poster packs, preview JPEGs, soundfonts, Roland ROMs, BIOS images, or other copyrighted game/media content.

Users are responsible for ensuring that their use of external content is lawful and permitted by the applicable rights holders.

## Upstream Attribution

ExoWin Pocket is derived from Exodium Pocket and Exodium by Thomas Vollstaedt, licensed under MIT. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).
