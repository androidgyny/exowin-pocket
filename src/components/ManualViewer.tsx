import { createSignal, createEffect, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Dialog } from "@ark-ui/solid/dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openManual } from "../api/tauri";

interface ManualViewerProps {
  path: string | null;
  kind: "pdf" | "txt" | "html" | "image" | "external" | null;
  open: boolean;
  onClose: () => void;
}

export function ManualViewer(props: ManualViewerProps) {
  const [txt, setTxt] = createSignal<string | null>(null);
  const [txtErr, setTxtErr] = createSignal(false);
  const [openErr, setOpenErr] = createSignal("");
  const [imageErr, setImageErr] = createSignal(false);
  const [zoom, setZoom] = createSignal(1.0);

  createEffect(() => {
    if (!props.open) { return; }
    setZoom(1.0);
    setOpenErr("");
    setImageErr(false);
    setTxt(null);
    setTxtErr(false);
    if (props.kind !== "txt" || !props.path) { return; }
    fetch(convertFileSrc(props.path))
      .then((r) => {
        if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
        return r.text();
      })
      .then(setTxt)
      .catch(() => setTxtErr(true));
  });

  const filename = () => props.path ? props.path.split("/").pop() ?? "Manual" : "Manual";
  const iframeSrc = () => props.path ? convertFileSrc(props.path) : "";

  // Neither WebKitGTK nor Android System WebView includes a PDF renderer. An
  // iframe succeeds as navigation but paints an empty white document.
  const isAndroid = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
  const isLinux = typeof navigator !== "undefined"
    && /Linux/.test(navigator.userAgent)
    && !isAndroid;
  const inlinePdf = () => props.kind === "pdf" && !isLinux && !isAndroid;
  const needsExternalViewer = () =>
    props.kind === "external" || (props.kind === "pdf" && !inlinePdf());
  const externalLabel = () => props.kind === "pdf"
    ? "Open in PDF reader"
    : props.kind === "external"
      ? "Open document"
      : "Open externally";
  const externalMessage = () => props.kind === "external"
    ? "This manual format needs a compatible document reader."
    : isAndroid
      ? "PDF manuals open in an installed PDF reader on Android."
      : "Inline PDF preview isn't available on Linux.";

  const zoomIn = () => setZoom((z) => Math.min(3.0, z + 0.25));
  const zoomOut = () => setZoom((z) => Math.max(0.5, z - 0.25));
  const zoomReset = () => setZoom(1.0);
  const zoomPct = () => `${Math.round(zoom() * 100)}%`;

  const handleOpenExternal = async () => {
    if (!props.path) { return; }
    setOpenErr("");
    try {
      await openManual(props.path);
    } catch (e) {
      console.error("openManual failed:", e, "path:", props.path);
      setOpenErr(String(e));
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
            <button class="manual-viewer-btn" onClick={handleOpenExternal} title={externalLabel()}>
              ↗ {externalLabel()}
            </button>
            <button class="manual-viewer-close" onClick={props.onClose} title="Close (Esc)">✕</button>
          </div>

          <div class="manual-viewer-body">
            <Show when={needsExternalViewer()}>
              <div class="manual-viewer-loading">
                <p>{externalMessage()}</p>
                <button class="manual-viewer-btn" onClick={handleOpenExternal}>
                  ↗ {externalLabel()}
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
            <Show when={props.kind === "image"}>
              <Show when={!imageErr()} fallback={
                <div class="manual-viewer-loading">Failed to load image manual.</div>
              }>
                <div class="manual-viewer-image-wrap">
                  <img
                    class="manual-viewer-image"
                    src={iframeSrc()}
                    alt={filename()}
                    onError={() => setImageErr(true)}
                  />
                </div>
              </Show>
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
            <Show when={!!openErr()}>
              <div class="manual-viewer-error">{openErr()}</div>
            </Show>
          </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
    </Show>
  );
}
