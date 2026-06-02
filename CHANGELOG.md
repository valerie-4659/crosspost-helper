# Changelog

## v0.2.69 - 2026-06-02

- fix(bluesky): rewrite adapter for current bsky.app DOM structure


## v0.2.68 - 2026-06-02

- feat(lightbox): add global archive/restore button + misc fixes
- fix(civitai): use CDP injection for react-dropzone compatibility


## v0.2.67 - 2026-06-01

- fix(library): propagate mark-as-posted to filename-stem siblings


## v0.2.66 - 2026-06-01

- fix(library): propagate mark-as-posted to filename-stem siblings


## v0.2.65 - 2026-06-01

- fix(library): propagate mark-as-posted to filename-stem siblings


## v0.2.64 - 2026-06-01

- fix(library): propagate mark-as-posted to filename-stem siblings


## v0.2.63 - 2026-06-01

- fix(library): propagate mark-as-posted to filename-stem siblings


## v0.2.62 - 2026-06-01

- chore: remove upload helper scripts
- feat(library): image upload via button, Drag & Drop, and clipboard paste
- fix(picker): restore computed import removed during cooldown refactor
- feat(picker): persist skip cooldown in DB (migration 008)
- feat(picker): skip cooldown (40% pool threshold) + global exclude
- fix(ai): enforce minimum 1-3 emojis in every output, especially story


## v0.2.61 - 2026-05-31

- feat(ai): match text explicitness to image content level
- feat(ai): rebuild all post-type rules with proper perspective + variety
- fix(ai): story mode writes emotional narrative, not image description
- fix(ai): replace generic star/sparkle emojis with expressive NSFW-niche ones


## v0.2.60 - 2026-05-30

- feat(ai): improve post generation quality


## v0.2.59 - 2026-05-30

- fix(ai): QT Event ignores TFTT line when hint/context is set
- fix(types): add onQueueCleared/offQueueCleared to desktop.bridge type
- fix(library): clear collection only after Mark as Posted, not on queue send


## v0.2.58 - 2026-05-29

- Release v0.2.58


## v0.2.57 - 2026-05-29

- fix(extension): stale images on second post
- fix(library): close collection tray when collection is emptied


## v0.2.56 - 2026-05-29

- fix(bridge): prevent browser caching of queue/image GET requests


## v0.2.55 - 2026-05-29

- Release v0.2.55


## v0.2.54 - 2026-05-29

- refactor(settings): remove emoji dropdown from persona form
- fix(ai): persona system message uses styleNotes directly, no conflicting emojiRule override
- fix(ai): suppress neutral-observer perspSuffix when persona is active


## v0.2.53 - 2026-05-29

- Release v0.2.53


## v0.2.52 - 2026-05-29

- fix(ai): persona and perspective are independent; post-type rules don't override persona tone
- fix(ai): persona default perspective = first-person, not neutral observer


## v0.2.51 - 2026-05-29

- fix(ai): persona via system message — enforces voice, emoji and behavior rules
- fix(ai-panel): default max length = 180, remove auto option, clean preset labels


## v0.2.50 - 2026-05-29

- feat(picker): send-mode split-button dropdown — same 3 modes as AiPostPanel


## v0.2.49 - 2026-05-29

- feat: send-mode dropdown + fixed 180-char default
- fix(ai-panel): rename extension buttons to clear full-width labels


## v0.2.48 - 2026-05-28

- fix(library): don't close AI panel after queuing — user closes it manually
- feat(ai-panel): Images only button — queues images, clears text from bridge, copies text+tags to clipboard
- feat(ai-panel): add 360/540/720 char presets for multi-image posts


## v0.2.47 - 2026-05-28

- fix(ai): send all images to AI + auto-scale text length per image count
- fix: 180-char limit ignored + tag cursor trap in X composer


## v0.2.46 - 2026-05-28

- Release v0.2.46


## v0.2.45 - 2026-05-28

- fix(extension/x): move cursor to start after injection so user can edit


## v0.2.44 - 2026-05-28

- fix(ai): enforce all named characters from context must appear in post
- fix(library): restore folder+selection on remount (Settings→Library)


## v0.2.43 - 2026-05-28

- fix(ai): context hint is now mandatory and first rule in prompt
- fix(settings): toggle knob overflow + correct ON translate offset


## v0.2.42 - 2026-05-28

- fix(ai-panel): show Max length dropdown for ALL X posts, not just Premium+
- feat(library): persist selected images + collection across navigation/restart


## v0.2.41 - 2026-05-28

- fix+feat: story token budget + per-post max-length selector
- fix: toggle alignment + library state persistence


## v0.2.40 - 2026-05-28

- Release v0.2.40


## v0.2.39 - 2026-05-28

- refactor(personas): merge Tone+StyleNotes into single Behavior Rules textarea


## v0.2.38 - 2026-05-28

- feat(qt): Tagged-by field → TFTT @handle line 3


## v0.2.37 - 2026-05-28

- fix(library): remove header subtitle, give header breathing room (py-4)
- feat: settings navigation + QT event name input
- chore: remove temp build/commit helper scripts
- feat: writing personas + X Premium+ + story narratives
- fix(x-adapter): close hashtag autocomplete + finalise blue hashtag nodes after text inject


## v0.2.36 - 2026-05-28

- feat: curated NSFW/adult AI-art tag pool for X (migration 005)


## v0.2.35 - 2026-05-28

- fix: edited AI text now correctly sent to extension


## v0.2.34 - 2026-05-28

- feat: editable AI result, modern filter UI, per-network skip, history page


## v0.2.33 - 2026-05-26

- Release v0.2.33


## v0.2.32 - 2026-05-26

- feat: AI post modal in library, optional perspective, one-step queue
- feat: library sorting (date/name/pick), folder history, fix text injection


## v0.2.31 - 2026-05-26

- feat: AI post modal in library, optional perspective, one-step queue
- feat: library sorting (date/name/pick), folder history, fix text injection


## v0.2.30 - 2026-05-26

- feat: shared AiPostPanel, post types, perspective, incremental scan, network hide filter, library sorting


## v0.2.29 - 2026-05-26

- feat: shared AiPostPanel, post types, perspective, incremental scan, network hide filter, library sorting


## v0.2.28 - 2026-05-23

- Release v0.2.28


## v0.2.27 - 2026-05-23

- feat: AI hint input + full-res picker preview
- fix: text injection duplicates + debug queue-slot diagnostics


## v0.2.26 - 2026-05-22

- feat: Job Queue system + unified Send-to-Extension flow


## v0.2.25 - 2026-05-22

- Release v0.2.25


## v0.2.24 - 2026-05-22

- feat: cross-folder collection tray, folder preview thumbnails, AI post generator, multi-network queue


## v0.2.23 - 2026-05-22

- Release v0.2.23


## v0.2.22 - 2026-05-22

- Release v0.2.22


## v0.2.21 - 2026-05-21

- fix: use convertFileSrc for multi-pick slot images (Windows path fix)


## v0.2.20 - 2026-05-21

- feat: Multi-Pick mode in Picker — folder selection, N random slots, fill/remove, queue for extension


## v0.2.19 - 2026-05-20

- feat: Collections — named image sets across folders, queue for any network
- fix: DeviantArt adapter — use getQueuedImages, return imageIds[], add non-www manifest entry
- fix: add www.civitai.red to manifest content_scripts and popup PLATFORMS


## v0.2.18 - 2026-05-20

- fix: X injection — click media button first to init React handler, then CDP setFileInputFiles


## v0.2.17 - 2026-05-20

- fix: X image injection via CDP DOM.setFileInputFiles — trusted native change event
- fix: X injection — drag-drop primary, revert native-event regression


## v0.2.16 - 2026-05-20

- fix: X injection — use getter override + always fire native change event
- feat: sticky compact action toolbar in Library — no more scrolling to post
- feat: show per-network post counts on folder cards in Library
- feat: auto-scroll to last visited folder on back-navigation
- feat: library grid 3→6 columns responsive (3/4/5/6)


## v0.2.15 - 2026-05-20

- feat: show full image in library grid (natural aspect ratio, no crop)


## v0.2.14 - 2026-05-20

- Release v0.2.14


## v0.2.13 - 2026-05-20

- fix: X adapter — use React internal props for file injection (React 17/18 event delegation)
- feat: highlight last visited folder when navigating back
- feat: excluded folders — mark folder as done, hidden from Picker + Library by default


## v0.2.12 - 2026-05-20

- feat: delete images/folders, lightbox nav+select+delete, hard reset


## v0.2.11 - 2026-05-19

- feat: multi-image posting — app controls selection, extension injects queue


## v0.2.10 - 2026-05-19

- fix: use 3-slash localfile:/// URLs to preserve Windows drive letter


## v0.2.9 - 2026-05-19

- fix: use 3-slash localfile:/// URLs to preserve Windows drive letter


## v0.2.8 - 2026-05-19

- fix: replace net.fetch with fs.promises.readFile in localfile:// handler


## v0.2.7 - 2026-05-19

- fix: handle duplicate backslash/forwardslash rows in path migration


## v0.2.6 - 2026-05-19

- fix: auto-migrate backslash paths on DB open + fix thumbnail URL on Windows


## v0.2.5 - 2026-05-19

- perf: batch-index local folder scans in a single SQL transaction


## v0.2.4 - 2026-05-19

- fix: normalise path separators + fix localfile:// handler on Windows


## v0.2.3 - 2026-05-19

- feat: offload folder scan to Worker Thread to keep UI responsive
- feat: live scan progress indicator


## v0.2.2 - 2026-05-19

- fix: set vite base to './' for Electron file:// protocol on Windows


## v0.2.1 - 2026-05-19

- fix: clean dist-electron/ before build + filter artifacts by version


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
