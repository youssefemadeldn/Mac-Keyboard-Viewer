// @ts-check
/**
 * Thin wrapper over chrome.storage.local. Nothing here ever leaves the device.
 *
 * Keys:
 *   layouts       Record<id, Layout>   user-captured / imported layouts
 *   settings      Settings
 *   captureDraft  CaptureDraft | null  in-progress capture, survives panel close
 */

/** @typedef {import('./schema.js').Layout} Layout */
/**
 * @typedef {Object} Settings
 * @property {string|null} activeLayoutId
 * @property {boolean} autoDetect
 * @property {boolean} swapIsoKeys   Chrome quirk: swap Backquote <-> IntlBackslash positions
 */

/** @type {Settings} */
export const DEFAULT_SETTINGS = { activeLayoutId: null, autoDetect: true, swapIsoKeys: false };

const area = () => chrome.storage.local;

/** @returns {Promise<Record<string, Layout>>} */
export async function getLayouts() {
  const { layouts } = await area().get('layouts');
  return layouts ?? {};
}

/** @param {Layout} layout */
export async function saveLayout(layout) {
  const layouts = await getLayouts();
  layouts[layout.id] = layout;
  await area().set({ layouts });
}

/** @param {string} id */
export async function deleteLayout(id) {
  const layouts = await getLayouts();
  delete layouts[id];
  await area().set({ layouts });
}

/** @returns {Promise<Settings>} */
export async function getSettings() {
  const { settings } = await area().get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

/** @param {Partial<Settings>} patch */
export async function updateSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await area().set({ settings });
  return settings;
}

export async function getDraft() {
  const { captureDraft } = await area().get('captureDraft');
  return captureDraft ?? null;
}

/** @param {unknown} draft */
export async function setDraft(draft) {
  if (draft) await area().set({ captureDraft: draft });
  else await area().remove('captureDraft');
}
