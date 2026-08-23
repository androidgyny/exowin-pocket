# Compatibility Notes

ExoWin Pocket translates eXoWin3x launch recipes to a shared Windows 3.1 DOSZ running in DOSBox Pure. This is inherently less exact than the original desktop collection's game-specific DOSBox executables, configurations, and helper stack.

The catalog is curated to 1,119 candidates from the 1,138 eXoWin3x entries known to the bundled manifest. Inclusion means the launcher recognized a recipe it can attempt; it does not mean the game was tested or guaranteed to work.

## Supported Recipe Families

The current translator attempts:

- Ordinary Windows-folder recipes.
- `WIN` and `WIN program [arguments]` recipes.
- Recursive `CALL RUN` and `CALL RUN.BAT` recipes.
- Supported hybrid DOS/Windows executable detection.
- CD, ISO, CUE, floppy, multi-disc, and arbitrary drive-letter mounts.
- Per-game Windows trees and games that need a single top-level folder exposed as drive C.

## Known Exclusions

The following 19 shortcodes are intentionally absent from the Android catalog:

| Shortcode | Reason |
| --- | --- |
| `AAAC` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `Case4Cap` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `EarthQue` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `F-14Flee` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `Grant-Le` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `JackAtic` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `JumpRave` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `Lunicus` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `MasqueSo` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `MathRabD` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `RobertEL` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `SonicSH` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `TheCassa` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `TheCHAOS` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `WizGold` | Boot or hard-disk-image launch recipe not supported by this MVP |
| `GolfPro2` | Nonstandard launcher recipe |
| `TetG3x` | Requires the unsupported `SHGAMES`/`tetdos` setup |
| `SimC23x` | Validated runtime/video failure after Windows startup |
| `qfg43x` | Validated Windows interpreter/runtime audio incompatibility; CD speech unavailable |

## User Configuration

Some titles only work with particular DOSBox Pure options. ExoWin Pocket does not create or modify per-game RetroArch option files; those settings belong to the user.

When a game fails, test memory size, CPU type, normal versus dynamic core, and fixed cycles. A title may also need a different MIDI or audio setup, a changed executable selection, disc swapping, or a fresh generated overlay. These adjustments are considered normal for this MVP.

Compatibility reports should include the game title and shortcode, device and Android version, RetroArch version, DOSBox Pure core version, DOSZ construction details, per-game core options, and the ExoWin Pocket application log.
