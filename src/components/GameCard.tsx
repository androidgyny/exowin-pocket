import { createSignal, createEffect, on, onCleanup, onMount, Show, For } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CircularProgress } from "./ProgressBar";
import type { Game } from "../api/tauri";
import { loadVariants } from "../stores/variants";
import { formatBytes, parseLangEntries, langBadgeClass } from "../util";
import { thumbnailCandidates } from "../stores/thumbnails";
import { observeNearViewport, unobserveNearViewport } from "../nearViewport";
import { downloads, cancelGameDownload } from "../stores/downloads";
import { isOffline } from "../stores/network";
import { toggleFavorite } from "../stores/games";
import { GameActionsMenu } from "./GameActionsMenu";

interface GameCardProps {
  game: Game;
  onFavoriteChanged?: (id: number, favorited: boolean) => void;
  onDetail: (game: Game) => void;
}

export function GameCard(props: GameCardProps) {
  const [status, setStatus] = createSignal("");
  const [imgError, setImgError] = createSignal(false);
  // Index into `thumbnailCandidates()` - advances on each <img onError> so
  // a stale poster dir (shortcode-keyed files from a previous Exodium version)
  // still falls through to the bundled preview on 404.
  const [thumbIdx, setThumbIdx] = createSignal(0);
  const [favorited, setFavorited] = createSignal(props.game.favorited);
  const [variants, setVariants] = createSignal<Game[]>([]);
  const [contextMenu, setContextMenu] = createSignal<{x: number, y: number} | null>(null);
  const [favAnimating, setFavAnimating] = createSignal(false);
  let favAnimTimeout: number | undefined;
  onCleanup(() => { if (favAnimTimeout) { clearTimeout(favAnimTimeout); } });

  // Re-sync favorited from props only when the card is reused for a different game (For loop
  // key change). Do NOT run on favorited-flag-only changes - that would race with the
  // optimistic update in handleToggleFavorite and cause a visible flicker.
  createEffect(on(() => props.game.id, () => { setFavorited(props.game.favorited); }, { defer: true }));

  // Pre-load variant IDs for multi-lang games so download state is visible on main card.
  // createEffect re-runs when props.game.shortcode changes, handling component reuse in For loops.
  createEffect(() => {
    const shortcode = props.game.shortcode;
    if (!isMultiLang() || !shortcode) { return; }
    loadVariants(props.game)
      .then((v) => { if (props.game.shortcode === shortcode) { setVariants(v); } })
      .catch(() => {});
  });

  // Covers load once the card is within ~2 screens of the viewport instead of
  // when it nearly enters it - see nearViewport.ts. Sticky once true: a card
  // scrolled back into view must not refetch.
  const [nearViewport, setNearViewport] = createSignal(false);
  let cardRef: HTMLDivElement | undefined;
  onMount(() => {
    if (cardRef) { observeNearViewport(cardRef, () => setNearViewport(true)); }
  });
  onCleanup(() => { if (cardRef) { unobserveNearViewport(cardRef); } });

  const thumbCandidates = () => thumbnailCandidates(props.game.torrent_source, props.game.thumbnail_key);

  // Reset thumbnail state when the card is reused for a different game
  // (For-loop key change) or when the tier list itself changes. Removing a
  // poster pack shortens that list, and a card that had already fallen through
  // to index 1 then pointed past its end - every tile went blank.
  createEffect(on(
    () => `${props.game.id}|${thumbCandidates().join("|")}`,
    () => { setImgError(false); setThumbIdx(0); },
    { defer: true },
  ));

  const thumbSrc = () => {
    if (!nearViewport()) { return null; }
    const c = thumbCandidates();
    // Clamp rather than trust the index: the reset effect lands a frame later,
    // and for that frame an out-of-range index would unmount the <img>, drop
    // the card to the no-cover aspect-ratio rule and jolt the whole grid.
    const path = c[thumbIdx()] ?? c[c.length - 1];
    if (!path) { return null; }
    return convertFileSrc(path);
  };

  /** The cover this card is currently showing, kept mounted underneath while a
   *  REPLACEMENT decodes. Non-null only during that hand-over, which is the
   *  only moment a cross-fade is wanted: installing a poster pack swaps a
   *  blurry preview for a sharp one under the user's eyes. A card painting its
   *  first cover has nothing to dissolve from and must not fade in - that put
   *  a 350 ms ramp on every tile of every scroll. */
  const [underSrc, setUnderSrc] = createSignal<string | null>(null);
  const [topLoaded, setTopLoaded] = createSignal(true);
  const crossfading = () => underSrc() !== null;

  // Compare the VALUE, not the dependencies: thumbSrc re-runs whenever any
  // collection's tier dirs change, so `on(thumbSrc, ...)` fired for every card
  // in the grid when one pack was installed. Cards whose own cover had not
  // changed were flagged as loading, faded to 0 - and never came back, because
  // an unchanged src fires no second load event. That is the "Win9x posters go
  // blurry when I install DOS, until I reload the library" report.
  /** Reveal the new cover, but never in the same frame the fade begins.
   *
   *  The `<img>` element survives the swap - only its src changes - so adding
   *  `is-fading-in` sets opacity 0 and `is-loaded` sets it back to 1. A local
   *  asset can fire `load` before the browser has painted a single frame at 0,
   *  and a transition whose start value was never rendered simply does not
   *  run: the poster appeared instantly, exactly as before the cross-fade
   *  existed. Two frames is the reliable minimum for "has been painted". */
  const markTopLoaded = () => {
    if (!crossfading() || typeof requestAnimationFrame !== "function") {
      setTopLoaded(true);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => setTopLoaded(true)));
  };

  let paintedSrc: string | null = null;
  createEffect(() => {
    const next = thumbSrc();
    if (next === paintedSrc) { return; }
    const previous = paintedSrc;
    paintedSrc = next;
    // Only dissolve from a cover that was actually on screen. After a 404 the
    // outgoing image painted nothing, so holding it underneath would show the
    // empty tile through the fade.
    if (previous && next && topLoaded()) {
      setUnderSrc(previous);
      setTopLoaded(false);
    } else {
      setUnderSrc(null);
      setTopLoaded(true);
    }
  });

  const handleImgError = () => {
    // Advance to next candidate (e.g. poster URL 404'd → try bundled preview).
    // If we've exhausted them all, hide the tile.
    if (thumbIdx() + 1 < thumbCandidates().length) {
      setThumbIdx(thumbIdx() + 1);
    } else {
      setImgError(true);
    }
  };

  const langEntries = () => parseLangEntries(props.game);
  const isMultiLang = () => langEntries().length > 1;

  // Read download state - check primary game and any loaded variants.
  // Tracks WHICH id the state came from: on a merged card the overlay can
  // show a variant's download, and the cancel button must target that id,
  // not always the primary (which would no-op).
  const dlEntry = () => {
    const dl = downloads();
    // ?.downloading also for the primary: a finished/failed entry lingers in
    // the store (extras phase, errors are never cleaned up) and would shadow
    // a variant's LIVE download - and a non-downloading entry is never
    // rendered here anyway.
    if (props.game.id != null && dl[props.game.id]?.downloading) {
      return { id: props.game.id, state: dl[props.game.id] };
    }
    for (const v of variants()) {
      if (v.id != null && dl[v.id]?.downloading) { return { id: v.id, state: dl[v.id] }; }
    }
    return undefined;
  };
  const dlState = () => dlEntry()?.state;

  const handleContextMenu = (e: MouseEvent) => {
    if (props.game.id == null) { return; }
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    props.onDetail(props.game);
  };

  const handleToggleFavorite = async (e: MouseEvent) => {
    e.stopPropagation();
    if (props.game.id == null) { return; }
    const prev = favorited();
    setFavorited(!prev);
    // Retrigger CSS animation by flipping off-then-on across a frame - just
    // setting true-to-true wouldn't restart a keyframe animation already in
    // flight (e.g. double-click taps). Clear any previously-scheduled
    // turn-off so a second click within 500ms doesn't clip its own animation.
    if (favAnimTimeout) { clearTimeout(favAnimTimeout); }
    setFavAnimating(false);
    requestAnimationFrame(() => setFavAnimating(true));
    favAnimTimeout = window.setTimeout(() => setFavAnimating(false), 500);
    try {
      const next = await toggleFavorite(props.game.id);
      setFavorited(next);
      props.onFavoriteChanged?.(props.game.id, next);
    } catch {
      setFavorited(prev);
    }
  };

  const currentProgress = () => dlState()?.progress ?? 0;
  const isDownloading = () => dlState()?.downloading ?? false;

  return (
    <div ref={cardRef} class={`game-card ${props.game.installed || props.game.in_library ? "installed" : ""}`} onContextMenu={handleContextMenu} data-game-id={props.game.id != null ? String(props.game.id) : undefined}>
      <div class="game-card-art" onClick={handleClick}>
        <Show when={thumbSrc() && !imgError()}>
          <Show when={underSrc()}>
            <img class="game-card-thumb-base" src={underSrc()!} alt="" aria-hidden="true" />
          </Show>
          <img
            class={`game-card-thumb${crossfading() ? " is-fading-in" : ""}${topLoaded() ? " is-loaded" : ""}`}
            src={thumbSrc()!}
            alt=""
            onLoad={markTopLoaded}
            // ONLY the reveal ends the hand-over. The class sets opacity 0 and
            // the transition in one go, so the element first fades 1 -> 0 and
            // that transitionend arrives after 350 ms whether or not the new
            // cover has decoded - clearing the understudy there left a blank
            // tile and a hard cut for anything slower than the fade.
            onTransitionEnd={() => { if (topLoaded()) { setUnderSrc(null); } }}
            onError={handleImgError}
          />
        </Show>
        <Show when={isDownloading()}>
          <div class="game-card-download-overlay">
            <CircularProgress value={currentProgress()} size={64} strokeWidth={5}>
              <Show when={currentProgress() > 0} fallback={<span class="circular-progress-pct muted">…</span>}>
                <span class="circular-progress-pct">{Math.round(currentProgress() * 100)}%</span>
              </Show>
            </CircularProgress>
            <Show when={dlEntry() != null}>
              <button class="game-card-overlay-cancel"
                title="Cancel download"
                onClick={(e) => { e.stopPropagation(); cancelGameDownload(dlEntry()!.id); }}>✕</button>
            </Show>
          </div>
        </Show>
        <div class="game-card-body">
          <div class="game-card-title">{props.game.title}</div>
          <div class="game-card-meta">
            {props.game.year && <span>{props.game.year}</span>}
            {props.game.genre && <span class="genre">{props.game.genre}</span>}
          </div>
          <div class="game-card-footer">
            <For each={langEntries()}>
              {(entry) => (
                <span class={`badge badge-lang ${langBadgeClass(entry.state)}`}>
                  {entry.lang}
                </span>
              )}
            </For>
          </div>
          <div class="game-card-action-bar">
            <Show when={status()}>
              <span class="card-action-label action-downloading fade-swap">{status()}</span>
            </Show>
            <Show when={!status()}>
              <Show when={isDownloading()}>
                <span class="card-action-label action-downloading">{dlState()?.status}</span>
              </Show>
              <Show when={!isDownloading() && props.game.installed}>
                <span class="card-action-label action-installed">▶ Play</span>
              </Show>
              <Show when={!isDownloading() && !props.game.installed && props.game.in_library}>
                <span class="card-action-label action-incomplete">⚠ Incomplete</span>
              </Show>
              <Show when={!isDownloading() && !props.game.installed && !props.game.in_library}>
                <span class={`card-action-label ${isOffline() ? "action-offline" : "action-download"}`}>
                  <Show when={!isOffline()} fallback="Not installed">
                    {props.game.download_size ? `↓ ${formatBytes(props.game.download_size)}` : "↓ Download"}
                  </Show>
                </span>
              </Show>
            </Show>
          </div>
        </div>
      </div>

      <Show when={props.game.id != null}>
        <button
          class={`favorite-btn${favorited() ? " is-favorited" : ""}${favAnimating() ? " animating" : ""}`}
          onClick={handleToggleFavorite}
          title={favorited() ? "Remove from favorites" : "Add to favorites"}
        >
          <span class="fav-star">★</span>
          <Show when={favAnimating() && favorited()}>
            <span class="fav-ring" />
            <span class="fav-sparks">
              <For each={[0, 1, 2, 3, 4, 5]}>
                {(i) => <span class="fav-spark" style={{ "--angle": `${i * 60}deg` }} />}
              </For>
            </span>
          </Show>
        </button>
      </Show>

      {/* One component for both surfaces - see GameActionsMenu. It stays
          mounted until whatever it opened is finished, so `contextMenu` is
          cleared by its onClose, not by the item that was clicked. */}
      <Show when={contextMenu()}>
        <GameActionsMenu
          game={props.game}
          x={contextMenu()!.x}
          y={contextMenu()!.y}
          downloading={isDownloading()}
          setStatus={setStatus}
          onDetail={props.onDetail}
          onClose={() => setContextMenu(null)}
        />
      </Show>

    </div>
  );
}
