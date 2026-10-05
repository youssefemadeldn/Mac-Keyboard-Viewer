// @ts-check
import { validate } from './schema.js';

/** @typedef {import('./schema.js').Layout} Layout */

/** Downloads a layout as a .json file (no "downloads" permission needed). @param {Layout} layout */
export function exportLayout(layout) {
  const { source, ...rest } = layout;
  const data = { ...rest, source: source === 'bundled' ? 'bundled' : 'captured' };
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${layout.id.replace(/[^a-z0-9@._-]+/gi, '_')}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** @param {File} file @returns {Promise<Layout>} */
export async function importLayoutFile(file) {
  if (file.size > 512 * 1024) throw new Error('File is too large to be a layout (> 512 KB).');
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('File is not valid JSON.');
  }
  return { ...validate(data), source: 'imported' };
}

/**
 * Loads layouts shipped inside the extension package (layouts/index.json).
 * Uses chrome.runtime.getURL, so no host permissions are involved.
 * @returns {Promise<{ layouts: Layout[], errors: string[] }>}
 */
export async function loadBundledLayouts() {
  /** @type {Layout[]} */
  const layouts = [];
  /** @type {string[]} */
  const errors = [];
  let index;
  try {
    index = await (await fetch(chrome.runtime.getURL('layouts/index.json'))).json();
  } catch (e) {
    return { layouts, errors: [`layouts/index.json: ${e instanceof Error ? e.message : e}`] };
  }
  for (const file of Array.isArray(index?.layouts) ? index.layouts : []) {
    if (typeof file !== 'string' || !/^[\w@.-]+\.json$/.test(file)) {
      errors.push(`Ignored invalid entry in index.json: ${JSON.stringify(file)}`);
      continue;
    }
    try {
      const data = await (await fetch(chrome.runtime.getURL(`layouts/${file}`))).json();
      layouts.push({ ...validate(data), source: 'bundled' });
    } catch (e) {
      errors.push(`${file}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { layouts, errors };
}
