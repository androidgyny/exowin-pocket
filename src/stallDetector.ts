import { createSignal, createEffect, onCleanup } from "solid-js";

/** Seconds of no movement before a progress bar switches to the indeterminate
 *  sweep. Deliberately long: torrent file progress lands one whole piece at a
 *  time, so a healthy download is bursty - several flat seconds, then a jump.
 *  At the original 3s the bar oscillated between the real value and the sweep
 *  for the entire download. 15s matches STALL_HINT_SECS in stores/downloads.ts,
 *  so the sweep starts at the same moment the status text says "waiting for
 *  peers…" instead of contradicting it. */
export const STALL_MS = 15000;

/** Signal that flips true when `value` hasn't changed for `stallMs`, and back
 *  to false on the next change. Never fires once the value reaches 1 - a
 *  finished transfer waiting on extraction is not stalled. */
export function createStallDetector(value: () => number, stallMs = STALL_MS) {
  const [stalled, setStalled] = createSignal(false);
  let lastValue = value();
  let lastChangeAt = Date.now();

  createEffect(() => {
    const v = value();
    if (v !== lastValue) {
      lastValue = v;
      lastChangeAt = Date.now();
      setStalled(false);
    }
  });

  const id = setInterval(() => {
    if (value() < 1 && Date.now() - lastChangeAt > stallMs) {
      setStalled(true);
    }
  }, 500);
  onCleanup(() => clearInterval(id));

  return stalled;
}
