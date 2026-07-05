export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const changelogEntries: ChangelogEntry[] = [
  {
    version: "0.3.19",
    date: "2026-07-05",
    items: [
      "fix: bridge trigger reliability and picker header layout",
    ],
  },
  {
    version: "0.3.18",
    date: "2026-07-04",
    items: [
      "Release v0.3.18",
    ],
  },
  {
    version: "0.3.17",
    date: "2026-07-04",
    items: [
      "feat: add file watcher for automatic library updates",
    ],
  },
  {
    version: "0.3.16",
    date: "2026-07-03",
    items: [
      "Release v0.3.16",
    ],
  },
  {
    version: "0.3.15",
    date: "2026-07-02",
    items: [
      "fix: enforce emoji rule in story posts when persona has style notes",
    ],
  },
  {
    version: "0.3.14",
    date: "2026-07-02",
    items: [
      "fix: use CDP Input.insertText for X text injection to properly update Lexical state",
    ],
  },
  {
    version: "0.3.13",
    date: "2026-07-02",
    items: [
      "fix: use CDP userGesture fill as reliable text injection for X compose",
    ],
  },
  {
    version: "0.3.12",
    date: "2026-07-02",
    items: [
      "Release v0.3.12",
    ],
  },
  {
    version: "0.3.11",
    date: "2026-07-02",
    items: [
      "fix: ensure text is posted and only one X tab handles auto-inject",
    ],
  },
  {
    version: "0.3.10",
    date: "2026-07-02",
    items: [
      "feat: add persona personality rules guide to settings UI",
      "fix: enforce persona voice + emojis in morning/goodnight/engagement posts",
      "feat: auto-inject + optional auto-post for X via Chrome extension",
    ],
  },
  {
    version: "0.3.9",
    date: "2026-07-01",
    items: [
      "fix: style_notes are sole authority on emoji when persona is active",
    ],
  },
  {
    version: "0.3.8",
    date: "2026-07-01",
    items: [
      "Release v0.3.8",
    ],
  },
  {
    version: "0.3.7",
    date: "2026-07-01",
    items: [
      "feat: personality enforcement, video results redesign, Topaz empty state",
    ],
  },
  {
    version: "0.3.6",
    date: "2026-07-01",
    items: [
      "Release v0.3.6",
    ],
  },
  {
    version: "0.3.5",
    date: "2026-06-30",
    items: [
      "fix: replace run-all-migrations-every-start with tracked migrations",
    ],
  },
  {
    version: "0.3.4",
    date: "2026-06-30",
    items: [
      "refine: video cards in library — thumbnail, controls, AI post source image",
      "feat: download button in video queue panel for completed jobs",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-06-30",
    items: [
      "feat: picker folder selector, video toggle, and video preview",
      "fix: image card action strip overflow + always-visible network indicators",
      "refine: persona form simplified to single personality rules field",
      "refine: visual detail as springboard OK, multi-character story support",
      "refine: no-visual-description rule, content-level-aware post types, mood tags",
      "refine: explicit analyse → content-level → write pipeline for post generation",
      "refine: shift post generation from marketing to authentic personality expression",
      "refine: AI prompt engineering for video, image, and description generation",
      "feat: job queue download, AI instructions, and library navigation",
      "fix: multi-pick fair shuffle, stem sibling lookup, round refresh, notifications",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-06-30",
    items: [
      "feat: fair-shuffle picker and stable image identity via stem_id",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-06-29",
    items: [
      "chore: release v0.3.0",
      "feat: sequential Wavespeed job queue with drag-and-drop reordering",
    ],
  },
  {
    version: "0.2.134",
    date: "2026-06-29",
    items: [
      "fix: react to bridge:images-posted IPC event so Library updates after extension marks posts",
      "feat: merge Image/Video queues, Library UX improvements, Electron dev mode",
    ],
  },
  {
    version: "0.2.133",
    date: "2026-06-26",
    items: [
      "fix: autocomplete fix",
    ],
  },
  {
    version: "0.2.132",
    date: "2026-06-26",
    items: [
      "Release v0.2.132",
    ],
  },
  {
    version: "0.2.131",
    date: "2026-06-26",
    items: [
      "feat: Bluesky direct post via AT Protocol + Library prev/next folder nav",
    ],
  },
  {
    version: "0.2.130",
    date: "2026-06-26",
    items: [
      "fix: Windows drag & drop + button order in AI Post panel",
    ],
  },
  {
    version: "0.2.129",
    date: "2026-06-25",
    items: [
      "feat: CivitAI direct post via MCP API (no browser extension needed)",
    ],
  },
  {
    version: "0.2.128",
    date: "2026-06-25",
    items: [
      "feat: CivitAI direct post via MCP API (no browser extension needed)",
    ],
  },
  {
    version: "0.2.127",
    date: "2026-06-19",
    items: [
      "feat: better context mode",
    ],
  },
  {
    version: "0.2.126",
    date: "2026-06-16",
    items: [
      "fix: AI Persona handling",
    ],
  },
  {
    version: "0.2.125",
    date: "2026-06-13",
    items: [
      "Release v0.2.125",
    ],
  },
  {
    version: "0.2.124",
    date: "2026-06-12",
    items: [
      "Release v0.2.124",
    ],
  },
  {
    version: "0.2.123",
    date: "2026-06-12",
    items: [
      "Release v0.2.123",
    ],
  },
  {
    version: "0.2.122",
    date: "2026-06-11",
    items: [
      "fix: ImageGeneratePanel — gate imagePath on useRefImage toggle",
    ],
  },
  {
    version: "0.2.121",
    date: "2026-06-11",
    items: [
      "fix: resolve 'images field required' error on image recreation",
    ],
  },
  {
    version: "0.2.120",
    date: "2026-06-11",
    items: [
      "Release v0.2.120",
    ],
  },
  {
    version: "0.2.119",
    date: "2026-06-10",
    items: [
      "refactor: extract VIDEO_MODELS to shared composable; fix rerun dialog models",
    ],
  },
  {
    version: "0.2.118",
    date: "2026-06-10",
    items: [
      "feat: overhaul video generation — 8 WaveSpeed models, per-model params, camera-moves checkbox, image queue bridge fix",
    ],
  },
  {
    version: "0.2.117",
    date: "2026-06-09",
    items: [
      "Release v0.2.117",
    ],
  },
  {
    version: "0.2.116",
    date: "2026-06-09",
    items: [
      "Release v0.2.116",
    ],
  },
  {
    version: "0.2.115",
    date: "2026-06-09",
    items: [
      "feat(topaz): full param UI — Standard/Realism/Wonder3, creativity, enhancement, scale, outputs, preserve faces, AI prompt",
    ],
  },
  {
    version: "0.2.114",
    date: "2026-06-09",
    items: [
      "feat(topaz): full param UI — Standard/Realism/Wonder3, creativity, enhancement, scale, outputs, preserve faces, AI prompt",
    ],
  },
  {
    version: "0.2.113",
    date: "2026-06-09",
    items: [
      "feat(ai-post): add 'Send text to Plugin' button for queue-panel mode",
    ],
  },
  {
    version: "0.2.112",
    date: "2026-06-09",
    items: [
      "refactor(ai-post): replace custom post modals with reusable AiPostPanel component",
    ],
  },
  {
    version: "0.2.111",
    date: "2026-06-09",
    items: [
      "feat(ai-post): add AI post generator to Image and Video Queue panels",
    ],
  },
  {
    version: "0.2.110",
    date: "2026-06-09",
    items: [
      "fix(drag): fix native file drag-out in ImageCard, ImagePreview and ImageLightbox",
      "feat(topaz-queue): add result thumbnail preview and Reveal button",
      "fix(topaz): Library and Picker modals are now fire-and-forget",
    ],
  },
  {
    version: "0.2.109",
    date: "2026-06-09",
    items: [
      "Release v0.2.109",
    ],
  },
  {
    version: "0.2.108",
    date: "2026-06-09",
    items: [
      "feat(topaz): configurable output folder in Settings",
      "feat(topaz-queue): background upscale jobs in Image Queue",
    ],
  },
  {
    version: "0.2.107",
    date: "2026-06-09",
    items: [
      "Release v0.2.107",
    ],
  },
  {
    version: "0.2.106",
    date: "2026-06-09",
    items: [
      "feat(prompt): integrate detailed Image Prompt Safety Rules into sfwBlock and userPrompt",
    ],
  },
  {
    version: "0.2.105",
    date: "2026-06-09",
    items: [
      "fix(topaz): use download_url field from API response — Topaz returns download_url not url",
      "feat(image-queue): Upscale with Topaz button on completed jobs",
    ],
  },
  {
    version: "0.2.104",
    date: "2026-06-09",
    items: [
      "fix: replace inline if-statements in @click.self with guard methods — Vue template compiler rejects if as an expression",
      "fix: resolve TS2339 errors in ImageQueuePanel and VideoQueuePanel",
      "fix(image-queue): remove inner double-quotes from :placeholder to fix TS1005 parse error",
      "feat(image-queue): New Job modal for txt2img generation with AI prompt enhancement",
      "feat(topaz): integrate Topaz Labs Image API for upscaling in Library, Picker, and Lightbox",
      "feat: download generated images, make-video from image queue, image drop on video queue",
      "feat(image-queue): AI analyse button in re-run modal — regenerate prompt for currently selected model",
    ],
  },
  {
    version: "0.2.103",
    date: "2026-06-09",
    items: [
      "fix(image-queue): remove inner double-quotes from :placeholder to fix TS1005 parse error",
      "feat(image-queue): New Job modal for txt2img generation with AI prompt enhancement",
      "feat(topaz): integrate Topaz Labs Image API for upscaling in Library, Picker, and Lightbox",
      "feat: download generated images, make-video from image queue, image drop on video queue",
      "feat(image-queue): AI analyse button in re-run modal — regenerate prompt for currently selected model",
    ],
  },
  {
    version: "0.2.102",
    date: "2026-06-09",
    items: [
      "feat(image-queue): New Job modal for txt2img generation with AI prompt enhancement",
      "feat(topaz): integrate Topaz Labs Image API for upscaling in Library, Picker, and Lightbox",
      "feat: download generated images, make-video from image queue, image drop on video queue",
      "feat(image-queue): AI analyse button in re-run modal — regenerate prompt for currently selected model",
    ],
  },
  {
    version: "0.2.101",
    date: "2026-06-09",
    items: [
      "feat(image-queue): New Job modal for txt2img generation with AI prompt enhancement",
      "feat(topaz): integrate Topaz Labs Image API for upscaling in Library, Picker, and Lightbox",
      "feat: download generated images, make-video from image queue, image drop on video queue",
      "feat(image-queue): AI analyse button in re-run modal — regenerate prompt for currently selected model",
    ],
  },
  {
    version: "0.2.100",
    date: "2026-06-09",
    items: [
      "feat: download generated images, make-video from image queue, image drop on video queue",
      "feat(image-queue): AI analyse button in re-run modal — regenerate prompt for currently selected model",
    ],
  },
  {
    version: "0.2.99",
    date: "2026-06-09",
    items: [
      "feat(image-gen): model-specific API params — aspect/resolution for GPT+NanaBanana, size for others, quality/format/strength only where supported",
    ],
  },
  {
    version: "0.2.98",
    date: "2026-06-09",
    items: [
      "fix(drag): use async ipcRenderer.send for startDrag — sendSync blocked renderer and broke macOS drag transfer",
      "feat(image-models): sync to real Wavespeed model list — correct slugs, badges, Seedream support, ultraStrict per provider",
      "feat(image-queue): Edit & Re-run modal + ultra-strict SFW rewrite for GPT Image 2 / Nano Banana",
      "feat(image-recreate): aspect ratio auto-detect, ref-image toggle, resolution/quality/format, SFW model-specific prompting",
    ],
  },
  {
    version: "0.2.97",
    date: "2026-06-08",
    items: [
      "Release v0.2.97",
    ],
  },
  {
    version: "0.2.96",
    date: "2026-06-08",
    items: [
      "feat(image-recreate): Wavespeed image generation pipeline — ImageGeneratePanel, ImageQueuePanel, ImageQueuePage, 🖼 card button, Library modal, Picker sidebar section, dual-queue background poller",
    ],
  },
  {
    version: "0.2.95",
    date: "2026-06-08",
    items: [
      "fix(video-queue): move to dedicated nav page — remove misplaced modal buttons from Library/Picker sidebar",
    ],
  },
  {
    version: "0.2.94",
    date: "2026-06-08",
    items: [
      "feat(video-queue): persistent Wavespeed job queue — DB storage, background poller in main, VideoQueuePanel with live updates",
    ],
  },
  {
    version: "0.2.93",
    date: "2026-06-08",
    items: [
      "fix(settings): use named method for Wavespeed dashboard link to avoid template window scope error",
      "feat(wavespeed): direct image-to-video submission — API key in Settings, Send to Wavespeed in VideoPromptPanel with polling",
    ],
  },
  {
    version: "0.2.92",
    date: "2026-06-08",
    items: [
      "feat(wavespeed): direct image-to-video submission — API key in Settings, Send to Wavespeed in VideoPromptPanel with polling",
    ],
  },
  {
    version: "0.2.91",
    date: "2026-06-08",
    items: [
      "feat(wavespeed): direct image-to-video submission — API key in Settings, Send to Wavespeed in VideoPromptPanel with polling",
    ],
  },
  {
    version: "0.2.90",
    date: "2026-06-07",
    items: [
      "feat: update",
      "fix(drag): native OS file drag — sendSync timing fix, img draggable=false; feat(video-prompt): Reveal in Finder button",
    ],
  },
  {
    version: "0.2.89",
    date: "2026-06-05",
    items: [
      "feat(picker): add Video Prompt Generator panel — reuses VideoPromptPanel component",
    ],
  },
  {
    version: "0.2.88",
    date: "2026-06-05",
    items: [
      "fix(library): move folder preview pin to image overlay (bottom-right), remove from action row",
    ],
  },
  {
    version: "0.2.87",
    date: "2026-06-05",
    items: [
      "Release v0.2.87",
    ],
  },
  {
    version: "0.2.86",
    date: "2026-06-04",
    items: [
      "fix(ai-panel): move OC blur handler to script to avoid template scope error",
      "fix(ai-panel): use window.setTimeout in blur handler for OC dropdown",
      "feat(ai-panel): OC multi-select with chip UI and localStorage autocomplete",
    ],
  },
  {
    version: "0.2.85",
    date: "2026-06-04",
    items: [
      "fix(ai-panel): move OC blur handler to script to avoid template scope error",
      "fix(ai-panel): use window.setTimeout in blur handler for OC dropdown",
      "feat(ai-panel): OC multi-select with chip UI and localStorage autocomplete",
    ],
  },
  {
    version: "0.2.84",
    date: "2026-06-04",
    items: [
      "fix(ai-panel): use window.setTimeout in blur handler for OC dropdown",
      "feat(ai-panel): OC multi-select with chip UI and localStorage autocomplete",
    ],
  },
  {
    version: "0.2.83",
    date: "2026-06-04",
    items: [
      "feat(ai-panel): OC multi-select with chip UI and localStorage autocomplete",
    ],
  },
  {
    version: "0.2.82",
    date: "2026-06-03",
    items: [
      "Release v0.2.82",
    ],
  },
  {
    version: "0.2.81",
    date: "2026-06-03",
    items: [
      "feat: adding video prompt generation",
    ],
  },
  {
    version: "0.2.80",
    date: "2026-06-03",
    items: [
      "fix(picker): compact sidebar UI, remove description text",
    ],
  },
  {
    version: "0.2.79",
    date: "2026-06-03",
    items: [
      "fix(types): add aiInstructions param to desktop.d.ts generatePost signature",
      "fix(types): add aiInstructions param to desktop.d.ts generatePost signature",
      "feat(ai-panel): platform switcher, AI instructions, compact UI, prompt overhaul",
    ],
  },
  {
    version: "0.2.78",
    date: "2026-06-03",
    items: [
      "feat(ai-panel): platform switcher, AI instructions, compact UI, prompt overhaul",
    ],
  },
  {
    version: "0.2.77",
    date: "2026-06-03",
    items: [
      "feat(ai-panel): platform switcher, AI instructions, compact UI, prompt overhaul",
    ],
  },
  {
    version: "0.2.76",
    date: "2026-06-02",
    items: [
      "blubb",
    ],
  },
  {
    version: "0.2.75",
    date: "2026-06-02",
    items: [
      "feat(library): add Send to Plugin + AI Post buttons to collection panel",
      "fix(bluesky): use document.createElement override for instance-level click suppression",
    ],
  },
  {
    version: "0.2.74",
    date: "2026-06-02",
    items: [
      "fix(bluesky): remove userGesture:true to prevent OS file picker from opening",
    ],
  },
  {
    version: "0.2.73",
    date: "2026-06-02",
    items: [
      "Release v0.2.73",
    ],
  },
  {
    version: "0.2.72",
    date: "2026-06-02",
    items: [
      "fix(bluesky): add userGesture:true + triple-interceptor for file input capture",
    ],
  },
  {
    version: "0.2.71",
    date: "2026-06-02",
    items: [
      "Release v0.2.71",
    ],
  },
  {
    version: "0.2.70",
    date: "2026-06-02",
    items: [
      "fix(bluesky): switch to CDP injection to bypass isolated-world limitation",
    ],
  },
  {
    version: "0.2.69",
    date: "2026-06-02",
    items: [
      "fix(bluesky): rewrite adapter for current bsky.app DOM structure",
    ],
  },
  {
    version: "0.2.68",
    date: "2026-06-02",
    items: [
      "feat(lightbox): add global archive/restore button + misc fixes",
      "fix(civitai): use CDP injection for react-dropzone compatibility",
    ],
  },
  {
    version: "0.2.67",
    date: "2026-06-01",
    items: [
      "fix(library): propagate mark-as-posted to filename-stem siblings",
    ],
  },
  {
    version: "0.2.66",
    date: "2026-06-01",
    items: [
      "fix(library): propagate mark-as-posted to filename-stem siblings",
    ],
  },
  {
    version: "0.2.65",
    date: "2026-06-01",
    items: [
      "fix(library): propagate mark-as-posted to filename-stem siblings",
    ],
  },
  {
    version: "0.2.64",
    date: "2026-06-01",
    items: [
      "fix(library): propagate mark-as-posted to filename-stem siblings",
    ],
  },
  {
    version: "0.2.63",
    date: "2026-06-01",
    items: [
      "fix(library): propagate mark-as-posted to filename-stem siblings",
    ],
  },
  {
    version: "0.2.62",
    date: "2026-06-01",
    items: [
      "chore: remove upload helper scripts",
      "feat(library): image upload via button, Drag & Drop, and clipboard paste",
      "fix(picker): restore computed import removed during cooldown refactor",
      "feat(picker): persist skip cooldown in DB (migration 008)",
      "feat(picker): skip cooldown (40% pool threshold) + global exclude",
      "fix(ai): enforce minimum 1-3 emojis in every output, especially story",
    ],
  },
  {
    version: "0.2.61",
    date: "2026-05-31",
    items: [
      "feat(ai): match text explicitness to image content level",
      "feat(ai): rebuild all post-type rules with proper perspective + variety",
      "fix(ai): story mode writes emotional narrative, not image description",
      "fix(ai): replace generic star/sparkle emojis with expressive NSFW-niche ones",
    ],
  },
  {
    version: "0.2.60",
    date: "2026-05-30",
    items: [
      "feat(ai): improve post generation quality",
    ],
  },
  {
    version: "0.2.59",
    date: "2026-05-30",
    items: [
      "fix(ai): QT Event ignores TFTT line when hint/context is set",
      "fix(types): add onQueueCleared/offQueueCleared to desktop.bridge type",
      "fix(library): clear collection only after Mark as Posted, not on queue send",
    ],
  },
  {
    version: "0.2.58",
    date: "2026-05-29",
    items: [
      "Release v0.2.58",
    ],
  },
  {
    version: "0.2.57",
    date: "2026-05-29",
    items: [
      "fix(extension): stale images on second post",
      "fix(library): close collection tray when collection is emptied",
    ],
  },
  {
    version: "0.2.56",
    date: "2026-05-29",
    items: [
      "fix(bridge): prevent browser caching of queue/image GET requests",
    ],
  },
  {
    version: "0.2.55",
    date: "2026-05-29",
    items: [
      "Release v0.2.55",
    ],
  },
  {
    version: "0.2.54",
    date: "2026-05-29",
    items: [
      "refactor(settings): remove emoji dropdown from persona form",
      "fix(ai): persona system message uses styleNotes directly, no conflicting emojiRule override",
      "fix(ai): suppress neutral-observer perspSuffix when persona is active",
    ],
  },
  {
    version: "0.2.53",
    date: "2026-05-29",
    items: [
      "Release v0.2.53",
    ],
  },
  {
    version: "0.2.52",
    date: "2026-05-29",
    items: [
      "fix(ai): persona and perspective are independent; post-type rules don't override persona tone",
      "fix(ai): persona default perspective = first-person, not neutral observer",
    ],
  },
  {
    version: "0.2.51",
    date: "2026-05-29",
    items: [
      "fix(ai): persona via system message — enforces voice, emoji and behavior rules",
      "fix(ai-panel): default max length = 180, remove auto option, clean preset labels",
    ],
  },
  {
    version: "0.2.50",
    date: "2026-05-29",
    items: [
      "feat(picker): send-mode split-button dropdown — same 3 modes as AiPostPanel",
    ],
  },
  {
    version: "0.2.49",
    date: "2026-05-29",
    items: [
      "feat: send-mode dropdown + fixed 180-char default",
      "fix(ai-panel): rename extension buttons to clear full-width labels",
    ],
  },
  {
    version: "0.2.48",
    date: "2026-05-28",
    items: [
      "fix(library): don't close AI panel after queuing — user closes it manually",
      "feat(ai-panel): Images only button — queues images, clears text from bridge, copies text+tags to clipboard",
      "feat(ai-panel): add 360/540/720 char presets for multi-image posts",
    ],
  },
  {
    version: "0.2.47",
    date: "2026-05-28",
    items: [
      "fix(ai): send all images to AI + auto-scale text length per image count",
      "fix: 180-char limit ignored + tag cursor trap in X composer",
    ],
  },
  {
    version: "0.2.46",
    date: "2026-05-28",
    items: [
      "Release v0.2.46",
    ],
  },
  {
    version: "0.2.45",
    date: "2026-05-28",
    items: [
      "fix(extension/x): move cursor to start after injection so user can edit",
    ],
  },
  {
    version: "0.2.44",
    date: "2026-05-28",
    items: [
      "fix(ai): enforce all named characters from context must appear in post",
      "fix(library): restore folder+selection on remount (Settings→Library)",
    ],
  },
  {
    version: "0.2.43",
    date: "2026-05-28",
    items: [
      "fix(ai): context hint is now mandatory and first rule in prompt",
      "fix(settings): toggle knob overflow + correct ON translate offset",
    ],
  },
  {
    version: "0.2.42",
    date: "2026-05-28",
    items: [
      "fix(ai-panel): show Max length dropdown for ALL X posts, not just Premium+",
      "feat(library): persist selected images + collection across navigation/restart",
    ],
  },
  {
    version: "0.2.41",
    date: "2026-05-28",
    items: [
      "fix+feat: story token budget + per-post max-length selector",
      "fix: toggle alignment + library state persistence",
    ],
  },
  {
    version: "0.2.40",
    date: "2026-05-28",
    items: [
      "Release v0.2.40",
    ],
  },
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
