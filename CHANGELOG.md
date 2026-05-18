# Changelog

## v0.2.0 - 2026-05-18

- chore: ignore dist-electron/ build output in git
- feat: browser extension + Firefox support + in-app download page


## v0.1.3 - 2026-05-17

- Release v0.1.3


## v0.1.2 - 2026-05-17

- fix: target Windows x64 for cross-platform compatibility


## v0.1.1 - 2026-05-17

- feat: migrate from Tauri to Electron
- feat: add cross-platform release workflow
- docs: document unsigned releases
- feat: add about page and theme switcher
- feat: add bulk image posting workflow
- feat: make library the manual posting workflow
- fix: allow saving local folder sources
- fix: add tauri application icons
- chore: enable tauri asset protocol
- feat: add hash-aware scan and import merge
- feat: build picker library and scan UI
- feat: add local image data layer
- chore: scaffold tauri vue foundation


## v0.1.0 - 2026-05-17

- Initial Electron (macOS + Windows), Vue, Pinia, Tailwind, TypeScript, and SQLite application foundation.
- Local folder indexing with automatic thumbnail generation for fast library loading.
- Finder-like folder navigation with breadcrumb bar — browse into subfolders, images only show at the correct depth.
- Native OS drag-and-drop: drag images directly into X, Discord, Finder, or any app as real files.
- Multi-select, bulk mark-as-posted, exclude/restore workflow for the full image library.
- Posting Picker for random image suggestions with per-target rules and skip support.
- Light/dark theme switcher and About page.
