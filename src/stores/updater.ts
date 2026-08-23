import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { showToast } from "./toasts";

const isWindows = typeof navigator !== "undefined"
  && /Win/i.test(navigator.platform || navigator.userAgent || "");

export type UpdateStatus = "available" | "downloading" | "ready";

/** Non-null once a newer release is known. Drives the top-bar pill, which
 *  stays visible until the update is installed - nothing downloads without
 *  the user clicking it. */
const [updateState, setUpdateState] = createSignal<{
  version: string;
  status: UpdateStatus;
} | null>(null);
export { updateState };

let pendingUpdate: Update | null = null;

/** Check GitHub releases for a newer version. Called once at startup;
 *  announces via a toast but never downloads on its own. */
export async function checkForAppUpdate() {
  if (import.meta.env.DEV) { return; }
  try {
    // Tauri's updater only handles AppImage on Linux - offering the pill to
    // deb/rpm installs would download an update that can't be applied.
    const supported = await invoke<boolean>("update_check_supported").catch(() => true);
    if (!supported) { return; }
    const update = await check();
    if (!update) { return; }
    pendingUpdate = update;
    setUpdateState({ version: update.version, status: "available" });
    showToast(`Update available: Exodium ${update.version}`, "info", {
      detail: "Click the Update button in the top bar to install - now or any time later.",
      durationMs: 8000,
    });
  } catch (e) {
    // Offline or no release published yet - never bother the user.
    console.warn("[updater] check failed:", e);
  }
}

/** User clicked the pill: download + stage the update, then offer restart. */
export async function startUpdate() {
  const update = pendingUpdate;
  const state = updateState();
  if (!update || state?.status !== "available") { return; }
  // On Windows the NSIS installer closes the app as part of install - there
  // is no staged "restart when ready" step. Get explicit consent first.
  if (isWindows) {
    const ok = await ask(
      `Exodium will close now to install version ${update.version}. Any running downloads will resume on next start.\n\nInstall the update now?`,
      { title: "Install update", kind: "info" },
    ).catch(() => false);
    if (!ok) { return; }
  }
  setUpdateState({ version: update.version, status: "downloading" });
  try {
    await update.downloadAndInstall();
    setUpdateState({ version: update.version, status: "ready" });
    showToast(`Exodium ${update.version} is ready`, "success", {
      durationMs: 0,
      action: { label: "Restart now", onClick: () => void relaunch() },
    });
  } catch (e) {
    setUpdateState({ version: update.version, status: "available" });
    showToast("Update download failed", "error", { detail: String(e) });
  }
}

export function restartToUpdate() {
  void relaunch();
}
