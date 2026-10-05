// @ts-check
import { CAPTURE_CODES } from './geometry/mac-iso-de.js';
import { LAYERS, LAYER_LABELS, MODIFIER_KEYS, layerFromModifiers } from './schema.js';

/**
 * Capture Mode state machine. UI-agnostic: it receives keyboard events and
 * returns a message for the UI; the UI re-renders from `state` afterwards.
 *
 * @typedef {import('./schema.js').Layout} Layout
 * @typedef {import('./schema.js').LayerName} LayerName
 *
 * @typedef {Object} CaptureState
 * @property {Layout} layout
 * @property {LayerName} layer             layer being captured right now
 * @property {string|null} target          code chosen for re-capture (click on a key)
 * @property {boolean} awaitingDeadClear   a dead key was just captured; wait for Space/Esc
 * @property {Record<string,string>|null} startSnapshot  getLayoutMap() at capture start
 *
 * @typedef {{ level: 'info'|'ok'|'warn', text: string, action?: 'suggest-iso-swap' }} Message
 */

const CODE_NAMES = Object.fromEntries(CAPTURE_CODES.map((c) => [c, c.replace(/^Key|^Digit/, '')]));
/** @param {string} code */
export const codeName = (code) => CODE_NAMES[code] ?? code;

/** @param {CaptureState} s */
export function activeLayers(s) {
  return LAYERS.filter((l) => s.layout.layers[l] !== undefined);
}

/** @param {CaptureState} s @param {LayerName} layer */
export function missingCodes(s, layer) {
  const layer_ = s.layout.layers[layer] ?? {};
  return CAPTURE_CODES.filter((c) => !layer_[c]);
}

/** @param {CaptureState} s */
export function progress(s) {
  return activeLayers(s).map((layer) => ({
    layer,
    label: LAYER_LABELS[layer],
    done: CAPTURE_CODES.length - missingCodes(s, layer).length,
    total: CAPTURE_CODES.length,
  }));
}

/** The key the guided flow wants next (or the re-capture target). @param {CaptureState} s */
export function expectedCode(s) {
  return s.target ?? missingCodes(s, s.layer)[0] ?? null;
}

/** @param {CaptureState} s */
function advanceIfComplete(s) {
  if (missingCodes(s, s.layer).length) return false;
  const next = activeLayers(s).find((l) => missingCodes(s, l).length);
  if (next) s.layer = next;
  return true;
}

/**
 * @param {CaptureState} s
 * @param {KeyboardEvent} e
 * @returns {Message | null}   null = event not handled (let the browser have it)
 */
export function handleKeydown(s, e) {
  if (e.metaKey || e.ctrlKey) return null; // leave ⌘/⌃ shortcuts alone
  if (MODIFIER_KEYS.has(e.key)) return null;
  e.preventDefault();
  if (e.repeat) return { level: 'info', text: 'Key repeat ignored.' };
  if (e.isComposing || e.key === 'Process') {
    return { level: 'warn', text: 'An input method is composing text. Press Esc and try again.' };
  }

  if (s.awaitingDeadClear) {
    if (e.code === 'Space' || e.code === 'Escape') {
      s.awaitingDeadClear = false;
      return { level: 'ok', text: 'Dead key cleared. Continue.' };
    }
    return { level: 'warn', text: 'Press Space once to clear the pending dead key (that press is not recorded).' };
  }

  if (e.code === 'Escape') {
    s.target = null;
    return { level: 'info', text: 'Re-capture cancelled.' };
  }
  if (!CAPTURE_CODES.includes(e.code)) {
    return { level: 'info', text: `${e.code || e.key} is not a character key on this keyboard — ignored.` };
  }

  const pressedLayer = layerFromModifiers(e.shiftKey, e.altKey);
  if (pressedLayer !== s.layer) {
    return {
      level: 'warn',
      text: `You are holding ${LAYER_LABELS[pressedLayer]}, but the current layer is ${LAYER_LABELS[s.layer]}.`,
    };
  }

  const layer = /** @type {import('./schema.js').Layer} */ (s.layout.layers[s.layer]);
  if (s.target && s.target !== e.code) {
    return { level: 'warn', text: `Waiting for ${codeName(s.target)}, got ${codeName(e.code)}. Press Esc to cancel.` };
  }
  if (layer[e.code] && s.target !== e.code) {
    return { level: 'info', text: `${codeName(e.code)} is already captured. Click it on the keyboard to re-capture.` };
  }

  // Chrome may report the two ISO-only keys swapped on Macs.
  const expected = expectedCode(s);
  /** @type {Message['action']} */
  let action;
  if (!s.target && expected && expected !== e.code
      && new Set([expected, e.code]).size === 2
      && ['Backquote', 'IntlBackslash'].includes(expected)
      && ['Backquote', 'IntlBackslash'].includes(e.code)) {
    action = 'suggest-iso-swap';
  }

  const dead = e.key === 'Dead';
  layer[e.code] = dead ? { key: 'Dead', dead: true } : { key: e.key };
  s.target = null;
  if (dead) s.awaitingDeadClear = true;

  const finishedLayer = s.layer;
  const layerDone = advanceIfComplete(s);
  /** @type {Message} */
  const msg = dead
    ? { level: 'warn', text: `${codeName(e.code)} is a dead key — recorded as "Dead". Now press Space once to clear it.` }
    : { level: 'ok', text: `${codeName(e.code)} → ${JSON.stringify(e.key)}` };
  if (layerDone) msg.text += ` · ${LAYER_LABELS[finishedLayer]} layer complete.`;
  if (action) {
    msg.action = action;
    msg.level = 'warn';
    msg.text += ` · The highlighted key was ${codeName(expected ?? '')} but Chrome reported ${codeName(e.code)}. ` +
      'This is a known macOS ISO quirk.';
  }
  return msg;
}

/** Mark a key as producing no character in the current layer. @param {CaptureState} s @param {string} code */
export function skipKey(s, code) {
  const layer = s.layout.layers[s.layer];
  if (!layer || !CAPTURE_CODES.includes(code)) return;
  layer[code] = { key: '', skipped: true };
  s.target = null;
  advanceIfComplete(s);
}

/** @param {CaptureState} s @param {LayerName} layer @param {boolean} enabled */
export function setLayerEnabled(s, layer, enabled) {
  if (layer === 'base') return;
  if (enabled) s.layout.layers[layer] ??= {};
  else {
    delete s.layout.layers[layer];
    if (s.layer === layer) {
      const before = LAYERS.slice(0, LAYERS.indexOf(layer)).filter((l) => s.layout.layers[l]);
      s.layer = before[before.length - 1] ?? 'base';
      s.target = null;
    }
  }
}
