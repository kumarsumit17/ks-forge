---
type: Reference
title: Settings file
description: Where settings.json lives, every setting with its default, and how the app reads a file that has mistakes.
tags: [settings, json, reference]
---

# Settings file

One `settings.json`, in the app's config folder: `~/Library/Application Support/com.ks.forge/` on macOS, `%APPDATA%\com.ks.forge\` on Windows. **Open settings file** (command palette, settings screen) opens it in the system's text editor. The app writes the whole file when a setting changes on the settings screen, and applies an outside edit within a second of saving.

## Reading
- A file that is not valid JSON is ignored: the app keeps its last good settings and shows "The settings file has a mistake".
- A setting with a wrong value takes its default and is named in a notice; **Save the fixed file** writes the file back with the defaults filled in.
- Shells found on the computer are added to `profiles` unless their id is in `hiddenProfiles`.

## Settings

| Key | Default | Values |
|---|---|---|
| `language` | `"system"` | `"system"`, `"en"`, `"hi"` |
| `followSystem` | `true` | follow the system's light or dark look |
| `lightTheme`, `darkTheme` | `"forge-day"`, `"forge-night"` | theme ids, used while `followSystem` is on |
| `theme` | `"forge-night"` | theme id, used while `followSystem` is off |
| `accent` | `""` | `""` (the theme's) or `#rrggbb` |
| `customThemes` | `[]` | imported themes: `id`, `name`, `dark` and 21 `#rrggbb` colours (`background`, `foreground`, `cursor`, `selection`, `accent`, the 8 colours and 8 bright colours) |
| `fontFamily` | macOS `"ui-monospace, Menlo"`, Windows `"Cascadia Mono, Consolas"` | a font list |
| `fontSize` | `13` | 6–48 |
| `lineHeight` | `1.2` | 0.8–2.5 |
| `fontWeight` | `"normal"` | `normal`, `300`, `400`, `500`, `600`, `bold` |
| `ligatures` | `true` | |
| `cursorStyle`, `cursorBlink` | `"block"`, `true` | `block`, `bar`, `underline` |
| `padding` | `8` | 0–48 pixels |
| `scrollback` | `10000` | 0–200000 lines |
| `copyOnSelect` | `false` | |
| `confirmPaste` | `true` | ask before pasting several lines or `sudo` |
| `confirmClose` | `true` | ask before closing a running program (macOS can tell; Windows cannot) |
| `rightClickPaste` | Windows `true`, macOS `false` | right-click copies a selection or pastes; off shows a menu |
| `optionAsMeta` | `"none"` | macOS: `none`, `left`, `right` or `both` Option keys act as Meta (v0.1.0's `optionIsMeta: true` reads as `both`) |
| `secureKeyboardEntry` | `false` | macOS: Secure Keyboard Entry (also in the app menu) |
| `ctrlCCopies`, `ctrlVPastes` | Windows `true`, macOS `false` | Windows: Ctrl+C copies selected text (otherwise interrupts), Ctrl+V pastes |
| `backgroundBlur`, `backgroundOpacity` | `false`, `0.85` | see-through background with the system's blur; opacity 0.5–1 |
| `notifyLongCommands` | `true` | a notification when a command of 10 s or more ends while the window is in the back |
| `screenReaderMode` | `"auto"` | `auto` (follows VoiceOver, Narrator, NVDA), `on`, `off` |
| `newTabsInCurrentFolder` | `true` | needs shell integration |
| `restoreSession` | `true` | reopen the windows, tabs and folders of the last run (`session.json` beside the app's data) |
| `showTabIcons` | `true` | |
| `defaultProfile` | the login shell (macOS) or the first found | profile id |
| `profiles` | the shells found | `id`, `name`, `program`, `args`, `cwd`, `env`, `icon`, `theme`, `shellIntegration`, `runAsAdmin` (Windows) |
| `hiddenProfiles` | `[]` | ids of found shells removed from the list |
| `keybindings` | `{}` | action id → shortcut (`"cmd+shift+t"`, `"ctrl+alt+left"`, `"mod+d"`); `""` removes a default |
| `autoUpdate` | `true` | the daily update check |

Action ids are the list `ACTIONS` in `shared/src/lib/keys.ts` (`newTab`, `splitRight`, `palette`, …); the settings screen's Keyboard section shows each with its shortcut.
