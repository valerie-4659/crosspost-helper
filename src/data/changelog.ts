export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-05-17",
    items: [
      "Initial Tauri, Vue, Pinia, Tailwind, TypeScript, and SQLite application foundation.",
      "Local folder indexing with image metadata, dimensions, and perceptual hashes.",
      "Manual library workflow with large preview, multi-select, exclude/restore, export, and per-target posting marks.",
      "Import/export foundation for local-first backups and machine migration.",
      "Light/dark theme switcher and About page for Valerie.",
    ],
  },
];
