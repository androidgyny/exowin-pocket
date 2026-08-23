import { createSignal, Show } from "solid-js";
import { getConfig, setConfig } from "../api/tauri";
import { startContentPackInstall, activeJobs, packsByCollection } from "../stores/contentPacks";
import { isOffline } from "../stores/network";
import { posterDirForCollection, thumbnailDirsLoaded } from "../stores/thumbnails";
import { formatBytes } from "../util";
import { Button } from "./Button";

/** Config key holding the collections whose hint the user has dismissed. */
const DISMISSED_KEY = "pack_hint_dismissed";

interface Props {
  /** The collection currently being browsed. */
  collection: string;
}

/**
 * A one-time, non-blocking nudge that this collection's covers can be better.
 *
 * Content packs otherwise live in Settings, where nobody looks: the only other
 * mention is the welcome modal, which fires once at first run and only ever
 * offers eXoDOS. Someone who later browses eXoWin3x sees low-res covers and no
 * hint that better ones exist.
 *
 * The trigger is what the grid is actually rendering, not what is downloadable.
 * A language pack has no poster pack of its own but resolves to eXoDOS's
 * (`asset_fallback`), so its covers are already sharp - offering it a 4.1 GB
 * metadata pack under an artwork headline was noise. Conversely eXoWin3x shows
 * 80 px previews, which is exactly where the hint belongs.
 *
 * Everything it needs is already in memory (`packsByCollection`, filled by the
 * same startup sweep that resolves installed state), so switching collections
 * renders it in the same frame as the grid. An earlier version fetched per
 * collection and dropped in a beat later, shifting the grid down.
 *
 * Deliberately a suggestion, not a gate - it dismisses per collection and never
 * reappears once answered either way.
 */
export function PackHintBanner(props: Props) {
  // null until the stored list has arrived. Treating "not loaded yet" as "not
  // dismissed" made the banner flash on every start before the config landed.
  const [dismissed, setDismissed] = createSignal<string[] | null>(null);

  getConfig(DISMISSED_KEY)
    .then((v) => setDismissed(v ? v.split(",").filter(Boolean) : []))
    // An unreadable config must not mean "nag on every start": stay quiet.
    .catch(() => setDismissed(["*"]));

  /** Already downloading it? Then the hint has done its job. */
  const running = () =>
    Object.entries(activeJobs()).some(
      ([key, job]) => job && !job.finished && key.startsWith(`${props.collection}:`),
    );

  const pack = () => {
    const collection = props.collection;
    if (!collection || isOffline() || running()) { return null; }
    const seen = dismissed();
    if (!seen || seen.includes(collection)) { return null; }
    // Only when the grid is on the bundled low-res tier. Wait for the resolve:
    // the startup state is an empty map, which would read as "no posters".
    if (!thumbnailDirsLoaded() || posterDirForCollection(collection)) { return null; }
    // Only the box-art tier: it is the one that changes what the user is
    // looking at. Gallery art and manuals live in the metadata pack, which
    // runs to 24 GB (GLP) and belongs in Settings, not in a drive-by hint.
    const packs = packsByCollection()[collection] ?? [];
    return packs.find((p) => p.id === "posters" && p.available && !p.installed) ?? null;
  };

  const remember = async (collection: string) => {
    const next = [...new Set([...(dismissed() ?? []), collection])];
    setDismissed(next);
    await setConfig(DISMISSED_KEY, next.join(",")).catch(() => {});
  };

  const install = async () => {
    const p = pack();
    const collection = props.collection;
    if (!p) { return; }
    // Remember first: a failed start is still an answered question.
    await remember(collection);
    startContentPackInstall(collection, p.id, p.display_name).catch((e) =>
      console.error("Failed to start content pack install:", e),
    );
  };

  return (
    <Show when={pack()}>
      <div class="pack-hint">
        <div class="pack-hint-text">
          <div class="pack-hint-title">Better covers available</div>
          <div class="pack-hint-desc">
            {pack()!.display_name} for this collection is an optional{" "}
            {formatBytes(pack()!.size_bytes)} download. You can also manage it later
            in Settings.
          </div>
        </div>
        <Button variant="secondary" class="pack-hint-action" onClick={install}>Download</Button>
        <button
          class="pack-hint-dismiss"
          title="Not now"
          onClick={() => remember(props.collection)}
        >✕</button>
      </div>
    </Show>
  );
}
