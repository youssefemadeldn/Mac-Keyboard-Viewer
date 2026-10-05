# Privacy Policy — Mac Keyboard Viewer

_Last updated: 2026-10-05_

Mac Keyboard Viewer does **not** collect, transmit, sell or share any data.

## What the extension stores
- Keyboard layouts you capture or import, and your settings (selected layout, auto-detect,
  ISO key swap), are saved with `chrome.storage.local` **on your device only**.
- Captured layouts include the `navigator.userAgent` string as a reference note. It stays in local
  storage and is only included in files you export yourself.

## What the extension does not do
- No network requests, analytics, telemetry, ads or third-party code.
- No content scripts and no host permissions: it cannot read or change any web page.
- It only receives keypresses while its own side panel is focused. Keypresses are used to
  record layout characters (Capture Mode) and to highlight keys (Viewer); nothing is logged
  or sent anywhere.

## Permissions
| Permission  | Why |
|-------------|-----|
| `sidePanel` | To show the keyboard in Chrome's side panel. |
| `storage`   | To keep your layouts and settings on your device. |

## Your control
Delete individual layouts under **Layouts**, or remove all data by uninstalling the extension.
Exported JSON files are created only when you click **Export** and are saved where you choose.

## Contact
Questions: open an issue in this extension's GitHub repository.
