import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import { ManualViewer } from "./ManualViewer";

const mockInvoke = vi.mocked(invoke);
const desktopUserAgent = navigator.userAgent;

function mount(kind: "pdf" | "txt" | "html" | "image" | "external", path: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => (
    <ManualViewer path={path} kind={kind} open={true} onClose={() => {}} />
  ), host);
  return dispose;
}

describe("ManualViewer on Android", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: desktopUserAgent,
    });
  });

  it("does not send a PDF to Android WebView's blank iframe", () => {
    const dispose = mount("pdf", "/storage/manual.pdf");

    expect(document.querySelector("iframe")).toBeNull();
    expect(document.body.textContent).toContain(
      "PDF manuals open in an installed PDF reader on Android.",
    );
    dispose();
  });

  it("renders image manuals inside the app", () => {
    const dispose = mount("image", "/storage/manual.jpg");
    const image = document.querySelector("img.manual-viewer-image");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("asset:///storage/manual.jpg");
    dispose();
  });

  it("routes Office and RTF manuals to a compatible document reader", () => {
    const dispose = mount("external", "/storage/manual.doc");

    expect(document.querySelector("iframe")).toBeNull();
    expect(document.body.textContent).toContain(
      "This manual format needs a compatible document reader.",
    );
    dispose();
  });

  it("shows document-launch failures instead of leaving a white screen", async () => {
    mockInvoke.mockRejectedValue("No compatible PDF reader is installed");
    const dispose = mount("pdf", "/storage/manual.pdf");
    const open = [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Open in PDF reader"));

    open?.click();
    await vi.waitFor(() => {
      expect(document.querySelector(".manual-viewer-error")?.textContent)
        .toContain("No compatible PDF reader is installed");
    });
    expect(mockInvoke).toHaveBeenCalledWith("open_manual", { path: "/storage/manual.pdf" });
    dispose();
  });
});
