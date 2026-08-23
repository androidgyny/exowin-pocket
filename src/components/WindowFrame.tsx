import { createSignal, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();

// macOS uses native traffic-light controls (decorations: true via
// tauri.macos.conf.json). The custom frame is for Linux/Windows only,
// where Tauri runs decorations: false to allow a fully themed shell.
const isMacOS = typeof navigator !== "undefined"
  && /Mac/i.test(navigator.platform || navigator.userAgent || "");

const isAndroid = typeof navigator !== "undefined"
  && /Android/i.test(navigator.userAgent || "");

export function WindowFrame() {
  if (isMacOS || isAndroid) { return null; }

  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    // onCleanup must register synchronously - after an `await` the reactive
    // owner is gone and the cleanup would never run. Keep the promise and
    // unlisten through it instead.
    const unlistenPromise = win.onResized(async () => {
      setMaximized(await win.isMaximized());
    });
    onCleanup(() => { unlistenPromise.then((unlisten) => unlisten()); });
    win.isMaximized().then(setMaximized);
  });

  return (
    <div class="window-frame" data-tauri-drag-region>
      <span class="window-frame-title" data-tauri-drag-region>Exodium</span>
      <div class="window-frame-controls">
        <button
          class="window-frame-btn"
          onClick={() => win.minimize()}
          aria-label="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button
          class="window-frame-btn"
          onClick={() => win.toggleMaximize()}
          aria-label={maximized() ? "Restore" : "Maximize"}
        >
          {maximized() ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" />
              <rect x="0" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" />
            </svg>
          )}
        </button>
        <button
          class="window-frame-btn close"
          onClick={() => win.close()}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0l-10 10" stroke="currentColor" stroke-width="1" /></svg>
        </button>
      </div>
    </div>
  );
}
