import { createConfigSignal, KEY_LIST_CODEC } from "./configSignal";

/**
 * Compatibility notes the user has told us they have read.
 *
 * Dismissal is keyed by the note's KIND, not by game: "tuned for DOSBox ECE"
 * is the same sentence on ~2,000 titles, and answering it once per game would
 * be a worse experience than not offering it at all.
 */
const dismissed = createConfigSignal<string[]>(
  "dismissed_notes",
  [],
  KEY_LIST_CODEC.parse,
  KEY_LIST_CODEC.serialize,
);

export const ensureDismissedNotesLoaded = dismissed.ensureLoaded;

/** False until the stored list has arrived, so a note the user silenced weeks
 *  ago does not flash on the first panel open of a session. */
export const dismissedNotesLoaded = dismissed.loaded;

export function isNoteDismissed(key: string): boolean {
  return dismissed.value().includes(key);
}

export async function dismissNote(key: string): Promise<void> {
  await dismissed.set([...dismissed.value(), key]);
}
