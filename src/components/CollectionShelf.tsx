import { For, Show } from "solid-js";

export interface ShelfCollection {
  id: string;
  label: string;
  count: number;
  /** Overrides the "<count> games" line when set (the All card shows
   *  "<n> collections" - a row-count sum would double-count LP variants). */
  sub?: string;
}

interface Props {
  collections: ShelfCollection[];
  active: string;
  onSelect: (id: string) => void;
}

/** Dominant box color per collection - drives the card's ambient glow and the
 *  active ring, so each collection lights up in its own tint. */
const ACCENT: Record<string, string> = {
  eXoDOS: "#c19a5f",
  eXoDOS_GLP: "#d23c2a",
  eXoDOS_PLP: "#d04338",
  eXoDOS_SLP: "#4a6bd6",
  eXoWin3x: "#e0442e",
  eXoWin9x: "#c99a45",
};

/** Card titles: the shelf shows the count right below, so "German Language
 *  Pack" carries no information "German" doesn't. */
const shortLabel = (label: string) => label.replace(" Language Pack", "");

const initials = (label: string) =>
  shortLabel(label)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

const ALL_TILES = ["DOS", "GLP", "SLP", "9X"];

const cover = (col: ShelfCollection) => {
  if (col.id === "") {
    return (
      <span class="collection-cover collection-cover-all">
        <For each={ALL_TILES}>{(tile) => <span>{tile}</span>}</For>
      </span>
    );
  }
  return (
    <span class="collection-cover collection-cover-fallback">
      {initials(col.label)}
    </span>
  );
};

/** Horizontal rail of collection boxes above the Browse grid - one card per
 *  collection. The active box is lit in its own accent color and lifted off
 *  the shelf. */
export function CollectionShelf(props: Props) {
  return (
    <div class="collection-shelf" role="group" aria-label="Collections">
      <For each={props.collections}>
        {(col) => (
          <button
            class={`collection-card ${props.active === col.id ? "active" : ""}`}
            style={{ "--card-accent": ACCENT[col.id] ?? "#7c5cfc" }}
            onClick={() => props.onSelect(col.id)}
            title={col.label}
          >
            <span class="collection-cover-wrap">{cover(col)}</span>
            <span class="collection-card-name">{shortLabel(col.label)}</span>
            <span class="collection-card-count">
              <Show when={!col.sub} fallback={col.sub}>
                <b>{col.count.toLocaleString()}</b> games
              </Show>
            </span>
          </button>
        )}
      </For>
    </div>
  );
}
