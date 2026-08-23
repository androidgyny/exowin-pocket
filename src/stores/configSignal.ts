import { createSignal, type Accessor } from "solid-js";
import { getConfig, setConfig } from "../api/tauri";

/**
 * A reactive preference backed by the `config` table.
 *
 * Every one of these wants the same four things, and writing them out per
 * preference is how the second copy drifts from the first:
 *
 *  - a value that is UNKNOWN until the stored one arrives, so nothing renders
 *    on a default the user may have overruled weeks ago (that flash is a bug
 *    `PackHintBanner` had to fix by hand);
 *  - a load that runs at most once per session, however many components ask;
 *  - a write that updates the signal FIRST, so the click holds even if the
 *    config never lands;
 *  - failures that stay silent - a preference is not worth interrupting the
 *    user over, in either direction.
 */
export interface ConfigSignal<T> {
  /** The current value. Equals `fallback` until `ensureLoaded` resolves. */
  value: Accessor<T>;
  /** False until the stored value has arrived. */
  loaded: Accessor<boolean>;
  /** Start the one-time read. Safe to call from every mount. */
  ensureLoaded: () => void;
  /** Update in memory, then persist. Never rejects. */
  set: (next: T) => Promise<void>;
}

export function createConfigSignal<T>(
  key: string,
  fallback: T,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
): ConfigSignal<T> {
  const [value, setValue] = createSignal<T>(fallback);
  const [loaded, setLoaded] = createSignal(false);
  let loading: Promise<void> | null = null;

  const ensureLoaded = () => {
    if (loading) { return; }
    loading = getConfig(key)
      .then((raw) => { setValue(() => parse(raw)); })
      // An unreadable config must not resurrect a choice the user already made.
      .catch(() => { setValue(() => fallback); })
      .finally(() => { setLoaded(true); });
  };

  const set = async (next: T) => {
    setValue(() => next);
    try {
      await setConfig(key, serialize(next));
    } catch {
      // Holds for this session either way; nagging would be worse.
    }
  };

  return { value, loaded, ensureLoaded, set };
}

/** The two shapes actually stored today: a flag, and a set of keys. */
export const BOOL_CODEC = {
  parse: (raw: string | null) => raw === "1",
  serialize: (v: boolean) => (v ? "1" : "0"),
};

export const KEY_LIST_CODEC = {
  parse: (raw: string | null) => (raw ? raw.split(",").filter(Boolean) : []),
  serialize: (v: string[]) => v.join(","),
};
