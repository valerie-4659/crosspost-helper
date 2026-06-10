/**
 * Shared video-model definitions used by VideoPromptPanel, VideoQueuePanel,
 * and ImageQueuePanel (make-video feature).
 *
 * Single source of truth — keep in sync with WAVESPEED_VIDEO_ENDPOINT_MAP
 * and buildVideoBody in electron/main.cjs.
 */

export const VIDEO_MODELS = [
  {
    value: "wan_2_2_spicy",
    label: "WAN 2.2 Spicy",
    nsfw: true,
    strictChinese: false,
    resolutions: ["480p", "720p"] as string[],
    durations: [5, 8],
    hasEndImage: false,
    hasAudio: false,
    hasMovement: false,
  },
  {
    value: "wan_2_5",
    label: "WAN 2.5",
    nsfw: false,
    strictChinese: false,
    resolutions: ["480p", "720p"] as string[],
    durations: [5, 8],
    hasEndImage: false,
    hasAudio: false,
    hasMovement: false,
  },
  {
    value: "wan_2_7",
    label: "WAN 2.7",
    nsfw: false,
    strictChinese: false,
    resolutions: ["720p", "1080p"] as string[],
    durations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15],
    hasEndImage: true,
    hasAudio: false,
    hasMovement: false,
  },
  {
    value: "kling_v3_0_pro",
    label: "Kling 3.0 Pro",
    nsfw: false,
    strictChinese: true,
    resolutions: [] as string[],
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15],
    hasEndImage: true,
    hasAudio: true,
    hasMovement: false,
  },
  {
    value: "grok_imagine",
    label: "Grok Imagine",
    nsfw: false,
    strictChinese: false,
    resolutions: ["480p", "720p"] as string[],
    durations: [6, 10],
    hasEndImage: false,
    hasAudio: false,
    hasMovement: false,
  },
  {
    value: "seedance_2_0",
    label: "Seedance 2.0",
    nsfw: false,
    strictChinese: true,
    resolutions: ["720p", "1080p"] as string[],
    durations: [4, 5, 6, 7, 8, 9, 10, 12, 15],
    hasEndImage: false,
    hasAudio: true,
    hasMovement: false,
  },
  {
    value: "seedance_1_5_pro",
    label: "Seedance 1.5 Pro",
    nsfw: false,
    strictChinese: true,
    resolutions: ["720p", "1080p"] as string[],
    durations: [4, 5, 6, 7, 8, 9, 10],
    hasEndImage: false,
    hasAudio: true,
    hasMovement: false,
  },
  {
    value: "vidu_q3",
    label: "Vidu Q3",
    nsfw: false,
    strictChinese: true,
    resolutions: ["540p", "720p", "1080p"] as string[],
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
    hasEndImage: false,
    hasAudio: true,
    hasMovement: true,
  },
] as const;

export type VideoModelDef = (typeof VIDEO_MODELS)[number];
export type VideoModelValue = VideoModelDef["value"];

/** Returns the config object for a given model value, falling back to wan_2_5. */
export function getVideoModelCfg(value: string): VideoModelDef {
  return (VIDEO_MODELS.find((m) => m.value === value) ?? VIDEO_MODELS[1]) as VideoModelDef;
}

/** Returns true when the model key is valid. */
export function isValidVideoModel(value: string): value is VideoModelValue {
  return VIDEO_MODELS.some((m) => m.value === value);
}
