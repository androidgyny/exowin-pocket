import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import { WelcomeModal } from "./WelcomeModal";

const mockInvoke = vi.mocked(invoke);
const startInstall = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../stores/contentPacks", () => ({
  startContentPackInstall: (...args: unknown[]) => startInstall(...args),
}));

const PACK = {
  id: "posters",
  display_name: "Box Art",
  description: "HD covers",
  size_bytes: 396_948_419,
  version: 5,
  supersedes: [],
  available: true,
  installed: false,
  installed_version: null,
};

async function flush() {
  for (let i = 0; i < 20; i++) { await Promise.resolve(); }
}

describe("WelcomeModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    startInstall.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("closes quietly when existing box art was already adopted", async () => {
    const onClose = vi.fn();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_content_packs") { return [{ ...PACK, installed: true, installed_version: 5 }]; }
      if (cmd === "set_config") { return null; }
      return null;
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <WelcomeModal open onClose={onClose} />, host);
    await flush();

    expect(document.body.textContent).not.toContain("Box Art");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("set_config", { key: "welcome_seen", value: "1" });
    expect(startInstall).not.toHaveBeenCalled();
    dispose();
  });

  it("offers only installable packs", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_content_packs") {
        return [
          { ...PACK, installed: true, installed_version: 5 },
          { ...PACK, id: "metadata", display_name: "Game Metadata", installed: false, available: false },
          { ...PACK, id: "posters-v2", display_name: "Updated Box Art", installed: false },
        ];
      }
      if (cmd === "set_config") { return null; }
      return null;
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <WelcomeModal open onClose={() => {}} />, host);
    await flush();

    expect(document.body.textContent).toContain("Updated Box Art");
    expect(document.body.textContent).not.toContain("Game Metadata");
    dispose();
  });
});
