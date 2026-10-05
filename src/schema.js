// @ts-check
import { ALL_CODES, GEOMETRY_ID } from './geometry/mac-iso-de.js';
import { isRtl } from './glyph.js';

export const SCHEMA_VERSION = 1;

/** Layer order is also the Capture Mode order. */
export const LAYERS = /** @type {const} */ (['base', 'shift', 'option', 'shiftOption']);
/** @typedef {typeof LAYERS[number]} LayerName */

export const LAYER_LABELS = {
  base: 'Base',
  shift: 'Shift ⇧',
  option: 'Option ⌥',
  shiftOption: 'Shift+Option ⇧⌥',
};

/**
 * @typedef {import('./glyph.js').KeyEntry} KeyEntry
 * @typedef {Record<string, KeyEntry>} Layer
 * @typedef {Object} Layout
 * @property {number} schemaVersion
 * @property {string} id
 * @property {string} name
 * @property {'captured'|'imported'|'bundled'} source
 * @property {boolean} verified
 * @property {boolean} [placeholder]   true = sample data, NOT a real layout
 * @property {string} physicalKeyboard
 * @property {'rtl'|'ltr'} direction
 * @property {string} capturedAt
 * @property {{ os?: string, userAgent?: string }} [platform]
 * @property {Partial<Record<LayerName, Layer>>} layers
 * @property {Record<string, string> | null} layoutMapSnapshot
 */

/** @param {string} name */
export function makeId(name) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layout';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `${slug}@${stamp}`;
}

/** @param {string} name @returns {Layout} */
export function emptyLayout(name) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId(name),
    name,
    source: 'captured',
    verified: false,
    physicalKeyboard: GEOMETRY_ID,
    direction: 'ltr',
    capturedAt: new Date().toISOString(),
    platform: { os: 'macOS', userAgent: navigator.userAgent },
    layers: { base: {}, shift: {}, option: {}, shiftOption: {} },
    layoutMapSnapshot: null,
  };
}

/** Guess direction from the base layer content. @param {Layout} layout */
export function inferDirection(layout) {
  const base = Object.values(layout.layers.base ?? {}).filter((e) => !e.dead && !e.skipped);
  const rtl = base.filter((e) => isRtl(e.key)).length;
  return base.length && rtl / base.length >= 0.3 ? 'rtl' : 'ltr';
}

/**
 * Validates and normalises untrusted JSON. Throws Error with a readable message.
 * @param {unknown} data
 * @returns {Layout}
 */
export function validate(data) {
  /** @param {boolean} cond @param {string} msg */
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  need(!!data && typeof data === 'object' && !Array.isArray(data), 'Layout must be a JSON object.');
  const d = /** @type {any} */ (data);
  need(d.schemaVersion === SCHEMA_VERSION, `Unsupported schemaVersion ${d.schemaVersion} (expected ${SCHEMA_VERSION}).`);
  need(typeof d.id === 'string' && d.id.length > 0 && d.id.length < 200, '"id" must be a non-empty string.');
  need(typeof d.name === 'string' && d.name.trim().length > 0 && d.name.length < 200, '"name" must be a non-empty string.');
  need(d.physicalKeyboard === GEOMETRY_ID, `"physicalKeyboard" must be "${GEOMETRY_ID}".`);
  need(!!d.layers && typeof d.layers === 'object', '"layers" is required.');
  need(!!d.layers.base && typeof d.layers.base === 'object', '"layers.base" is required.');

  /** @type {Layout['layers']} */
  const layers = {};
  for (const [layerName, layer] of Object.entries(d.layers)) {
    need(/** @type {readonly string[]} */ (LAYERS).includes(layerName), `Unknown layer "${layerName}".`);
    need(!!layer && typeof layer === 'object', `Layer "${layerName}" must be an object.`);
    /** @type {Layer} */
    const out = {};
    for (const [code, entry] of Object.entries(/** @type {object} */ (layer))) {
      need(ALL_CODES.has(code), `Layer "${layerName}": unknown key code "${code}".`);
      const e = /** @type {any} */ (entry);
      need(!!e && typeof e === 'object' && typeof e.key === 'string' && e.key.length <= 32,
        `Layer "${layerName}", ${code}: entry must be { "key": string }.`);
      /** @type {KeyEntry} */
      const clean = { key: e.key };
      if (e.dead === true || e.key === 'Dead') clean.dead = true;
      if (e.skipped === true) clean.skipped = true;
      out[code] = clean;
    }
    layers[/** @type {LayerName} */ (layerName)] = out;
  }

  let snapshot = null;
  if (d.layoutMapSnapshot && typeof d.layoutMapSnapshot === 'object') {
    snapshot = {};
    for (const [code, v] of Object.entries(d.layoutMapSnapshot)) {
      if (typeof v === 'string' && v.length <= 32) snapshot[code] = v;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: d.id,
    name: d.name.trim(),
    source: ['captured', 'imported', 'bundled'].includes(d.source) ? d.source : 'imported',
    verified: d.verified === true,
    ...(d.placeholder === true ? { placeholder: true } : {}),
    physicalKeyboard: GEOMETRY_ID,
    direction: d.direction === 'rtl' ? 'rtl' : 'ltr',
    capturedAt: typeof d.capturedAt === 'string' ? d.capturedAt : '',
    platform: d.platform && typeof d.platform === 'object'
      ? { os: String(d.platform.os ?? ''), userAgent: String(d.platform.userAgent ?? '') }
      : undefined,
    layers,
    layoutMapSnapshot: snapshot,
  };
}

/**
 * Which layer a keypress belongs to, from its modifier state.
 * @param {boolean} shift @param {boolean} alt @returns {LayerName}
 */
export function layerFromModifiers(shift, alt) {
  if (shift && alt) return 'shiftOption';
  if (alt) return 'option';
  if (shift) return 'shift';
  return 'base';
}

/** Keys that are only modifiers and never produce characters. */
export const MODIFIER_KEYS = new Set(['Shift', 'Alt', 'AltGraph', 'Meta', 'Control', 'CapsLock', 'Fn', 'FnLock', 'OS']);
