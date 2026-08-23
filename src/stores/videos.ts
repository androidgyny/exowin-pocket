import { createSignal } from "solid-js";
import { startGameVideo, getVideoStatus, cancelGameVideo, videoPlaybackSupported, type VideoStatus } from "../api/tauri";

/** Preview-video state per game.
 *
 *  The video is streamed out of the game's GameData archive, which can take a
 *  minute when the torrent is cold - so this mirrors the downloads store: fire
 *  and poll, never block the panel.
 *
 *  Closing the panel does NOT stop a fetch; the point of the feature is that
 *  the video is simply there next time. But each fetch is a torrent stream with
 *  its own 32 MB lookahead, and several at once fight over the same peers, so
 *  only MAX_CONCURRENT run at a time.
 *
 *  Anything over the limit WAITS - it is never dropped. An earlier version
 *  deleted the evicted entry, and the panel then showed nothing at all, which
 *  reads as "this game has no video". A queued fetch keeps its place and says
 *  so. Giving up a slot is cheap either way: librqbit writes fetched pieces
 *  into the archive on disk, so resuming finds them locally. */
const [videos, setVideos] = createSignal<Record<number, VideoStatus>>({});
export { videos };

const POLL_MS = 700;

/** Concurrent fetches. Three keeps a browsing session useful without turning
 *  the swarm connection into a queue. */
const MAX_CONCURRENT = 3;

/** Frontend-only phase: waiting for a slot. */
export const PHASE_QUEUED = "queued";
/** Backend is reading the archive index - existence of a video is still open. */
export const PHASE_PROBING = "probing";

const intervals: Record<number, ReturnType<typeof setInterval>> = {};
/** Running fetches, oldest first - the eviction order. */
let active: number[] = [];
/** Waiting fetches, next one first. */
let queue: number[] = [];
/** The game whose panel is open; always gets a slot, never evicted. */
let foreground: number | null = null;

export function getVideoState(gameId: number): VideoStatus | undefined {
  return videos()[gameId];
}

function put(gameId: number, status: VideoStatus) {
  setVideos((prev) => ({ ...prev, [gameId]: status }));
}

function queuedStatus(previous?: VideoStatus): VideoStatus {
  return {
    phase: PHASE_QUEUED,
    progress: 0,
    // Carry the known size across an eviction: it is the panel's signal that a
    // video was confirmed, and losing it would make a confirmed video look
    // like an open question again.
    total_bytes: previous?.total_bytes ?? 0,
    path: null,
    error: null,
  };
}

function stopPolling(gameId: number) {
  clearInterval(intervals[gameId]);
  delete intervals[gameId];
  active = active.filter((id) => id !== gameId);
}

/** Push the oldest background fetch back into the queue so a newer one - or
 *  the game on screen - can run. */
function evictOne(): boolean {
  const victim = active.find((id) => id !== foreground);
  if (victim == null) { return false; }
  stopPolling(victim);
  cancelGameVideo(victim).catch(() => {});
  put(victim, queuedStatus(videos()[victim]));
  if (!queue.includes(victim)) { queue.unshift(victim); }
  return true;
}

/** Start whatever fits in the free slots. */
function pump() {
  while (queue.length > 0 && active.length < MAX_CONCURRENT) {
    const next = queue.shift()!;
    void beginFetch(next);
  }
}

async function beginFetch(gameId: number) {
  if (intervals[gameId]) { return; }
  active.push(gameId);
  let initial: VideoStatus;
  try {
    initial = await startGameVideo(gameId);
  } catch (e) {
    put(gameId, { phase: "error", progress: 0, total_bytes: 0, path: null, error: String(e) });
    stopPolling(gameId);
    pump();
    return;
  }
  // Deliberately outside the try: writing the status runs subscribers
  // synchronously, and a throw in one of them is a UI bug, not a failed fetch.
  // Recording it as one hid a perfectly good video behind a retry button.
  put(gameId, initial);
  if (initial.phase !== "fetching" && initial.phase !== PHASE_PROBING) {
    // Cached, absent, or failed outright - nothing to poll for.
    stopPolling(gameId);
    pump();
    return;
  }

  intervals[gameId] = setInterval(async () => {
    try {
      const status = await getVideoStatus(gameId);
      if (!status) { stopPolling(gameId); pump(); return; }
      put(gameId, status);
      if (status.phase !== "fetching" && status.phase !== PHASE_PROBING) { stopPolling(gameId); pump(); }
    } catch {
      stopPolling(gameId);
      pump();
    }
  }, POLL_MS);
}

/** Ask for a game's video. Runs now if a slot is free (or if this is the game
 *  on screen), waits otherwise. */
/** null until the one-time probe answers; the panel uses this to explain WHY
 *  there is no preview rather than silently showing none. */
const [playbackUnsupported, setPlaybackUnsupported] = createSignal(false);
export { playbackUnsupported as videoPlaybackUnsupported };

let supportKnown: Promise<boolean> | null = null;
function ensurePlaybackSupportKnown(): Promise<boolean> {
  // An unreachable probe must not disable previews on the platforms that have
  // no problem - only an explicit "no" does.
  // Only an explicit "no" disables the feature. A missing command, an odd
  // payload or a failed invoke must not switch previews off on the platforms
  // that have no problem.
  supportKnown ??= videoPlaybackSupported()
    .then((ok) => { const unsupported = ok === false; setPlaybackUnsupported(unsupported); return !unsupported; })
    .catch(() => true);
  return supportKnown;
}

export async function requestVideo(gameId: number) {
  // Fetching would be wasted torrent traffic for a video that must never be
  // mounted - on an affected system the <video> element itself is what
  // freezes the app, so the whole feature stands down.
  if (!(await ensurePlaybackSupportKnown())) { return; }
  const known = videos()[gameId];
  if (known && known.phase !== "error" && known.phase !== PHASE_QUEUED) { return; }
  if (intervals[gameId] || active.includes(gameId)) { return; }

  queue = queue.filter((id) => id !== gameId);

  if (active.length >= MAX_CONCURRENT) {
    // The visible game jumps the queue - waiting behind a fetch nobody is
    // looking at is the one case where the cap would be felt as a bug.
    const isForeground = foreground === gameId;
    if (!isForeground || !evictOne()) {
      put(gameId, queuedStatus(videos()[gameId]));
      queue.push(gameId);
      return;
    }
  }
  await beginFetch(gameId);
}

/** Mark which game the panel is showing, so its fetch is never the one evicted
 *  and it can jump the queue. */
export function setForegroundVideo(gameId: number | null) {
  foreground = gameId;
}

/** The panel moved on. The fetch keeps running - it just loses its protection
 *  from eviction when other games queue up behind it. */
export function releaseVideo(gameId: number) {
  if (foreground === gameId) { foreground = null; }
}

/** In-flight fetches (for tests and diagnostics). */
export function activeVideoCount(): number {
  return active.length;
}

/** Fetches waiting for a slot (for tests and diagnostics). */
export function queuedVideoCount(): number {
  return queue.length;
}
