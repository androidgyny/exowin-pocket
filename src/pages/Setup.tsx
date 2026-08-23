import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { Progress } from "@ark-ui/solid/progress";
import {
  androidStorageStatus,
  getDefaultDataDir,
  getAvailableCollections,
  setConfig,
  initDownloadManager,
  requestAndroidStoragePermissions,
  type AndroidStoragePermissionStatus,
} from "../api/tauri";
import type { NetworkMode } from "../stores/network";
import { Button } from "../components/Button";
import { Toggle } from "../components/Toggle";
import exodiumIcon from "../assets/exodium-icon.png";

interface SetupProps {
  onComplete: () => void;
}

type Phase = "permissions" | "mode" | "scratch" | "network" | "starting";

const IconDownload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const IconBack = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);

export function Setup(props: SetupProps) {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const [phase, setPhase] = createSignal<Phase>(isAndroid ? "permissions" : "mode");
  const [error, setError] = createSignal("");
  const [storagePermission, setStoragePermission] =
    createSignal<AndroidStoragePermissionStatus | null>(null);
  const [permissionBusy, setPermissionBusy] = createSignal(false);

  // "scratch" phase state
  const [dataDir, setDataDir] = createSignal("");

  // "network" phase state. The seeding box is pre-checked - sharing keeps the
  // swarm alive - but it is shown with its implications spelled out and can be
  // unchecked before setup finishes, so nobody uploads without having seen it.
  const [netMode, setNetMode] = createSignal<NetworkMode>("live");
  const [seeding, setSeeding] = createSignal(true);

  const refreshAndroidStoragePermission = async () => {
    if (!isAndroid) { return true; }
    try {
      const status = await androidStorageStatus();
      setStoragePermission(status);
      if (status.granted && phase() === "permissions") {
        setPhase("mode");
      }
      return status.granted;
    } catch (e) {
      setError(`Could not check Android storage access: ${e}`);
      return false;
    }
  };

  const handleStoragePermissionRequest = async () => {
    setPermissionBusy(true);
    setError("");
    try {
      const result = await requestAndroidStoragePermissions();
      setStoragePermission(result.status);
      if (result.status.granted) {
        setPhase("mode");
      } else if (result.openedSettings) {
        setError("Turn on storage access in Android Settings, then return to ExoWin Pocket.");
      } else {
        setError("Storage access is still off. ExoWin Pocket needs it to create downloads and artwork.");
      }
    } catch (e) {
      setError(`Could not request Android storage access: ${e}`);
    } finally {
      setPermissionBusy(false);
    }
  };

  onMount(async () => {
    try {
      const dir = await getDefaultDataDir();
      if (dir) { setDataDir(dir); }
    } catch {}
    await refreshAndroidStoragePermission();
  });

  if (isAndroid) {
    const recheck = () => { void refreshAndroidStoragePermission(); };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    onCleanup(() => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    });
  }

  const handleSelectDataDir = async () => {
    const selected = await open({
      title: "Select Exodium data folder",
      directory: true,
    });
    if (selected) { setDataDir(selected as string); }
  };

  const goToNetwork = () => {
    setNetMode("live");
    setError("");
    setPhase("network");
  };

  const handleNetworkContinue = async () => {
    setError("");
    const offline = netMode() === "offline";
    try {
      await setConfig("network_mode", offline ? "offline" : "live");
      await setConfig("seeding_enabled", !offline && seeding() ? "1" : "0");
    } catch (e) {
      setError(`Failed to save network settings: ${e}`);
      return;
    }
    await runScratchSetup();
  };

  const runScratchSetup = async () => {
    if (!dataDir()) { return; }
    setPhase("starting");
    try {
      let collectionsCSV: string;
      if (isAndroid) {
        collectionsCSV = "eXoWin3x";
      } else {
        const available = await getAvailableCollections();
        collectionsCSV = available.map((c) => c.id).join(",");
      }
      await setConfig("data_dir", dataDir());
      await setConfig("collections", collectionsCSV);
      await initDownloadManager();
      props.onComplete();
    } catch (e) {
      setError(`Failed to initialize: ${e}`);
      setPhase("network");
    }
  };

  const previewPath = () => {
    const dir = dataDir();
    if (!dir) { return ""; }
    const sep = dir.includes("\\") ? "\\" : "/";
    return `${dir}${sep}eXoDOS${sep}`;
  };

  return (
    <div class="setup-page">
      <div class="setup-card">
        <img src={exodiumIcon} alt="" class="setup-logo" />
        <h2>Welcome to ExoWin Pocket</h2>

        <Show when={error()}>
          <div class="error" style="margin-bottom:12px">{error()}</div>
        </Show>

        {/* Android storage access */}
        <Show when={phase() === "permissions"}>
          <p class="setup-subtitle">ExoWin Pocket needs storage access before it can create downloads and artwork.</p>
          <div class="setup-step">
            <label>Storage access</label>
            <div class="setup-preview">
              <Show when={storagePermission()?.needsSettings} fallback={
                <>Android will ask for storage access. Allow it to continue setup.</>
              }>
                Android will open Exodium Pocket's storage settings. Turn on file access there, then come back.
              </Show>
            </div>
            <Show when={storagePermission()?.detail}>
              <p class="setup-note">{storagePermission()!.detail}</p>
            </Show>
          </div>
          <div class="setup-actions" style="margin-top:20px">
            <div style="display:flex;gap:8px">
              <Button variant="secondary" onClick={() => void refreshAndroidStoragePermission()} disabled={permissionBusy()}>
                Check Again
              </Button>
              <Button variant="primary" style="flex:1" onClick={handleStoragePermissionRequest} disabled={permissionBusy()}>
                {permissionBusy()
                  ? "Checking..."
                  : storagePermission()?.needsSettings
                    ? "Open Android Settings"
                    : "Allow Storage Access"}
              </Button>
            </div>
          </div>
        </Show>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Mode selection ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Show when={phase() === "mode"}>
          <p class="setup-subtitle">Download Windows 3.x games on demand from the eXoWin3x torrent.</p>
          <div class="setup-mode-grid">
            <button class="setup-mode-btn" onClick={() => { setPhase("scratch"); setError(""); }}>
              <span class="setup-mode-icon"><IconDownload /></span>
              <span class="setup-mode-title">Get Started</span>
              <span class="setup-mode-desc">Choose where ExoWin Pocket stores downloads and artwork</span>
            </button>
          </div>
        </Show>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Start from scratch ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Show when={phase() === "scratch"}>
          <p class="setup-subtitle">Where should ExoWin Pocket keep its data?</p>
          <div class="setup-step">
            <label>Data folder</label>
            <div class="path-picker">
              <Show when={isAndroid} fallback={
                <>
                  <span class="setting-value">{dataDir() || "Not selected"}</span>
                  <Button variant="small" onClick={handleSelectDataDir}>Browse</Button>
                </>
              }>
                <input
                  class="setting-value"
                  style="flex:1;min-width:0;background:transparent;color:inherit;border:1px solid var(--border, #555);padding:7px"
                  value={dataDir()}
                  onInput={(e) => setDataDir(e.currentTarget.value)}
                  aria-label="ExoWin Pocket data directory"
                />
              </Show>
            </div>
            <Show when={dataDir()}>
              <div class="setup-preview">
                ExoWin Pocket creates subfolders here: games go in{" "}
                <strong>{previewPath()}</strong>, covers and caches in{" "}
                <strong>content/</strong> next to it.
              </div>
            </Show>
          </div>
          <p class="setup-note">
            Games are downloaded from the eXoWin3x BitTorrent network, one at a
            time, only when you ask for them.
          </p>
          <div class="setup-actions" style="margin-top:20px">
            <div style="display:flex;gap:8px">
              <Button variant="secondary" onClick={() => setPhase("mode")}>
                <IconBack /> Back
              </Button>
              <Button variant="primary" style="flex:1" onClick={goToNetwork} disabled={!dataDir()}>
                Continue
              </Button>
            </div>
          </div>
        </Show>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Network mode + seeding consent ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Show when={phase() === "network"}>
          <p class="setup-subtitle">How should Exodium use the network?</p>

          <Show when={netMode() === "live"}>
            <div style="margin-top:16px">
              <Toggle
                checked={seeding()}
                onChange={setSeeding}
                label="Share my downloads with other players (seeding)"
                hint="While Exodium runs, it uploads parts of the games you have to other users. That keeps the collection alive - but it also means you are distributing the files, which is a legal risk in some countries."
              />
            </div>
          </Show>

          <p class="setup-note">
            Both settings can be changed any time in Settings ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Network.
          </p>

          <div class="setup-actions" style="margin-top:20px">
            <div style="display:flex;gap:8px">
              <Button variant="secondary" onClick={() => setPhase("scratch")}>
                <IconBack /> Back
              </Button>
              <Button variant="primary" style="flex:1" onClick={handleNetworkContinue}>
                Continue
              </Button>
            </div>
          </div>
        </Show>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Starting (initializing session after scratch setup) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        <Show when={phase() === "starting"}>
          <p class="setup-subtitle">Setting up...</p>
          <div class="setup-step">
            <Progress.Root class="ark-progress">
              <Progress.Track class="ark-progress-track">
                <Progress.Range class="ark-progress-range indeterminate" />
              </Progress.Track>
            </Progress.Root>
          </div>
        </Show>

      </div>
    </div>
  );
}
