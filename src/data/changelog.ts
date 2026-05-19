export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "0.2.5",
    date: "2026-05-19",
    items: [
      "perf: batch-index local folder scans in a single SQL transaction",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-05-19",
    items: [
      "fix: normalise path separators + fix localfile:// handler on Windows",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-05-19",
    items: [
      "feat: offload folder scan to Worker Thread to keep UI responsive",
      "feat: live scan progress indicator",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-05-19",
    items: [
      "fix: set vite base to './' for Electron file:// protocol on Windows",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-05-19",
    items: [
      "fix: clean dist-electron/ before build + filter artifacts by version",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-05-18",
    items: [
      "chore: ignore dist-electron/ build output in git",
      "feat: browser extension + Firefox support + in-app download page",
    ],
  },
  {
    version: "0.1.3",
    date: "2026-05-17",
    items: [
      "Release v0.1.3",
    ],
  },
  {
    version: "0.1.2",
    date: "2026-05-17",
    items: [
      "fix: target Windows x64 for cross-platform compatibility",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-05-17",
    items: [
      "feat: migrate from Tauri to Electron",
      "feat: add cross-platform release workflow",
      "docs: document unsigned releases",
      "feat: add about page and theme switcher",
      "feat: add bulk image posting workflow",
      "feat: make library the manual posting workflow",
      "fix: allow saving local folder sources",
      "fix: add tauri application icons",
      "chore: enable tauri asset protocol",
      "feat: add hash-aware scan and import merge",
      "feat: build picker library and scan UI",
      "feat: add local image data layer",
      "chore: scaffold tauri vue foundation",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-05-17",
    items: [
      "Initial Electron (macOS + Windows), Vue, Pinia, Tailwind, TypeScript, and SQLite foundation.",
      "Local folder indexing with automatic thumbnail generation for fast library loading.",
      "Finder-like folder navigation with breadcrumb bar.",
      "Native OS drag-and-drop: drag images into X, Discord, Finder, or any app as real files.",
      "Multi-select, bulk mark-as-posted, exclude/restore workflow.",
      "Posting Picker for random image suggestions with per-target rules and skip support.",
      "Light/dark theme switcher and About page.",
    ],
  },
];
