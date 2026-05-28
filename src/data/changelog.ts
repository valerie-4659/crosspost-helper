export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "0.2.39",
    date: "2026-05-28",
    items: [
      "refactor(personas): merge Tone+StyleNotes into single Behavior Rules textarea",
    ],
  },
  {
    version: "0.2.38",
    date: "2026-05-28",
    items: [
      "feat(qt): Tagged-by field → TFTT @handle line 3",
    ],
  },
  {
    version: "0.2.37",
    date: "2026-05-28",
    items: [
      "fix(library): remove header subtitle, give header breathing room (py-4)",
      "feat: settings navigation + QT event name input",
      "chore: remove temp build/commit helper scripts",
      "feat: writing personas + X Premium+ + story narratives",
      "fix(x-adapter): close hashtag autocomplete + finalise blue hashtag nodes after text inject",
    ],
  },
  {
    version: "0.2.36",
    date: "2026-05-28",
    items: [
      "feat: curated NSFW/adult AI-art tag pool for X (migration 005)",
    ],
  },
  {
    version: "0.2.35",
    date: "2026-05-28",
    items: [
      "fix: edited AI text now correctly sent to extension",
    ],
  },
  {
    version: "0.2.34",
    date: "2026-05-28",
    items: [
      "feat: editable AI result, modern filter UI, per-network skip, history page",
    ],
  },
  {
    version: "0.2.33",
    date: "2026-05-26",
    items: [
      "Release v0.2.33",
    ],
  },
  {
    version: "0.2.32",
    date: "2026-05-26",
    items: [
      "feat: AI post modal in library, optional perspective, one-step queue",
      "feat: library sorting (date/name/pick), folder history, fix text injection",
    ],
  },
  {
    version: "0.2.31",
    date: "2026-05-26",
    items: [
      "feat: AI post modal in library, optional perspective, one-step queue",
      "feat: library sorting (date/name/pick), folder history, fix text injection",
    ],
  },
  {
    version: "0.2.30",
    date: "2026-05-26",
    items: [
      "feat: shared AiPostPanel, post types, perspective, incremental scan, network hide filter, library sorting",
    ],
  },
  {
    version: "0.2.29",
    date: "2026-05-26",
    items: [
      "feat: shared AiPostPanel, post types, perspective, incremental scan, network hide filter, library sorting",
    ],
  },
  {
    version: "0.2.28",
    date: "2026-05-23",
    items: [
      "Release v0.2.28",
    ],
  },
  {
    version: "0.2.27",
    date: "2026-05-23",
    items: [
      "feat: AI hint input + full-res picker preview",
      "fix: text injection duplicates + debug queue-slot diagnostics",
    ],
  },
  {
    version: "0.2.26",
    date: "2026-05-22",
    items: [
      "feat: Job Queue system + unified Send-to-Extension flow",
    ],
  },
  {
    version: "0.2.25",
    date: "2026-05-22",
    items: [
      "Release v0.2.25",
    ],
  },
  {
    version: "0.2.24",
    date: "2026-05-22",
    items: [
      "feat: cross-folder collection tray, folder preview thumbnails, AI post generator, multi-network queue",
    ],
  },
  {
    version: "0.2.23",
    date: "2026-05-22",
    items: [
      "Release v0.2.23",
    ],
  },
  {
    version: "0.2.22",
    date: "2026-05-22",
    items: [
      "Release v0.2.22",
    ],
  },
  {
    version: "0.2.21",
    date: "2026-05-21",
    items: [
      "fix: use convertFileSrc for multi-pick slot images (Windows path fix)",
    ],
  },
  {
    version: "0.2.20",
    date: "2026-05-21",
    items: [
      "feat: Multi-Pick mode in Picker — folder selection, N random slots, fill/remove, queue for extension",
    ],
  },
  {
    version: "0.2.19",
    date: "2026-05-20",
    items: [
      "feat: Collections — named image sets across folders, queue for any network",
      "fix: DeviantArt adapter — use getQueuedImages, return imageIds[], add non-www manifest entry",
      "fix: add www.civitai.red to manifest content_scripts and popup PLATFORMS",
    ],
  },
  {
    version: "0.2.18",
    date: "2026-05-20",
    items: [
      "fix: X injection — click media button first to init React handler, then CDP setFileInputFiles",
    ],
  },
  {
    version: "0.2.17",
    date: "2026-05-20",
    items: [
      "fix: X image injection via CDP DOM.setFileInputFiles — trusted native change event",
      "fix: X injection — drag-drop primary, revert native-event regression",
    ],
  },
  {
    version: "0.2.16",
    date: "2026-05-20",
    items: [
      "fix: X injection — use getter override + always fire native change event",
      "feat: sticky compact action toolbar in Library — no more scrolling to post",
      "feat: show per-network post counts on folder cards in Library",
      "feat: auto-scroll to last visited folder on back-navigation",
      "feat: library grid 3→6 columns responsive (3/4/5/6)",
    ],
  },
  {
    version: "0.2.15",
    date: "2026-05-20",
    items: [
      "feat: show full image in library grid (natural aspect ratio, no crop)",
    ],
  },
  {
    version: "0.2.14",
    date: "2026-05-20",
    items: [
      "Release v0.2.14",
    ],
  },
  {
    version: "0.2.13",
    date: "2026-05-20",
    items: [
      "fix: X adapter — use React internal props for file injection (React 17/18 event delegation)",
      "feat: highlight last visited folder when navigating back",
      "feat: excluded folders — mark folder as done, hidden from Picker + Library by default",
    ],
  },
  {
    version: "0.2.12",
    date: "2026-05-20",
    items: [
      "feat: delete images/folders, lightbox nav+select+delete, hard reset",
    ],
  },
  {
    version: "0.2.11",
    date: "2026-05-19",
    items: [
      "feat: multi-image posting — app controls selection, extension injects queue",
    ],
  },
  {
    version: "0.2.10",
    date: "2026-05-19",
    items: [
      "fix: use 3-slash localfile:/// URLs to preserve Windows drive letter",
    ],
  },
  {
    version: "0.2.9",
    date: "2026-05-19",
    items: [
      "fix: use 3-slash localfile:/// URLs to preserve Windows drive letter",
    ],
  },
  {
    version: "0.2.8",
    date: "2026-05-19",
    items: [
      "fix: replace net.fetch with fs.promises.readFile in localfile:// handler",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-05-19",
    items: [
      "fix: handle duplicate backslash/forwardslash rows in path migration",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-05-19",
    items: [
      "fix: auto-migrate backslash paths on DB open + fix thumbnail URL on Windows",
    ],
  },
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
