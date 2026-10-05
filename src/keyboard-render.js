// @ts-check
import { placeKeys, WIDTH_U } from './geometry/mac-iso-de.js';
import { toGlyph } from './glyph.js';

/** @typedef {import('./schema.js').Layer} Layer */

const SUB = 4; // grid columns per 1u (0.25u resolution)
const ROW_SUB = 2; // grid rows per key row (0.5 row resolution)

/**
 * Chrome on some macOS ISO keyboards reports the top-left key as IntlBackslash
 * and the key next to left Shift as Backquote. When `swapIsoKeys` is on, the
 * event codes are exchanged for those two physical positions.
 */
const ISO_SWAP = { Backquote: 'IntlBackslash', IntlBackslash: 'Backquote' };

/**
 * @param {HTMLElement} host
 * @param {{ swapIsoKeys?: boolean }} [opts]
 */
export function createKeyboard(host, opts = {}) {
  const board = document.createElement('div');
  board.className = 'kb';
  board.setAttribute('dir', 'ltr'); // physical keyboard never mirrors
  board.style.setProperty('--cols', String(WIDTH_U * SUB));
  board.style.setProperty('--rows', String(5 * ROW_SUB));

  /** @type {Map<string, HTMLElement>} */
  const byCode = new Map();

  for (const k of placeKeys()) {
    const code = opts.swapIsoKeys && k.code in ISO_SWAP ? ISO_SWAP[/** @type {keyof ISO_SWAP} */ (k.code)] : k.code;
    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.code = code;
    if (k.capture) el.classList.add('char');
    else el.classList.add('fixed');
    if (k.shape) el.classList.add(k.shape);
    el.style.gridColumn = `${Math.round(k.x * SUB) + 1} / span ${Math.round(k.w * SUB)}`;
    el.style.gridRow = `${Math.round(k.y * ROW_SUB) + 1} / span ${Math.round(k.h * ROW_SUB)}`;

    const cap = document.createElement('bdi');
    cap.className = 'glyph';
    cap.setAttribute('dir', 'auto');
    if (k.label) cap.textContent = k.label;
    el.append(cap);
    el.title = code;

    board.append(el);
    byCode.set(code, el);
  }

  host.replaceChildren(board);

  return {
    board,
    /** @param {string} code */
    el: (code) => byCode.get(code),

    /**
     * Writes glyphs for character keys from a layer.
     * @param {Layer | undefined} layer
     * @param {{ dir?: 'rtl'|'ltr' }} [o]
     */
    showLayer(layer, o = {}) {
      for (const [code, el] of byCode) {
        if (!el.classList.contains('char')) continue;
        const entry = layer?.[code];
        const g = toGlyph(entry);
        const cap = /** @type {HTMLElement} */ (el.firstElementChild);
        cap.textContent = g.text;
        cap.lang = o.dir === 'rtl' ? 'ar' : '';
        el.dataset.kind = g.kind;
        el.title = `${code}${g.title ? ' — ' + g.title : ''}`;
      }
    },

    /** @param {string} code @param {boolean} down */
    setPressed(code, down) {
      byCode.get(code)?.classList.toggle('pressed', down);
    },

    clearPressed() {
      for (const el of byCode.values()) el.classList.remove('pressed');
    },

    /** @param {string|null} code */
    setTarget(code) {
      for (const el of byCode.values()) el.classList.toggle('target', el.dataset.code === code);
    },

    /** @param {(code: string, el: HTMLElement) => void} cb */
    onKeyClick(cb) {
      board.addEventListener('click', (e) => {
        const el = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('.key'));
        if (el?.dataset.code) cb(el.dataset.code, el);
      });
    },
  };
}

/** @typedef {ReturnType<typeof createKeyboard>} Keyboard */
