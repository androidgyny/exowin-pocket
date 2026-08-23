import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import type { Game } from "../api/tauri";
import { GameDetailPanel } from "./GameDetailPanel";

const mockInvoke = vi.mocked(invoke);

/** Minimal row shaped like the merged card the grid hands to the panel. */
function makeGame(over: Partial<Game> = {}): Game {
  return {
    id: 1,
    title: "Magic Carpet Plus",
    sort_title: "Magic Carpet Plus",
    platform: "MS-DOS",
    developer: "Bullfrog Productions, Ltd.",
    publisher: "Electronic Arts, Inc.",
    release_date: null,
    year: 1995,
    genre: "Action;Flight Simulator",
    series: "Magic Carpet series",
    play_mode: "Single Player",
    rating: 5,
    description: "English description text.",
    notes: null,
    source: null,
    application_path: null,
    dosbox_conf: null,
    status: null,
    region: null,
    max_players: 8,
    language: "EN",
    shortcode: "MagCarp",
    torrent_source: "eXoDOS",
    in_library: false,
    installed: false,
    game_torrent_index: 10,
    gamedata_torrent_index: null,
    download_size: 268_000_000,
    has_thumbnail: true,
    dosbox_variant: null,
    favorited: false,
    thumbnail_key: "abc123",
    manual_path: "Manuals\\MS-DOS\\Magic Carpet Plus (1995).pdf",
    last_played: null,
    available_languages: null,
    ...over,
  } as Game;
}

const EMPTY_META = { manual_path: null, manual_kind: null, images: [], thumbnails: [] };
const VIDEO_READY = {
  phase: "ready", progress: 1, total_bytes: 2_000_000,
  path: "/data/content/videocache/eXoDOS_1.mp4", error: null,
};

/** Render into a detached container and return it plus a disposer. Solid's
 *  render() flushes effects, so anything that throws at effect time (a helper
 *  used before its `const` is initialised, say) surfaces here - which is
 *  exactly what type-checking cannot catch. */
function mount(game: Game) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <GameDetailPanel game={game} onClose={() => {}} />, host);
  return { host, dispose };
}

describe("GameDetailPanel", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    vi.spyOn(window.HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      });
    vi.spyOn(window.HTMLMediaElement.prototype, "pause")
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event("pause"));
      });
    vi.spyOn(window.HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_game_metadata") { return EMPTY_META; }
      if (cmd === "get_game_variants") { return []; }
      return null;
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  // The panel asks for a video 400ms after settling on a game and then lets
  // the cover hold the hero for another two seconds before playing it.
  // Reproduces "no video plays at all".
  it("shows the preview video once the backend reports it ready", async () => {
    vi.useFakeTimers();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_game_metadata") { return EMPTY_META; }
      if (cmd === "get_game_variants") { return []; }
      if (cmd === "start_game_video") { return VIDEO_READY; }
      if (cmd === "get_video_status") { return VIDEO_READY; }
      return null;
    });

    const { host, dispose } = mount(makeGame({ id: 42, shortcode: "VID42" }));
    await vi.advanceTimersByTimeAsync(3200);

    const video = host.ownerDocument.querySelector("video.game-detail-hero-video");
    expect(video, "the hero video element should be mounted").not.toBeNull();
    expect(video?.getAttribute("src") ?? "").toContain("videocache");
    // The cover crossfades out only once playback actually started.
    expect(video?.className).toContain("is-visible");
    // Previews carry sound. Re-adding `muted` to buy back autoplay would take
    // it away silently - the muted retry in the effect is the fallback path.
    expect((video as HTMLVideoElement | null)?.muted).toBe(false);
    dispose(); host.remove();
  });

  it("waits for the playable video URL before spending autoplay", async () => {
    vi.useFakeTimers();
    const play = vi.mocked(window.HTMLMediaElement.prototype.play);
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_game_metadata") { return EMPTY_META; }
      if (cmd === "get_game_variants") { return []; }
      if (cmd === "start_game_video") { return VIDEO_READY; }
      if (cmd === "get_video_status") { return VIDEO_READY; }
      if (cmd === "media_url") {
        return new Promise((resolve) => setTimeout(() => resolve("http://127.0.0.1:49152/m/video"), 1000));
      }
      return null;
    });

    const { host, dispose } = mount(makeGame({ id: 43, shortcode: "VID43" }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(play).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);
    expect(play).toHaveBeenCalledTimes(1);
    expect(host.ownerDocument.querySelector("video.game-detail-hero-video")?.getAttribute("src"))
      .toContain("127.0.0.1");

    dispose(); host.remove();
  });

  it("stops the preview video before launching a game", async () => {
    vi.useFakeTimers();
    vi.spyOn(window.navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Linux; Android 10)");
    const pause = vi.mocked(window.HTMLMediaElement.prototype.pause);
    const load = vi.mocked(window.HTMLMediaElement.prototype.load);

    let host: HTMLElement | undefined;
    let previewSrcAtLaunch: string | null | undefined;
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_game_metadata") { return EMPTY_META; }
      if (cmd === "get_game_variants") { return []; }
      if (cmd === "start_game_video") { return VIDEO_READY; }
      if (cmd === "get_video_status") { return VIDEO_READY; }
      if (cmd === "launch_game") {
        previewSrcAtLaunch = host?.ownerDocument
          .querySelector("video.game-detail-hero-video")
          ?.getAttribute("src");
        return "ok";
      }
      return null;
    });

    const mounted = mount(makeGame({ id: 44, installed: true, shortcode: "VID44" }));
    host = mounted.host;
    await vi.advanceTimersByTimeAsync(3200);

    const video = host.ownerDocument.querySelector("video.game-detail-hero-video");
    expect(video?.getAttribute("src") ?? "").toContain("videocache");

    const playButton = [...host.ownerDocument.querySelectorAll("button")]
      .find((b) => (b.textContent ?? "").includes("Play")) as HTMLButtonElement | undefined;
    expect(playButton, "installed games should show Play").toBeTruthy();

    playButton!.click();
    await Promise.resolve();

    expect(previewSrcAtLaunch).toBeNull();
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("launch_game", { id: 44 });
    mounted.dispose(); host.remove();
  });

  it("renders a single-language game without throwing", async () => {
    const { host, dispose } = mount(makeGame());
    await Promise.resolve();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Magic Carpet Plus");
    expect(text).toContain("English description text.");
    expect(text).toContain("Bullfrog Productions, Ltd.");
    dispose();
    host.remove();
  });

  it("shows the DOSBox Pure settings notice for eXoWin games on Android", async () => {
    vi.spyOn(window.navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Linux; Android 14)");

    const { host, dispose } = mount(makeGame({
      torrent_source: "eXoWin3x",
      dosbox_variant: "ece",
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain("RetroArch's Quick Menu → Core Options");
    expect(document.body.textContent).not.toContain("tuned for DOSBox ECE");
    dispose();
    host.remove();
  });

  it("offers Download for an uninstalled game and Play once installed", async () => {
    const a = mount(makeGame());
    await Promise.resolve();
    expect(document.body.textContent).toContain("Download");
    a.dispose(); a.host.remove();
    document.body.innerHTML = "";

    const b = mount(makeGame({ installed: true }));
    await Promise.resolve();
    expect(document.body.textContent).toContain("Play");
    b.dispose(); b.host.remove();
  });

  /** The action bar carries only the primary action and the manual; the rest
   *  moved behind the ⋯ control, so every menu item is reached through it. */
  const openMore = async (host: HTMLElement) => {
    const more = [...host.ownerDocument.querySelectorAll("button")]
      .find((b) => b.className.includes("btn-more"));
    expect(more, "the overflow control should be offered").toBeTruthy();
    more!.click();
    await Promise.resolve();
  };

  const menuItem = (host: HTMLElement, text: string) =>
    [...host.ownerDocument.querySelectorAll("button.context-menu-item")]
      .find((b) => (b.textContent ?? "").includes(text)) as HTMLButtonElement | undefined;

  // Reset throws away savegames, so a single stray click must not do it.
  it("only resets game data on the second click", async () => {
    const { host, dispose } = mount(makeGame({ installed: true }));
    await Promise.resolve();
    await openMore(host);

    const button = menuItem(host, "Reset game data");
    expect(button, "installed games should offer Reset").toBeTruthy();

    button!.click();
    await Promise.resolve();
    expect(mockInvoke).not.toHaveBeenCalledWith("reset_game_data", expect.anything());
    expect(menuItem(host, "Discard all game data?")).toBeTruthy();

    menuItem(host, "Discard all game data?")!.click();
    await Promise.resolve();
    expect(mockInvoke).toHaveBeenCalledWith("reset_game_data", { id: 1 });
    dispose(); host.remove();
  });

  it("does not offer Reset for a game that is not installed", async () => {
    const { host, dispose } = mount(makeGame({ installed: false }));
    await Promise.resolve();
    await openMore(host);
    expect(menuItem(host, "Reset game data")).toBeUndefined();
    dispose(); host.remove();
  });

  /// Favouriting is frequent and reversible, so it belongs in the bar - it
  /// was reachable from the grid but nowhere in the panel.
  it("offers a favourite toggle in the action bar", async () => {
    const { host, dispose } = mount(makeGame({ installed: true }));
    await Promise.resolve();
    const star = [...host.ownerDocument.querySelectorAll("button")]
      .find((b) => b.className.includes("btn-fav"));
    expect(star, "the panel should offer a favourite toggle").toBeTruthy();

    star!.click();
    await Promise.resolve();
    expect(mockInvoke).toHaveBeenCalledWith("toggle_favorite", { id: 1 });
    dispose(); host.remove();
  });

  /// The bar is down to the primary action plus the manual. Reset and
  /// Uninstall sitting next to Play is what made it a wall of five.
  it("keeps destructive actions out of the action bar", async () => {
    const { host, dispose } = mount(makeGame({ installed: true }));
    await Promise.resolve();
    const bar = host.ownerDocument.querySelector(".game-detail-actions");
    const labels = [...(bar?.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent ?? "").join(" | ");
    expect(labels).not.toContain("Uninstall");
    expect(labels).not.toContain("Reset");
    expect(labels).not.toContain("Playlist");
    dispose(); host.remove();
  });

  // The header names the row every button acts on. PL/ES variants carry
  // genuinely different titles, so showing the English one while DE is
  // selected would misidentify what Play/Uninstall would touch.
  it("titles the panel after the selected variant", async () => {
    const variants: Game[] = [
      makeGame({ id: 1, shortcode: "OFFICE", language: "EN", title: "The Office", installed: false }),
      makeGame({ id: 2, shortcode: "OFFICE", language: "DE", title: "Das Amt", installed: true }),
    ];
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_game_variants") { return variants; }
      if (cmd === "get_game_metadata") { return EMPTY_META; }
      return null;
    });

    const { host, dispose } = mount(makeGame({
      shortcode: "OFFICE", title: "The Office", available_languages: "EN:0,DE:2",
    }));
    await new Promise((r) => setTimeout(r, 0));

    expect(host.ownerDocument.querySelector(".game-detail-title")?.textContent).toBe("Das Amt");
    dispose();
    host.remove();
  });

  it("shows one chip per language and selects the installed variant", async () => {
    const variants: Game[] = [
      makeGame({ id: 1, language: "EN", installed: false }),
      makeGame({ id: 2, language: "DE", installed: true, description: null, manual_path: null,
                 torrent_source: "eXoDOS_GLP", developer: null, publisher: null }),
    ];
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_game_variants") { return variants; }
      if (cmd === "get_game_metadata") { return EMPTY_META; }
      return null;
    });

    const { host, dispose } = mount(makeGame({ available_languages: "EN:0,DE:2" }));
    // Variants arrive from an awaited invoke, so let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 0));

    const chips = host.ownerDocument.querySelectorAll(".variant-chip");
    expect(chips.length).toBe(2);
    const selectedChip = host.ownerDocument.querySelector(".variant-chip.is-selected");
    // DE is installed, so it wins the default selection over the EN row.
    expect(selectedChip?.textContent).toContain("DE");

    const text = document.body.textContent ?? "";
    // DE has no text of its own - the English one is shown, and labelled.
    expect(text).toContain("English description text.");
    expect(text).toContain("no German text");
    // Fields fall back to the English row rather than rendering blank.
    expect(text).toContain("Bullfrog Productions, Ltd.");
    dispose();
    host.remove();
  });
});
