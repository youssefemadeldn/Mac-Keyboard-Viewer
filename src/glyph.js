// @ts-check
/**
 * Turns a captured entry into something displayable on a keycap.
 * Never invents characters: it only re-presents the raw event.key.
 */

/** @typedef {{ key: string, dead?: boolean, skipped?: boolean }} KeyEntry */

/**
 * @typedef {Object} Glyph
 * @property {string} text     what goes on the keycap
 * @property {string} kind     'char' | 'mark' | 'invisible' | 'named' | 'dead' | 'skipped' | 'missing' | 'unknown'
 * @property {string} title    tooltip (code points etc.)
 */

const INVISIBLE = new Map([
  [' ', '␣'],
  [' ', 'NBSP'],
  [' ', 'NNBSP'],
  [' ', 'THSP'],
  ['​', 'ZWSP'],
  ['‌', 'ZWNJ'],
  ['‍', 'ZWJ'],
  ['‎', 'LRM'],
  ['‏', 'RLM'],
  ['؜', 'ALM'],
  ['­', 'SHY'],
  ['﻿', 'BOM'],
]);

const ALL_MARKS = /^\p{M}+$/u;
const RTL_CHAR = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u;

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/** @param {string} s */
function graphemeCount(s) {
  if (!segmenter) return [...s].length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

/** @param {string} s */
export function codePoints(s) {
  return [...s].map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

/** @param {string} s */
export function isRtl(s) {
  return RTL_CHAR.test(s);
}

/**
 * @param {KeyEntry | undefined} entry
 * @returns {Glyph}
 */
export function toGlyph(entry) {
  if (!entry) return { text: '', kind: 'missing', title: 'Not captured' };
  if (entry.skipped) return { text: '—', kind: 'skipped', title: 'Skipped (no character)' };
  if (entry.dead || entry.key === 'Dead') {
    return { text: 'Dead', kind: 'dead', title: 'Dead key (combines with the next keypress)' };
  }
  const k = entry.key;
  if (k === 'Unidentified' || k === '') return { text: '?', kind: 'unknown', title: 'Browser reported "Unidentified"' };

  if (INVISIBLE.has(k)) return { text: INVISIBLE.get(k) ?? '', kind: 'invisible', title: codePoints(k) };

  // Combining marks (tashkeel etc.) need a base to be visible.
  if (ALL_MARKS.test(k)) return { text: '◌' + k, kind: 'mark', title: codePoints(k) };

  // Multi-letter values that are not a single grapheme cluster are named keys
  // ("Enter", "Tab", …). Short multi-char sequences such as "لا" are kept as text.
  if (k.length > 1 && /^[A-Z][A-Za-z0-9]+$/.test(k)) {
    return { text: k, kind: 'named', title: `Named key: ${k}` };
  }
  return { text: k, kind: graphemeCount(k) > 2 ? 'named' : 'char', title: codePoints(k) };
}
