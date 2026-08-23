import { createSignal } from "solid-js";
import { cancelDownload, downloadGame, getDownloadProgress } from "../api/tauri";
import { refreshLoadedGames, notifyGameLibraryChanged } from "./games";
import { showToast } from "./toasts";
import { transferStats } from "./transfer";

interface DownloadState {
  status: string;
  progress: number;
  downloading: boolean;
  /** True from the moment the game itself is playable (extras may still be
   *  downloading) - components must use this, not string-match the status. */
  installed?: boolean;
  title?: string;
}

const [downloads, setDownloads] = createSignal<Record<number, DownloadState>>({});

// Count of consecutive poll ticks where getDownloadProgress returned null
// despite the download being marked in-flight. If this stays high for >5s
// we surface a user-visible error instead of pretending we're still starting.
// Observed on Windows: if session.add_torrent() fails (MAX_PATH, port bind,
// etc.) the handle stays None forever and file_progress returns None silently.
const nullPollCount: Record<number, number> = {};
const NULL_POLL_THRESHOLD = 5; // ~5 seconds at 1s polling interval

// Track active polling intervals so they can be cancelled.
const intervals: Record<number, ReturnType<typeof setInterval>> = {};
// setInterval does not wait for an async callback. Extraction and torrent
// checks can take longer than one second, so without this guard poll calls
// overlap and all observe the same completion transition.
const pollInFlight: Record<number, number> = {};
// Track when a game first reached 100% without finishing (stuck detection).
const stuckSince: Record<number, number> = {};
// True while the download_game backend command is still in flight. Progress
// legitimately polls null during that window (torrent handle not attached
// yet, validation pass, first-ever torrent add), so the didn't-start verdict
// must not fire until the command has actually resolved.
const commandPending: Record<number, boolean> = {};
// Monotonic attempt counter per game: a cancelled attempt's still-resolving
// download_game promise (or orphaned interval tick) must not clobber the
// state of a NEWER attempt for the same game.
const attempts: Record<number, number> = {};
// Set once the game itself is installed while extras are still downloading -
// the library refresh must fire at that moment (game is playable), not only
// when the extras finish minutes later.
const announcedInstalled: Record<number, boolean> = {};
// Stall detection: timestamp + value of the last observed progress increase.
const lastProgressAt: Record<number, number> = {};
const lastProgressVal: Record<number, number> = {};
// Same, for the whole torrent. A game's file can sit at exactly 0 for minutes
// while data pours in: pieces are 8 MB and most games are far smaller than
// that, so a re-download after uninstall has to refetch the entire block the
// game shares with its neighbours, and per-file progress only moves when that
// block validates. Without this the honest "no data received" warning fires on
// a download that is working perfectly.
const lastTorrentAt: Record<number, number> = {};
const lastTorrentVal: Record<number, number> = {};
// Seconds without progress before the status turns into peer-wait feedback,
// and before it becomes an actionable stall warning.
const STALL_HINT_SECS = 15;
const STALL_WARN_SECS = 90;
// Highest progress seen per game - prevents bar from jumping backwards due to
// librqbit stats blips or component remounts resetting the CSS transition.
const maxProgress: Record<number, number> = {};
// Titles tracked separately so state updates inside the poll loop don't have
// to re-pass the title every time.
const titles: Record<number, string> = {};

export { downloads };

export function getDownloadState(gameId: number): DownloadState | undefined {
  return downloads()[gameId];
}

export function startGameDownload(gameId: number, title?: string, resumeInstalled = false) {
  const attempt = (attempts[gameId] ?? 0) + 1;
  attempts[gameId] = attempt;
  delete announcedInstalled[gameId];
  maxProgress[gameId] = 0;
  commandPending[gameId] = !resumeInstalled;
  lastProgressVal[gameId] = -1;
  lastProgressAt[gameId] = Date.now();
  lastTorrentVal[gameId] = -1;
  lastTorrentAt[gameId] = Date.now();
  if (title) { titles[gameId] = title; }
  setDownloads((prev) => ({
    ...prev,
    [gameId]: resumeInstalled
      ? {
          status: "Installed - checking extras...",
          progress: 1,
          downloading: false,
          installed: true,
          title,
        }
      : { status: "Starting download...", progress: 0, downloading: true, title },
  }));

  const interval = setInterval(async () => {
    if (attempts[gameId] !== attempt) {
      clearInterval(interval);
      return;
    }
    if (pollInFlight[gameId] === attempt) { return; }
    pollInFlight[gameId] = attempt;
    try {
      const p = await getDownloadProgress(gameId);
      // Re-check the generation: the guard at the top of the tick ran BEFORE
      // this await, so a cancel that landed while the poll was in flight has
      // already deleted the store entry. Every branch below writes it back,
      // which resurrects the card - and since the next tick then bails on the
      // same generation mismatch, nothing ever removes it again. The card sits
      // at its last percentage with a Cancel button that does nothing. A
      // stalled download makes this the common case, not the rare one: that is
      // when people press Cancel, and the backend poll is slowest.
      if (attempts[gameId] !== attempt) {
        clearInterval(interval);
        return;
      }
      if (!p) {
        // Backend returned null - torrent handle not attached yet. While the
        // download_game command is still running that's expected (first-ever
        // torrent add + validation can take a while) - keep waiting. Only
        // once the command has resolved do consecutive misses indicate the
        // silent-stuck bug (observed on Windows: session.add_torrent()
        // failure leaves the handle None forever).
        if (commandPending[gameId]) {
          nullPollCount[gameId] = 0;
          // The backend can legitimately spend minutes here on the FIRST
          // download of a collection (placeholder creation + hash check of
          // 14k files, slow on Windows). Say so instead of sitting mute on
          // "Starting download..." - testers read that as a hang.
          const waited = (Date.now() - (lastProgressAt[gameId] ?? Date.now())) / 1000;
          if (waited > 8) {
            setDownloads((prev) => ({
              ...prev,
              [gameId]: {
                status: "Preparing the collection (one-time setup, can take a few minutes)…",
                progress: 0,
                downloading: true,
                title: titles[gameId],
              },
            }));
          }
          return;
        }
        nullPollCount[gameId] = (nullPollCount[gameId] ?? 0) + 1;
        if (nullPollCount[gameId] >= NULL_POLL_THRESHOLD) {
          clearInterval(interval);
          delete intervals[gameId];
          delete stuckSince[gameId];
          delete maxProgress[gameId];
          delete nullPollCount[gameId];
          delete commandPending[gameId];
          delete lastProgressAt[gameId];
          delete lastProgressVal[gameId];
          delete lastTorrentAt[gameId];
          delete lastTorrentVal[gameId];
          setDownloads((prev) => ({
            ...prev,
            [gameId]: {
              status: "Download didn't start - open Settings → Diagnostics to view exodium.log.",
              progress: 0,
              downloading: false,
              title: titles[gameId],
            },
          }));
          delete titles[gameId];
        }
        return;
      }
      delete nullPollCount[gameId];
      // Only allow progress to increase - prevents backwards jumps.
      const safeProgress = Math.max(maxProgress[gameId] ?? 0, p.progress);
      maxProgress[gameId] = safeProgress;

      if (p.error) {
        clearInterval(interval);
        delete intervals[gameId];
        delete stuckSince[gameId];
        delete maxProgress[gameId];
        delete lastProgressAt[gameId];
        delete lastProgressVal[gameId];
        delete lastTorrentAt[gameId];
        delete lastTorrentVal[gameId];
        delete announcedInstalled[gameId];
        delete commandPending[gameId];
        setDownloads((prev) => ({
          ...prev,
          [gameId]: { status: p.error!, progress: 0, downloading: false, title: titles[gameId] },
        }));
        showToast(
          titles[gameId] ? `Download failed: ${titles[gameId]}` : "Download failed",
          "error",
          { detail: p.error! },
        );
        delete titles[gameId];
      } else if (p.installed) {
        // The game is playable now, but its extras (GameData: manuals,
        // videos, music) may still be downloading - keep polling and show
        // that second phase instead of letting it finish invisibly.
        const extrasPending = p.extras_done === false;
        if (extrasPending) {
          const pct = ((p.extras_progress ?? 0) * 100).toFixed(0);
          if (!announcedInstalled[gameId]) {
            announcedInstalled[gameId] = true;
            refreshLoadedGames();
            notifyGameLibraryChanged(gameId);
          }
          setDownloads((prev) => ({
            ...prev,
            [gameId]: {
              status: `Installed - downloading extras… ${pct}%`,
              progress: 1,
              downloading: false,
              installed: true,
              title: titles[gameId],
            },
          }));
          return;
        }
        clearInterval(interval);
        delete intervals[gameId];
        delete stuckSince[gameId];
        delete maxProgress[gameId];
        delete lastProgressAt[gameId];
        delete lastProgressVal[gameId];
        delete lastTorrentAt[gameId];
        delete lastTorrentVal[gameId];
        delete announcedInstalled[gameId];
        delete commandPending[gameId];
        setDownloads((prev) => ({
          ...prev,
          [gameId]: { status: "Installed!", progress: 1, downloading: false, installed: true, title: titles[gameId] },
        }));
        delete titles[gameId];
        refreshLoadedGames();
        // Fires metadata-cache invalidation: when extras finished AFTER the
        // game, this is what makes the manual button resolve on its own.
        notifyGameLibraryChanged(gameId);
        // Delay cleanup so isInstalled() stays true until fetchGames() propagates the
        // updated installed flag from the DB into the games store.
        setTimeout(() => {
          setDownloads((prev) => {
            const next = { ...prev };
            delete next[gameId];
            return next;
          });
        }, 5000);
      } else if (p.finished) {
        delete stuckSince[gameId];
        setDownloads((prev) => ({
          ...prev,
          [gameId]: { status: "Extracting...", progress: safeProgress, downloading: true, title: titles[gameId] },
        }));
      } else if (safeProgress >= 0.999) {
        // 100% but ZIP not yet assembled - detect if stuck.
        if (!stuckSince[gameId]) { stuckSince[gameId] = Date.now(); }
        const elapsed = (Date.now() - stuckSince[gameId]) / 1000;
        const status = elapsed > 30
          ? "Waiting for last pieces… try cancelling and re-downloading if this persists"
          : "100%";
        setDownloads((prev) => ({
          ...prev,
          [gameId]: { status, progress: safeProgress, downloading: true, title: titles[gameId] },
        }));
      } else if (p.torrent_state === "initializing") {
        // librqbit is hash-checking the entire torrent's existing on-disk
        // content before any peer pieces are requested. On Windows with
        // thousands of placeholder files this can take 5–10 minutes the
        // first time. Per-file progress stays at 0 the whole time, so we
        // surface the torrent-level validation progress to the user.
        delete stuckSince[gameId];
        const tp = typeof p.torrent_progress === "number" ? p.torrent_progress : 0;
        const pct = (tp * 100).toFixed(0);
        setDownloads((prev) => ({
          ...prev,
          [gameId]: {
            status: `Validating torrent ${pct}% (first run can take several minutes)`,
            progress: tp,
            downloading: true,
            title: titles[gameId],
          },
        }));
      } else {
        delete stuckSince[gameId];
        // Stall feedback: a torrent with no peers (or a dropped connection)
        // otherwise sits at "0%" forever with no signal that anything is
        // wrong. Track the last progress increase and escalate the status.
        const now = Date.now();
        if (safeProgress > (lastProgressVal[gameId] ?? -1)) {
          lastProgressVal[gameId] = safeProgress;
          lastProgressAt[gameId] = now;
        }
        const tp = typeof p.torrent_progress === "number" ? p.torrent_progress : 0;
        if (tp > (lastTorrentVal[gameId] ?? -1)) {
          lastTorrentVal[gameId] = tp;
          lastTorrentAt[gameId] = now;
        }
        const stalledSecs = (now - (lastProgressAt[gameId] ?? now)) / 1000;
        // Data is arriving for the torrent even if none of it has landed in
        // this game's file yet - so this is a wait, not a fault.
        //
        // Two signals, because torrent progress also moves in whole pieces: at
        // 50 KB/s an 8 MB piece takes over two minutes, so on a slow line the
        // per-piece signal goes quiet exactly like a real stall. The session
        // byte rate is continuous and settles it.
        const pieceAdvanced = (now - (lastTorrentAt[gameId] ?? now)) / 1000 < STALL_HINT_SECS;
        const bytesFlowing = (transferStats()?.download_bps ?? 0) >= 1024;
        const receiving = pieceAdvanced || bytesFlowing;
        const pct = `${(safeProgress * 100).toFixed(0)}%`;
        let status = pct;
        if (stalledSecs >= STALL_HINT_SECS && receiving) {
          status = `${pct} - fetching a shared data block…`;
        } else if (stalledSecs >= STALL_WARN_SECS) {
          status = `Stalled at ${pct} - no data received. Check your connection, or cancel and retry.`;
        } else if (stalledSecs >= STALL_HINT_SECS) {
          status = safeProgress === 0 ? "Looking for peers…" : `${pct} - waiting for peers…`;
        }
        setDownloads((prev) => ({
          ...prev,
          [gameId]: {
            status,
            progress: safeProgress,
            downloading: true,
            title: titles[gameId],
          },
        }));
      }
    } catch (e) {
      console.error(`[downloads] poll error for game ${gameId}:`, e);
    } finally {
      if (pollInFlight[gameId] === attempt) {
        delete pollInFlight[gameId];
      }
    }
  }, 1000);

  intervals[gameId] = interval;

  if (resumeInstalled) { return; }

  // Fire download command
  downloadGame(gameId).then(() => {
    if (attempts[gameId] !== attempt) { return; }
    commandPending[gameId] = false;
  }).catch((e) => {
    if (attempts[gameId] !== attempt) { return; }
    clearInterval(interval);
    delete intervals[gameId];
    delete stuckSince[gameId];
    delete maxProgress[gameId];
    delete nullPollCount[gameId];
    delete commandPending[gameId];
    delete lastProgressAt[gameId];
    delete lastProgressVal[gameId];
    delete announcedInstalled[gameId];
    setDownloads((prev) => ({
      ...prev,
      [gameId]: { status: `Error: ${e}`, progress: 0, downloading: false, title: titles[gameId] },
    }));
    showToast(
      titles[gameId] ? `Couldn't start download: ${titles[gameId]}` : "Couldn't start download",
      "error",
      { detail: String(e) },
    );
    delete titles[gameId];
  });
}

/** Stop any polling/UI state for a game regardless of phase - used by
 *  uninstall, which may run during the extras phase where downloading is
 *  false but a poll interval is still alive (it would otherwise resurrect a
 *  phantom stuck/failed card for the freshly uninstalled game). */
export function stopGameDownloadTracking(gameId: number) {
  attempts[gameId] = (attempts[gameId] ?? 0) + 1;
  clearInterval(intervals[gameId]);
  delete intervals[gameId];
  delete pollInFlight[gameId];
  delete stuckSince[gameId];
  delete maxProgress[gameId];
  delete nullPollCount[gameId];
  delete commandPending[gameId];
  delete lastProgressAt[gameId];
  delete lastProgressVal[gameId];
  delete announcedInstalled[gameId];
  delete titles[gameId];
  setDownloads((prev) => {
    if (!prev[gameId]) { return prev; }
    const next = { ...prev };
    delete next[gameId];
    return next;
  });
}

/** Stop tracking every in-flight download and report how many there were.
 *  Going offline drops the torrent managers, after which `getDownloadProgress`
 *  returns null forever - the poll loop would read that as the silent-stuck
 *  bug and label a perfectly healthy download "Download didn't start". The
 *  torrent selection stays in the DB, so switching back online resumes it. */
export function stopAllDownloadTracking(): number {
  const active = Object.keys(downloads()).map(Number).filter((id) => downloads()[id]?.downloading);
  for (const id of active) {
    stopGameDownloadTracking(id);
  }
  return active.length;
}

/** Restart-resume for the extras phase: an installed game whose GameData
 *  was still downloading when the app quit resumes invisibly (librqbit
 *  session restore) - poll it so the phase stays visible and the completion
 *  refresh fires. No-op when a tracker already exists or extras are done. */
export async function watchExtrasIfPending(gameId: number, title?: string) {
  if (intervals[gameId] || getDownloadState(gameId)) { return; }
  try {
    const p = await getDownloadProgress(gameId);
    if (!p || !p.installed || p.extras_done !== false) { return; }
  } catch { return; }
  startGameDownload(gameId, title, true);
}

export async function cancelGameDownload(gameId: number) {
  attempts[gameId] = (attempts[gameId] ?? 0) + 1; // invalidate in-flight handlers
  delete announcedInstalled[gameId];
  clearInterval(intervals[gameId]);
  delete intervals[gameId];
  delete pollInFlight[gameId];
  delete stuckSince[gameId];
  delete maxProgress[gameId];
  delete nullPollCount[gameId];
  delete commandPending[gameId];
  delete lastProgressAt[gameId];
  delete lastProgressVal[gameId];
  delete titles[gameId];
  setDownloads((prev) => {
    const next = { ...prev };
    delete next[gameId];
    return next;
  });
  const generation = attempts[gameId];
  try {
    await cancelDownload(gameId);
    // Second sweep: cancel_download can take seconds (deselect + session
    // bookkeeping), and anything that wrote the store in the meantime would
    // otherwise leave a card behind. Skipped when a new download for the same
    // game started while this was running - that one owns the entry now.
    if (attempts[gameId] === generation) {
      setDownloads((prev) => {
        if (!prev[gameId]) { return prev; }
        const next = { ...prev };
        delete next[gameId];
        return next;
      });
    }
    refreshLoadedGames();
  } catch {}
}
