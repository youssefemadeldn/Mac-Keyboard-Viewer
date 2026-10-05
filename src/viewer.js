// @ts-check
import { CAPTURE_CODES } from './geometry/mac-iso-de.js';
import { layerFromModifiers } from './schema.js';

/**
 * Viewer state: which layer is displayed and which keys are held.
 * Keyboard events only arrive while the side panel has focus — by design.
 *
 * @typedef {import('./schema.js').Layout} Layout
 * @typedef {import('./schema.js').LayerName} LayerName
 */

export function createViewerState() {
  return {
    physical: { shift: false, alt: false },
    latched: { shift: false, alt: false },
    /** @type {Set<string>} */
    held: new Set(),
  };
}
/** @typedef {ReturnType<typeof createViewerState>} ViewerState */

/**
 * Layer to display. Shift+Option falls back to Option when that layer
 * was not captured.
 * @param {ViewerState} v @param {Layout | null} layout @returns {LayerName}
 */
export function displayedLayer(v, layout) {
  const shift = v.physical.shift || v.latched.shift;
  const alt = v.physical.alt || v.latched.alt;
  const layer = layerFromModifiers(shift, alt);
  if (layer === 'shiftOption' && !Object.keys(layout?.layers.shiftOption ?? {}).length) return 'option';
  return layer;
}

/** @param {ViewerState} v @param {KeyboardEvent} e */
function syncModifiers(v, e) {
  v.physical.shift = e.shiftKey;
  v.physical.alt = e.altKey;
}

/**
 * @param {ViewerState} v @param {KeyboardEvent} e
 * @returns {{ code: string, key: string, layer: LayerName } | null}  a character keypress usable for detection
 */
export function onKeydown(v, e) {
  syncModifiers(v, e);
  v.held.add(e.code);
  if (e.metaKey || e.ctrlKey) return null;
  const isChar = CAPTURE_CODES.includes(e.code);
  // Stop Space from scrolling and Option+key from triggering anything; Tab stays usable.
  if (isChar && !isFormField(e.target)) e.preventDefault();
  if (!isChar || e.repeat) return null;
  return { code: e.code, key: e.key, layer: layerFromModifiers(e.shiftKey, e.altKey) };
}

/** @param {ViewerState} v @param {KeyboardEvent} e */
export function onKeyup(v, e) {
  syncModifiers(v, e);
  v.held.delete(e.code);
  // macOS swallows keyup for other keys while ⌘ is held; clear everything on ⌘ release.
  if (e.key === 'Meta') v.held.clear();
}

/** Window lost focus: we will never see the keyups, so reset. @param {ViewerState} v */
export function onBlur(v) {
  v.physical.shift = false;
  v.physical.alt = false;
  v.held.clear();
}

/** @param {EventTarget | null} t */
export function isFormField(t) {
  return t instanceof HTMLElement && (t.matches('input, select, textarea, [contenteditable]'));
}
