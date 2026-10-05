// @ts-check
/**
 * Figures out which saved layout is currently active.
 *
 * Signal 1: navigator.keyboard.getLayoutMap() (Chromium only).
 *   Caveat: Chromium returns the map of the first *ASCII-capable* layout, so
 *   with a non-Latin layout (e.g. Arabic) active it may return Latin letters.
 *   That is why each captured layout stores the map Chrome reported at capture
 *   time (layoutMapSnapshot) and we compare against that first.
 * Signal 2: real keypresses in the panel (see matchKeypress).
 * Fallback: manual selection.
 */

/** @typedef {import('./schema.js').Layout} Layout */

export const MATCH_THRESHOLD = 0.9;

export function hasLayoutMap() {
  return typeof navigator !== 'undefined'
    && 'keyboard' in navigator
    && typeof /** @type {any} */ (navigator).keyboard?.getLayoutMap === 'function';
}

/** @returns {Promise<Record<string, string> | null>} */
export async function readLayoutMap() {
  if (!hasLayoutMap()) return null;
  try {
    const map = await /** @type {any} */ (navigator).keyboard.getLayoutMap();
    /** @type {Record<string, string>} */
    const out = {};
    for (const [code, value] of map.entries()) out[code] = value;
    return out;
  } catch {
    return null;
  }
}

/**
 * Fraction of codes in `reference` whose value equals `current[code]`.
 * @param {Record<string, string>} current
 * @param {Record<string, string>} reference
 */
function similarity(current, reference) {
  const codes = Object.keys(reference);
  if (!codes.length) return 0;
  let same = 0;
  for (const code of codes) if (current[code] === reference[code]) same++;
  return same / codes.length;
}

/** @param {Layout} layout @returns {Record<string, string>} */
function baseAsMap(layout) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [code, e] of Object.entries(layout.layers.base ?? {})) {
    if (!e.dead && !e.skipped && e.key.length === 1) out[code] = e.key.toLowerCase();
  }
  return out;
}

/**
 * @typedef {Object} Detection
 * @property {'layoutMap'|'unavailable'|'ambiguous'|'none'} status
 * @property {string|null} layoutId
 * @property {string[]} candidates   ids that matched equally well
 */

/**
 * @param {Layout[]} layouts
 * @param {Record<string, string> | null} current  result of readLayoutMap()
 * @returns {Detection}
 */
export function detectFromLayoutMap(layouts, current) {
  if (!current) return { status: 'unavailable', layoutId: null, candidates: [] };
  const lowered = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v.toLowerCase()]));

  const scored = layouts.map((l) => {
    const bySnapshot = l.layoutMapSnapshot ? similarity(current, l.layoutMapSnapshot) : 0;
    const byBase = similarity(lowered, baseAsMap(l));
    return { id: l.id, score: Math.max(bySnapshot, byBase) };
  }).filter((s) => s.score >= MATCH_THRESHOLD);

  if (!scored.length) return { status: 'none', layoutId: null, candidates: [] };
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best).map((s) => s.id);
  return top.length === 1
    ? { status: 'layoutMap', layoutId: top[0], candidates: top }
    : { status: 'ambiguous', layoutId: null, candidates: top };
}

/**
 * Given a real keypress, which layouts could have produced it?
 * Returns ids of layouts whose layer for these modifiers has exactly this key.
 * Returns null if the event carries no usable signal.
 * @param {Layout[]} layouts
 * @param {{ code: string, key: string, layer: import('./schema.js').LayerName }} press
 * @returns {string[] | null}
 */
export function matchKeypress(layouts, press) {
  if (press.key === 'Dead' || press.key === 'Unidentified' || press.key.length > 4) return null;
  const known = layouts.filter((l) => l.layers[press.layer]?.[press.code]);
  if (!known.length) return null;
  return known.filter((l) => l.layers[press.layer]?.[press.code]?.key === press.key).map((l) => l.id);
}
