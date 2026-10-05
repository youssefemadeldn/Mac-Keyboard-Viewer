# Mac Keyboard Viewer

A Chrome extension (Manifest V3) that shows an on-screen reference of macOS keyboard
layouts — starting with Apple's **Arabic** layout — drawn on a **German ISO (QWERTZ)**
Mac keyboard. It lives in Chrome's **Side Panel**.

Layout data is never typed in by hand or copied from the internet: every character comes
from a real keypress on your own Mac (Capture Mode).

## Install (load unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome (116 or newer).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the repository folder (the one containing `manifest.json`).
5. Pin the extension from the puzzle-piece menu, then click its icon — the side panel opens.

There is no build step: the folder is the extension.

## Usage

### 1. Capture a layout
1. On your Mac, switch to the layout you want to record (input menu in the menu bar, e.g. *Arabic*).
2. In the panel open **Capture**, enter a name, press **Start capture**.
3. Click inside the panel once so it receives keypresses, then press every highlighted key.
   Layers: **Base → Shift → Option → Shift+Option** (the last one can be turned off).
   - The keyboard shows progress: striped = missing, orange outline = next key.
   - Click any key to re-capture just that key; **Esc** cancels.
   - **Skip key** marks a key that produces nothing in the current layer.
   - Dead keys are stored as `"Dead"` (no guessing of composed characters). Press **Space**
     once afterwards to clear the pending dead key — that press is not recorded.
4. Tick **verified** once every key is checked, then **Save layout**.

The in-progress capture is saved after every keypress, so closing the panel loses nothing.

### 2. View
**Viewer** shows the active layout. Hold **Shift** / **Option** (while the panel is focused)
to switch layers, or use the latch buttons. Pressed keys light up. Tashkeel are shown on a
dotted circle (`◌َ`), and invisible characters get a label (`NBSP`, `ZWNJ`, …).

### 3. Active layout detection
- `navigator.keyboard.getLayoutMap()` is compared against what Chrome reported when each
  layout was captured (`layoutMapSnapshot`) and against its base layer.
- **Known limitation:** Chromium reports the map of the first *ASCII-capable* layout, so with a
  non-Latin layout (Arabic) active it can return a Latin map. If two saved layouts look the
  same to it, the chip says *several layouts match*.
- The Viewer then identifies the layout from your first real keypress in the panel.
- You can always select the layout manually; auto-detect can be switched off under **Layouts**.

### ISO key quirk
On some Mac ISO keyboards Chrome reports the key left of `1` as `IntlBackslash` and the key
right of left Shift as `Backquote`. If Capture notices this, it offers **Enable ISO key swap**
(also under **Layouts → Settings**). This only changes where those two codes are drawn.

## Export / import / bundling

- **Layouts → Export** downloads a layout as JSON; **Import JSON…** loads one (validated).
- To ship verified layouts with the extension, put the exported files in `layouts/` and list
  them in `layouts/index.json`:
  ```json
  { "layouts": ["arabic.json"] }
  ```
  Bundled layouts are read-only; use **Duplicate to edit**.
- `layouts/_placeholder.example.json` is **sample data, not a real layout** (it is not listed in
  `index.json`). Import it only to preview the UI.

## Layout JSON schema (v1)

```jsonc
{
  "schemaVersion": 1,
  "id": "arabic@20261005T120000",
  "name": "Arabic",
  "source": "captured",            // "captured" | "imported" | "bundled"
  "verified": false,
  "placeholder": true,             // optional; only for sample data
  "physicalKeyboard": "mac-iso-de",
  "direction": "rtl",              // inferred from the base layer
  "capturedAt": "2026-10-05T12:00:00.000Z",
  "platform": { "os": "macOS", "userAgent": "…" },
  "layers": {
    "base":        { "<KeyboardEvent.code>": { "key": "<raw event.key>" } },
    "shift":       { },
    "option":      { },
    "shiftOption": { }             // optional
  },
  "layoutMapSnapshot": { "<code>": "<value>" }   // or null
}
```
Each entry is `{ "key": string, "dead"?: true, "skipped"?: true }`.

## Project structure

```
manifest.json            MV3 manifest — permissions: sidePanel, storage
background.js            opens the side panel on toolbar click
sidepanel/               panel UI (HTML, CSS, bootstrap)
src/geometry/mac-iso-de.js  physical keyboard geometry (positions only, no characters)
src/keyboard-render.js   draws the geometry + glyphs
src/glyph.js             tashkeel / invisible / dead-key presentation
src/capture.js           Capture Mode state machine
src/viewer.js            layer switching + pressed keys
src/detect.js            getLayoutMap + keypress-based detection
src/schema.js            schema, validation, layer helpers
src/storage.js           chrome.storage.local wrapper
src/io.js                export / import / bundled layouts
layouts/                 bundled layouts (index.json)
```

Plain JavaScript ES modules with JSDoc types (`// @ts-check`) — no build tooling, so the code
reviewed in the Chrome Web Store is exactly the code in this repository.

## Privacy

See [PRIVACY.md](PRIVACY.md). Permissions are only `sidePanel` and `storage`; there are no
content scripts, no host permissions and no network requests.
