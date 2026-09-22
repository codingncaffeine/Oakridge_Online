/** Length of one game tick. Every server-side action resolves on a tick boundary. */
export const TICK_MS = 600;

/** Clients are told about entities within this many tiles (Chebyshev distance). */
export const VIEW_DISTANCE = 15;

/** Character names: 1–12 characters of letters, digits, spaces, hyphens or underscores. */
export const MAX_NAME_LENGTH = 12;

/** WebSocket endpoint path, on the same host as the page. */
export const WS_PATH = "/ws";

/** Appearance slots and how many choices each has: skin, hair, top, legs, feet. */
export const LOOK_SIZES = [4, 6, 8, 6, 4] as const;
