// @ts-check
import { CAPTURE_CODES } from '../src/geometry/mac-iso-de.js';
import { createKeyboard } from '../src/keyboard-render.js';
import { LAYERS, LAYER_LABELS, emptyLayout, inferDirection, makeId } from '../src/schema.js';
import * as store from '../src/storage.js';
import * as io from '../src/io.js';
import * as cap from '../src/capture.js';
import * as view from '../src/viewer.js';
import { detectFromLayoutMap, hasLayoutMap, matchKeypress, readLayoutMap } from '../src/detect.js';

/**
 * @typedef {import('../src/schema.js').Layout} Layout
 * @typedef {import('../src/capture.js').CaptureState} CaptureState
 */

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));

const app = {
  /** @type {store.Settings} */
  settings: { ...store.DEFAULT_SETTINGS },
  /** @type {Record<string, Layout>} */
  saved: {},
  /** @type {Layout[]} */
  bundled: [],
  /** @type {string[]} */
  bundledErrors: [],
  /** @type {Layout | null} */
  active: null,
  /** @type {'manual'|'layoutMap'|'keypress'|'ambiguous'|null} */
  activeSource: null,
  current: /** @type {'viewer'|'capture'|'manage'} */ ('viewer'),
  viewer: view.createViewerState(),
  /** @type {CaptureState | null} */
  capture: null,
  /** @type {import('../src/keyboard-render.js').Keyboard | null} */
  viewerKb: null,
  /** @type {import('../src/keyboard-render.js').Keyboard | null} */
  captureKb: null,
};

const allLayouts = () => [...Object.values(app.saved), ...app.bundled.filter((b) => !app.saved[b.id])];
const findLayout = (/** @type {string|null} */ id) => allLayouts().find((l) => l.id === id) ?? null;

// ---------------------------------------------------------------- bootstrap

async function init() {
  app.settings = await store.getSettings();
  app.saved = await store.getLayouts();
  ({ layouts: app.bundled, errors: app.bundledErrors } = await io.loadBundledLayouts());

  const draft = await store.getDraft();
  if (draft?.layout) app.capture = { ...draft, target: null, awaitingDeadClear: false };

  buildKeyboards();
  app.active = findLayout(app.settings.activeLayoutId) ?? allLayouts()[0] ?? null;
  app.activeSource = app.active ? 'manual' : null;

  wireTabs();
  wireViewer();
  wireCapture();
  wireManage();
  wireKeyboardEvents();

  renderAll();
  await runDetect();
}

function buildKeyboards() {
  const opts = { swapIsoKeys: app.settings.swapIsoKeys };
  app.viewerKb = createKeyboard($('viewer-kb'), opts);
  app.captureKb = createKeyboard($('capture-kb'), opts);
  app.captureKb.onKeyClick((code) => {
    if (!app.capture || !CAPTURE_CODES.includes(code)) return;
    app.capture.target = code;
    setCaptureMsg({ level: 'info', text: `Press ${cap.codeName(code)} now (holding the modifiers for ${LAYER_LABELS[app.capture.layer]}). Esc cancels.` });
    renderCapture();
  });
}

function renderAll() {
  renderSelect();
  renderViewer();
  renderCapture();
  renderManage();
}

// ---------------------------------------------------------------- tabs

function wireTabs() {
  for (const btn of document.querySelectorAll('.tabs button')) {
    btn.addEventListener('click', () => showView(/** @type {any} */ (btn).dataset.view));
  }
}

/** @param {'viewer'|'capture'|'manage'} name */
function showView(name) {
  app.current = name;
  // Modifier/pressed state from another view must not leak into this one.
  view.onBlur(app.viewer);
  app.viewerKb?.clearPressed();
  app.captureKb?.clearPressed();
  renderViewer();
  for (const btn of document.querySelectorAll('.tabs button')) {
    btn.setAttribute('aria-selected', String(/** @type {any} */ (btn).dataset.view === name));
  }
  for (const v of ['viewer', 'capture', 'manage']) $(`view-${v}`).hidden = v !== name;
  if (name === 'capture' && !app.capture) $('capture-name').focus();
}

// ---------------------------------------------------------------- active layout + detection

function renderSelect() {
  const sel = $('layout-select');
  const layouts = allLayouts();
  sel.replaceChildren(...layouts.map((l) => {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = `${l.name}${l.source === 'bundled' ? ' (bundled)' : ''}${l.placeholder ? ' — PLACEHOLDER' : ''}`;
    return o;
  }));
  sel.disabled = layouts.length === 0;
  if (app.active) sel.value = app.active.id;

  const chip = $('detect-chip');
  const labels = {
    manual: 'manual',
    layoutMap: 'auto-detected',
    keypress: 'detected from typing',
    ambiguous: 'several layouts match',
  };
  chip.hidden = !app.activeSource || !layouts.length;
  chip.textContent = app.activeSource ? labels[app.activeSource] : '';
  chip.className = `chip${app.activeSource === 'layoutMap' || app.activeSource === 'keypress' ? ' ok' : ''}`;
}

/** @param {string|null} id @param {'manual'|'layoutMap'|'keypress'} source */
async function setActive(id, source) {
  const layout = findLayout(id);
  if (!layout) return;
  const changed = app.active?.id !== layout.id;
  app.active = layout;
  app.activeSource = source;
  if (changed) app.settings = await store.updateSettings({ activeLayoutId: layout.id });
  renderSelect();
  renderViewer();
}

async function runDetect() {
  if (!app.settings.autoDetect) return;
  const layouts = allLayouts();
  if (!layouts.length) return;
  const result = detectFromLayoutMap(layouts, await readLayoutMap());
  if (result.status === 'layoutMap') await setActive(result.layoutId, 'layoutMap');
  else if (result.status === 'ambiguous' && app.activeSource !== 'keypress') {
    app.activeSource = 'ambiguous';
    renderSelect();
  }
}

// ---------------------------------------------------------------- viewer

function wireViewer() {
  $('layout-select').addEventListener('change', (/** @type {any} */ e) => setActive(e.target.value, 'manual'));
  for (const [id, mod] of /** @type {const} */ ([['latch-shift', 'shift'], ['latch-alt', 'alt']])) {
    $(id).addEventListener('click', () => {
      app.viewer.latched[mod] = !app.viewer.latched[mod];
      renderViewer();
    });
  }
}

function renderViewer() {
  const layout = app.active;
  const layer = view.displayedLayer(app.viewer, layout);
  $('viewer-empty').hidden = !!layout;
  $('viewer-kb').hidden = !layout;
  $('placeholder-banner').hidden = !layout?.placeholder;
  $('layer-name').textContent = layout ? `${layout.name} · ${LAYER_LABELS[layer]}` : '';
  $('latch-shift').setAttribute('aria-pressed', String(app.viewer.latched.shift));
  $('latch-alt').setAttribute('aria-pressed', String(app.viewer.latched.alt));
  if (!layout || !app.viewerKb) return;
  app.viewerKb.showLayer(layout.layers[layer], { dir: layout.direction });
  app.viewerKb.clearPressed();
  for (const code of app.viewer.held) app.viewerKb.setPressed(code, true);
}

/** @param {{ code: string, key: string, layer: import('../src/schema.js').LayerName }} press */
function inferFromKeypress(press) {
  if (!app.settings.autoDetect) return;
  const ids = matchKeypress(allLayouts(), press);
  if (!ids || (app.active && ids.includes(app.active.id))) return;
  if (ids.length === 1) setActive(ids[0], 'keypress');
}

// ---------------------------------------------------------------- keyboard events

function wireKeyboardEvents() {
  document.addEventListener('keydown', (e) => {
    // A focused button/checkbox would react to Space/Enter; keystrokes belong to the keyboard here.
    const t = /** @type {HTMLElement} */ (e.target);
    if (t instanceof HTMLButtonElement || (t instanceof HTMLInputElement && t.type === 'checkbox')) {
      if (CAPTURE_CODES.includes(e.code) && (app.current !== 'manage')) t.blur();
    }

    if (app.current === 'capture' && app.capture && !view.isFormField(document.activeElement)) {
      const msg = cap.handleKeydown(app.capture, e);
      if (msg) {
        setCaptureMsg(msg);
        app.captureKb?.setPressed(e.code, true);
        persistDraft();
        renderCapture();
      }
      return;
    }
    if (app.current === 'viewer') {
      const press = view.onKeydown(app.viewer, e);
      if (press) inferFromKeypress(press);
      renderViewer();
    }
  });

  document.addEventListener('keyup', (e) => {
    app.captureKb?.setPressed(e.code, false);
    if (e.key === 'Meta') app.captureKb?.clearPressed();
    view.onKeyup(app.viewer, e);
    if (app.current === 'viewer') renderViewer();
  });

  const updateFocus = () => {
    const focused = document.hasFocus();
    $('focus-banner').hidden = focused;
    if (!focused) {
      view.onBlur(app.viewer);
      app.captureKb?.clearPressed();
      renderViewer();
    }
  };
  window.addEventListener('blur', updateFocus);
  window.addEventListener('focus', () => { updateFocus(); runDetect(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runDetect(); });
  updateFocus();
}

// ---------------------------------------------------------------- capture

/** @param {import('../src/capture.js').Message} msg */
function setCaptureMsg(msg) {
  const el = $('capture-msg');
  el.textContent = msg.text;
  el.className = `msg ${msg.level}`;
  $('capture-swap').hidden = msg.action !== 'suggest-iso-swap' || app.settings.swapIsoKeys;
}

function persistDraft() {
  if (!app.capture) return store.setDraft(null);
  const { layout, layer, startSnapshot } = app.capture;
  return store.setDraft({ layout, layer, startSnapshot });
}

function wireCapture() {
  $('capture-start').addEventListener('submit', async (/** @type {Event} */ e) => {
    e.preventDefault();
    const name = $('capture-name').value.trim();
    if (!name) return;
    const s = app.capture = {
      layout: emptyLayout(name),
      layer: /** @type {const} */ ('base'),
      target: null,
      awaitingDeadClear: false,
      startSnapshot: /** @type {Record<string,string>|null} */ (null),
    };
    $('capture-name').value = '';
    $('capture-name').blur();
    setCaptureMsg({ level: 'info', text: 'Press the highlighted key. Keys can be pressed in any order.' });
    renderCapture();
    s.startSnapshot = await readLayoutMap();
    await persistDraft();
  });

  $('capture-skip-key').addEventListener('click', () => {
    if (!app.capture) return;
    const code = cap.expectedCode(app.capture);
    if (!code) return;
    cap.skipKey(app.capture, code);
    setCaptureMsg({ level: 'info', text: `${cap.codeName(code)} marked as “no character” in this layer.` });
    persistDraft();
    renderCapture();
  });

  $('capture-shiftopt').addEventListener('change', (/** @type {any} */ e) => {
    if (!app.capture) return;
    cap.setLayerEnabled(app.capture, 'shiftOption', e.target.checked);
    persistDraft();
    renderCapture();
  });

  $('capture-swap').addEventListener('click', async () => {
    await applySwapSetting(true);
    setCaptureMsg({ level: 'ok', text: 'ISO key swap enabled. Re-check the two keys left of “1” and right of left Shift.' });
  });

  $('capture-discard').addEventListener('click', async (/** @type {any} */ e) => {
    if (e.target.dataset.armed !== '1') {
      e.target.dataset.armed = '1';
      e.target.textContent = 'Click again to discard';
      setTimeout(() => { e.target.dataset.armed = ''; e.target.textContent = 'Discard'; }, 3000);
      return;
    }
    app.capture = null;
    await persistDraft();
    renderCapture();
  });

  $('capture-finish').addEventListener('submit', async (/** @type {Event} */ e) => {
    e.preventDefault();
    if (!app.capture) return;
    const s = app.capture;
    const now = await readLayoutMap();
    let note = '';
    if (s.startSnapshot && now) {
      const codes = Object.keys(s.startSnapshot);
      const diff = codes.filter((c) => s.startSnapshot?.[c] !== now[c]).length;
      if (diff > codes.length * 0.1) note = ' Note: the system layout seems to have changed during capture.';
    }
    /** @type {Layout} */
    const layout = {
      ...s.layout,
      capturedAt: new Date().toISOString(),
      verified: $('capture-verified').checked,
      direction: inferDirection(s.layout),
      layoutMapSnapshot: s.startSnapshot ?? now,
    };
    await store.saveLayout(layout);
    app.saved = await store.getLayouts();
    app.capture = null;
    await persistDraft();
    await setActive(layout.id, 'manual');
    renderAll();
    showView('viewer');
    if (note) setManageMsg({ level: 'warn', text: `Saved “${layout.name}”.${note}` });
  });
}

function renderCapture() {
  const s = app.capture;
  $('capture-start').hidden = !!s;
  $('capture-run').hidden = !s;
  if (!s || !app.captureKb) return;

  const tabs = cap.progress(s).map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(p.layer === s.layer));
    b.className = p.done === p.total ? 'complete' : '';
    b.append(p.label);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${p.done}/${p.total}`;
    b.append(count);
    b.addEventListener('click', () => {
      s.layer = p.layer;
      s.target = null;
      persistDraft();
      renderCapture();
    });
    return b;
  });
  $('capture-layers').replaceChildren(...tabs);
  $('capture-shiftopt').checked = s.layout.layers.shiftOption !== undefined;

  const expected = cap.expectedCode(s);
  const missing = cap.missingCodes(s, s.layer).length;
  const holding = { base: 'no modifier', shift: 'Shift', option: 'Option', shiftOption: 'Shift + Option' }[s.layer];
  $('capture-instruction').textContent = s.awaitingDeadClear
    ? 'Press Space to clear the dead key.'
    : expected
      ? `${s.layout.name} · ${LAYER_LABELS[s.layer]}: hold ${holding} and press ${cap.codeName(expected)}${s.target ? ' (re-capture)' : ''}. ${missing} missing.`
      : `${LAYER_LABELS[s.layer]} complete. Pick another layer or save.`;

  app.captureKb.showLayer(s.layout.layers[s.layer], { dir: inferDirection(s.layout) });
  app.captureKb.setTarget(s.awaitingDeadClear ? 'Space' : expected);
  $('capture-skip-key').disabled = !expected || s.awaitingDeadClear;

  const allDone = cap.progress(s).every((p) => p.done === p.total);
  $('capture-verified').disabled = !allDone;
  if (!allDone) $('capture-verified').checked = false;
}

/** @param {boolean} on */
async function applySwapSetting(on) {
  app.settings = await store.updateSettings({ swapIsoKeys: on });
  buildKeyboards();
  renderAll();
}

// ---------------------------------------------------------------- manage

/** @param {import('../src/capture.js').Message} msg */
function setManageMsg(msg) {
  const el = $('manage-msg');
  el.textContent = msg.text;
  el.className = `msg ${msg.level}`;
}

function wireManage() {
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (/** @type {any} */ e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      let layout = await io.importLayoutFile(file);
      if (app.saved[layout.id]) layout = { ...layout, id: makeId(layout.name) };
      await store.saveLayout(layout);
      app.saved = await store.getLayouts();
      setManageMsg({ level: 'ok', text: `Imported “${layout.name}”.` });
      renderAll();
      await runDetect();
    } catch (err) {
      setManageMsg({ level: 'warn', text: `Import failed: ${err instanceof Error ? err.message : err}` });
    }
  });

  $('set-autodetect').addEventListener('change', async (/** @type {any} */ e) => {
    app.settings = await store.updateSettings({ autoDetect: e.target.checked });
    if (!e.target.checked && app.activeSource !== 'manual') { app.activeSource = 'manual'; renderSelect(); }
    await runDetect();
  });
  $('set-swap').addEventListener('change', (/** @type {any} */ e) => applySwapSetting(e.target.checked));
}

function renderManage() {
  $('set-autodetect').checked = app.settings.autoDetect;
  $('set-swap').checked = app.settings.swapIsoKeys;
  $('layoutmap-support').textContent = hasLayoutMap()
    ? 'navigator.keyboard.getLayoutMap() is available. Note: Chrome may report a Latin fallback map while a non-Latin layout is active; typing in the Viewer also identifies the layout.'
    : 'navigator.keyboard.getLayoutMap() is not available here — select layouts manually or let typing in the Viewer identify them.';

  const layouts = allLayouts();
  const items = layouts.map((l) => {
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'title';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = l.name;
    title.append(name);
    /** @param {string} text @param {string} [cls] */
    const badge = (text, cls = '') => {
      const b = document.createElement('span');
      b.className = `badge ${cls}`;
      b.textContent = text;
      title.append(b);
    };
    badge(l.source);
    if (l.verified) badge('verified', 'ok');
    if (l.placeholder) badge('placeholder', 'warn');
    if (app.active?.id === l.id) badge('active', 'ok');

    const meta = document.createElement('div');
    meta.className = 'meta';
    const counts = LAYERS.filter((k) => l.layers[k]).map((k) => `${LAYER_LABELS[k]} ${Object.keys(l.layers[k] ?? {}).length}`);
    meta.textContent = `${l.direction.toUpperCase()} · ${counts.join(' · ')}${l.capturedAt ? ' · ' + l.capturedAt.slice(0, 10) : ''}`;

    const actions = document.createElement('div');
    actions.className = 'actions';
    /** @param {string} label @param {() => void | Promise<void>} fn @param {string} [cls] */
    const action = (label, fn, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = cls;
      b.addEventListener('click', () => fn());
      actions.append(b);
      return b;
    };

    action('Use', async () => { await setActive(l.id, 'manual'); renderManage(); showView('viewer'); });
    action('Export', () => io.exportLayout(l));

    if (l.source === 'bundled' && !app.saved[l.id]) {
      action('Duplicate to edit', async () => {
        const copy = { ...structuredClone(l), id: makeId(l.name), source: /** @type {const} */ ('imported') };
        await store.saveLayout(copy);
        app.saved = await store.getLayouts();
        renderAll();
      });
    } else {
      action('Rename', () => {
        const input = document.createElement('input');
        input.value = l.name;
        input.maxLength = 80;
        name.replaceWith(input);
        input.focus();
        input.select();
        const commit = async () => {
          const v = input.value.trim();
          if (v && v !== l.name) {
            await store.saveLayout({ ...l, name: v });
            app.saved = await store.getLayouts();
            if (app.active?.id === l.id) app.active = app.saved[l.id];
          }
          renderAll();
        };
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') commit();
          if (ev.key === 'Escape') renderManage();
        });
        input.addEventListener('blur', commit, { once: true });
      });
      action(l.verified ? 'Unmark verified' : 'Mark verified', async () => {
        await store.saveLayout({ ...l, verified: !l.verified });
        app.saved = await store.getLayouts();
        renderAll();
      });
      const del = action('Delete', async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.textContent = 'Click again to delete';
          setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Delete'; }, 3000);
          return;
        }
        await store.deleteLayout(l.id);
        app.saved = await store.getLayouts();
        if (app.active?.id === l.id) {
          app.active = allLayouts()[0] ?? null;
          app.activeSource = app.active ? 'manual' : null;
          await store.updateSettings({ activeLayoutId: app.active?.id ?? null });
        }
        renderAll();
      }, 'danger');
    }

    li.append(title, meta, actions);
    return li;
  });

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No layouts saved yet.';
    items.push(li);
  }
  for (const err of app.bundledErrors) {
    const li = document.createElement('li');
    li.className = 'meta';
    li.textContent = `Bundled layout error — ${err}`;
    items.push(li);
  }
  $('layout-list').replaceChildren(...items);
}

init().catch((err) => {
  console.error(err);
  document.body.prepend(Object.assign(document.createElement('div'), {
    className: 'banner warn',
    textContent: `Failed to start: ${err instanceof Error ? err.message : err}`,
  }));
});
