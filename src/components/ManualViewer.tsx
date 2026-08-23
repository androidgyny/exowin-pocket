import { createSignal, createEffect, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Dialog } from "@ark-ui/solid/dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openManual } from "../api/tauri";

interface ManualViewerProps {
  path: string | null;
  kind: "pdf" | "txt" | "html" | null;
  open: boolean;
  onClose: () => void;
}

export function ManualViewer(props: ManualViewerProps) {
  const [txt, setTxt] = createSignal<string | null>(null);
  const [txtErr, setTxtErr] = createSignal(false);
  const [zoom, setZoom] = createSignal(1.0);

  createEffect(() => {
    if (!props.open) { return; }
    setZoom(1.0);
    if (props.kind !== "txt" || !props.path) { return; }
    setTxt(null);
    setTxtErr(false);
    fetch(convertFileSrc(props.path))
      .then((r) => r.text())
      .then(setTxt)
      .catch(() => setTxtErr(true));
  });

  const filename = () => props.path ? props.path.split("/").pop() ?? "Manual" : "Manual";
  const iframeSrc = () => props.path ? convertFileSrc(props.path) : "";

  // WebKitGTK (the Linux webview) ships no built-in PDF renderer, so a PDF
  // iframe stays blank. Offer the system viewer instead.
  const isLinux = typeof navigator !== "undefined"
    && /Linux/.test(navigator.userAgent)
    && !/Android/.test(navigator.userAgent);
  const inlinePdf = () => props.kind === "pdf" && !isLinux;

  const zoomIn = () => setZoom((z) => Math.min(3.0, z + 0.25));
  const zoomOut = () => setZoom((z) => Math.max(0.5, z - 0.25));
  const zoomReset = () => setZoom(1.0);
  const zoomPct = () => `${Math.round(zoom() * 100)}%`;

  const handleOpenExternal = async () => {
    if (!props.path) { return; }
    try {
      await openManual(props.path);
    } catch (e) {
      console.error("openManual failed:", e, "path:", props.path);
    }
  };

  return (
    <Show when={props.open}>
    <Dialog.Root
      open={props.open}
      onOpenChange={(e) => { if (!e.open) { props.onClose(); } }}
    >
      <Portal>
        <Dialog.Backdrop class="manual-viewer-backdrop" />
        <Dialog.Positioner class="manual-viewer-positioner">
          <Dialog.Content class="manual-viewer-content">
          <div class="manual-viewer-toolbar">
            <Dialog.Title class="manual-viewer-title">{filename()}</Dialog.Title>
            <Show when={inlinePdf()}>
              <div class="manual-viewer-zoom">
                <button class="manual-viewer-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
                <button class="manual-viewer-zoom-pct" onClick={zoomReset} title="Reset zoom">{zoomPct()}</button>
                <button class="manual-viewer-zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
              </div>
            </Show>
            <button class="manual-viewer-btn" onClick={handleOpenExternal} title="Open in system PDF viewer">
              ↗ Open in PDF Viewer
            </button>
            <button class="manual-viewer-close" onClick={props.onClose} title="Close (Esc)">✕</button>
          </div>

          <div class="manual-viewer-body">
            <Show when={props.kind === "pdf" && !inlinePdf()}>
              <div class="manual-viewer-loading">
                <p>Inline PDF preview isn't available on Linux.</p>
                <button class="manual-viewer-btn" onClick={handleOpenExternal}>
                  ↗ Open in system PDF viewer
                </button>
              </div>
            </Show>
            <Show when={inlinePdf() || props.kind === "html"}>
              <div
                class="manual-viewer-iframe-wrap"
                style={{
                  transform: `scale(${zoom()})`,
                  "transform-origin": "top center",
                  width: `${100 / zoom()}%`,
                  height: `${100 / zoom()}%`,
                }}
              >
                <iframe
                  class="manual-viewer-iframe"
                  src={iframeSrc()}
                  sandbox={props.kind === "html" ? "allow-same-origin" : undefined}
                />
              </div>
            </Show>
            <Show when={props.kind === "txt"}>
              <Show when={txt() !== null} fallback={
                <div class="manual-viewer-loading">
                  {txtErr() ? "Failed to load manual." : "Loading…"}
                </div>
              }>
                <pre class="manual-viewer-text">{txt()}</pre>
              </Show>
            </Show>
          </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
    </Show>
  );
}
