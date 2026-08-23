import { createEffect } from "solid-js";
import { getGameVariants, type Game } from "../api/tauri";
import { lastGameLibraryChange } from "./games";

/** Shared cache for `get_game_variants`.
 *
 *  Every multi-language GameCard asks for its group's variants from an effect.
 *  Rendering a page is fine; rendering the whole catalogue (what a jump-bar
 *  jump does) fired one IPC call per multi-language card - ~734 of them in a
 *  burst. Requests are now deduplicated by shortcode, and the resolved list is
 *  reused until something changes a game's library state.
 *
 *  In-flight promises are cached too, so N cards mounting in the same frame
 *  share a single round trip. */
const cache = new Map<string, Promise<Game[]>>();

// installed/in_library flags are baked into the cached rows, so anything that
// changes them invalidates the cache wholesale (there are at most a few
// hundred entries; targeted eviction isn't worth the bookkeeping).
createEffect(() => {
  lastGameLibraryChange();
  cache.clear();
});

/** A group is (collection family, shortcode): the same shortcode names a
 *  different game in another pack. Both come off the row so a caller cannot
 *  pair them up wrongly, and the cache key carries both. */
export function loadVariants(
  game: Pick<Game, "shortcode" | "torrent_source">,
  force = false,
): Promise<Game[]> {
  const shortcode = game.shortcode ?? "";
  const collection = game.torrent_source ?? "eXoDOS";
  const key = `${collection}\u001f${shortcode}`;
  if (force) { cache.delete(key); }
  const hit = cache.get(key);
  if (hit) { return hit; }
  const request = getGameVariants(shortcode, collection).catch((e) => {
    // Don't cache a failure - the next card (or a retry) should try again.
    cache.delete(key);
    throw e;
  });
  cache.set(key, request);
  return request;
}
