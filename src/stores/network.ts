import { createSignal } from "solid-js";
import { getConfig, initDownloadManager, setConfig } from "../api/tauri";
import { stopAllDownloadTracking } from "./downloads";
import { cancelAllPackJobs } from "./contentPacks";

export type NetworkMode = "live" | "offline";

/** Whether the torrent engine may run at all. "offline" makes Exodium a pure
 *  launcher for games already on disk - no session, no downloads, no sharing.
 *  Mirrors the `network_mode` config key read by the Rust side; an unset key
 *  means "live" so installs from before this setting are unaffected. */
const [networkMode, setNetworkModeSignal] = createSignal<NetworkMode>("live");
export { networkMode };

export const isOffline = () => networkMode() === "offline";

export async function loadNetworkMode() {
  try {
    const stored = await getConfig("network_mode");
    setNetworkModeSignal(stored === "offline" ? "offline" : "live");
  } catch (e) {
    console.warn("[network] failed to load network_mode:", e);
  }
}

export interface ModeSwitchResult {
  /** Torrent downloads whose tracking was stopped. librqbit keeps the file
   *  selection, so these pick up again when the session returns. */
  downloads: number;
  /** Content-pack installs that were cancelled outright - HTTP transfers with
   *  no resume, so the user has to start them again. */
  packs: number;
}

/** Persist the mode and rebuild the torrent state to match it. The config
 *  write MUST land before initDownloadManager() - the backend reads the key
 *  there to decide whether to create a session at all (same invariant as
 *  `collections`). Going offline drops every manager, which releases the last
 *  Arc to the librqbit session and stops all traffic.
 *
 *  Returns what was stopped, so the caller can say so precisely. On failure the
 *  config write is rolled back: leaving the DB claiming one mode while the
 *  session runs in the other is worse than either. */
export async function applyNetworkMode(mode: NetworkMode): Promise<ModeSwitchResult> {
  const previous = networkMode();
  setNetworkModeSignal(mode);
  // Stop trackers BEFORE the managers disappear, or the poll loop sees null
  // progress and reports a failure that never happened.
  // Content packs download over HTTP and would otherwise keep running while
  // the app claims to be offline - the badge would be lying.
  const stopped: ModeSwitchResult = mode === "offline"
    ? { downloads: stopAllDownloadTracking(), packs: await cancelAllPackJobs() }
    : { downloads: 0, packs: 0 };
  try {
    await setConfig("network_mode", mode);
    await initDownloadManager();
    return stopped;
  } catch (e) {
    setNetworkModeSignal(previous);
    try {
      await setConfig("network_mode", previous);
    } catch (rollbackError) {
      console.error("[network] could not roll back network_mode:", rollbackError);
    }
    throw e;
  }
}
