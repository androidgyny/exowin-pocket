import { createConfigSignal, BOOL_CODEC } from "./configSignal";

/**
 * Whether preview videos play silently. Global and persistent: the answer is
 * about the person, not about one game, and having to re-mute on every card
 * would be worse than never offering sound at all.
 *
 * Defaults to unmuted - a preview that has to be asked twice for its audio is
 * a preview nobody hears, and the toggle sits on the video itself.
 */
const muted = createConfigSignal<boolean>(
  "preview_muted",
  false,
  BOOL_CODEC.parse,
  BOOL_CODEC.serialize,
);

export const ensurePreviewMutedLoaded = muted.ensureLoaded;
export const previewMuted = muted.value;
export const setPreviewMuted = muted.set;
