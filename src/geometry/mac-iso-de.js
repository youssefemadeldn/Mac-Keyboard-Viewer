// @ts-check
/**
 * Physical geometry of a German ISO Apple keyboard (Magic Keyboard / MacBook).
 *
 * This file describes WHERE keys are, never WHAT they type. Characters come
 * exclusively from layouts captured on the user's machine.
 *
 * Units: 1u = one standard key width. Every row is 14.5u wide.
 * Keys are identified by KeyboardEvent.code.
 */

/**
 * @typedef {Object} KeyDef
 * @property {string} code        KeyboardEvent.code
 * @property {number} w           width in u
 * @property {number} [h]         height in rows (default 1; ISO Enter = 2, half-height arrows = 0.5)
 * @property {number} [x]         explicit x in u (otherwise packed after previous key)
 * @property {number} [dy]        vertical offset within the row, in rows (for stacked arrows)
 * @property {string} [label]     fixed label for non-character keys
 * @property {'iso-enter'} [shape]
 * @property {boolean} [capture]  true = character key that is part of Capture Mode
 */

/** @typedef {{ keys: KeyDef[] }} RowDef */

/** @param {string} code @param {number} [w] @returns {KeyDef} */
const c = (code, w = 1) => ({ code, w, capture: true });
/** @param {string} code @param {number} w @param {string} label @returns {KeyDef} */
const f = (code, w, label) => ({ code, w, label });

const letters = (s) => [...s].map((ch) => c(`Key${ch}`));

export const GEOMETRY_ID = 'mac-iso-de';
export const GEOMETRY_NAME = 'Apple German ISO (QWERTZ)';
export const WIDTH_U = 14.5;

/** @type {RowDef[]} */
export const ROWS = [
  {
    keys: [
      c('Backquote'),
      ...'1234567890'.split('').map((d) => c(`Digit${d}`)),
      c('Minus'),
      c('Equal'),
      f('Backspace', 1.5, '⌫'),
    ],
  },
  {
    keys: [
      f('Tab', 1.5, '⇥'),
      ...letters('QWERTYUIOP'),
      c('BracketLeft'),
      c('BracketRight'),
      // ISO Enter: 1u wide on top, spans two rows, narrows to 0.75u on the bottom.
      { code: 'Enter', w: 1, h: 2, label: '↩', shape: 'iso-enter' },
    ],
  },
  {
    keys: [
      f('CapsLock', 1.75, '⇪'),
      ...letters('ASDFGHJKL'),
      c('Semicolon'),
      c('Quote'),
      c('Backslash'),
    ],
  },
  {
    keys: [
      f('ShiftLeft', 1.25, '⇧'),
      c('IntlBackslash'),
      ...letters('ZXCVBNM'),
      c('Comma'),
      c('Period'),
      c('Slash'),
      f('ShiftRight', 2.25, '⇧'),
    ],
  },
  {
    keys: [
      f('Fn', 1, 'fn'),
      f('ControlLeft', 1, '⌃'),
      f('AltLeft', 1, '⌥'),
      f('MetaLeft', 1.25, '⌘'),
      c('Space', 5),
      f('MetaRight', 1.25, '⌘'),
      f('AltRight', 1, '⌥'),
      f('ArrowLeft', 1, '←'),
      { code: 'ArrowUp', w: 1, h: 0.5, label: '↑' },
      { code: 'ArrowDown', w: 1, h: 0.5, x: 12.5, dy: 0.5, label: '↓' },
      f('ArrowRight', 1, '→'),
    ],
  },
];

/**
 * Resolved key positions: x/y/w/h in u (y in rows).
 * @typedef {KeyDef & { x: number, y: number, h: number }} PlacedKey
 */

/** @returns {PlacedKey[]} */
export function placeKeys() {
  /** @type {PlacedKey[]} */
  const out = [];
  ROWS.forEach((row, y) => {
    let cursor = 0;
    for (const k of row.keys) {
      const x = k.x ?? cursor;
      out.push({ ...k, x, y: y + (k.dy ?? 0), h: k.h ?? 1 });
      if (k.x === undefined) cursor = x + k.w;
    }
  });
  return out;
}

/** Codes that Capture Mode asks for, in visual order. */
export const CAPTURE_CODES = ROWS.flatMap((r) => r.keys.filter((k) => k.capture).map((k) => k.code));

/** Every code that exists on this keyboard (used to validate imports). */
export const ALL_CODES = new Set(ROWS.flatMap((r) => r.keys.map((k) => k.code)));
