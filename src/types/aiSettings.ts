export type AiProvider = "openai" | "anthropic" | "grok" | "gemini";

export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  /** X (Twitter) Premium+ — raises the char limit from 280 to 25 000 */
  xPremiumPlus?: boolean;
}

export interface GeneratedPost {
  title: string;
  description: string;
  /** Tags as the AI returned them (may include # or not depending on network). */
  tags: string[];
  network: string;
}

export interface NetworkTag {
  id: string;
  network: string;
  tag: string;
  isDefault: boolean;
}

export type EmojiUse = "none" | "subtle" | "heavy";

/** Writing persona — controls the AI's voice, tone and emoji usage. */
export interface Persona {
  id: string;
  name: string;
  /** Short tone description, e.g. "Flirty, teasing, confident" */
  tone: string;
  /** How many emojis the AI should use */
  emojiUse: EmojiUse;
  /** Free-form style notes: vocabulary, example phrases, dos/don'ts */
  styleNotes: string;
  isActive: boolean;
  createdAt: string;
}

/** Per-network generation settings used to instruct the AI. */
export interface NetworkPostConfig {
  descMaxChars: number;
  tagCount: number;
  titleNeeded: boolean;
  tagHasHash: boolean;
  notes: string;
}

/** Storyline — a named series of story posts that share narrative context. */
export interface Storyline {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

/** A single story-post fragment recorded in a storyline. */
export interface StoryEntry {
  id: string;
  storylineId: string;
  imageId: string | null;
  postText: string;
  entryOrder: number;
  createdAt: string;
}

/** A reader-vote decision option appended at the end of a story post. */
export interface StoryDecision {
  emoji: string;
  label: string;
}

export const NETWORK_POST_CONFIGS: Record<string, NetworkPostConfig> = {
  x:          { descMaxChars: 180, tagCount: 5,  titleNeeded: false, tagHasHash: true,  notes: "Punchy, engagement-first. Max 180 chars (leaves room for hashtags in the 280-char limit)." },
  bluesky:    { descMaxChars: 250, tagCount: 5,  titleNeeded: false, tagHasHash: true,  notes: "Friendly, concise. Bluesky culture: use # in tags." },
  deviantart: { descMaxChars: 1000,tagCount: 20, titleNeeded: true,  tagHasHash: false, notes: "Artistic description. Tags WITHOUT # symbol — DA handles them separately." },
  civitai:    { descMaxChars: 2000,tagCount: 30, titleNeeded: true,  tagHasHash: false, notes: "Detailed AI art description. Include style, technique, mood. Tags WITHOUT # symbol." },
  instagram:  { descMaxChars: 400, tagCount: 30, titleNeeded: false, tagHasHash: true,  notes: "Engaging caption. Up to 30 hashtags WITH # symbol." },
  tumblr:     { descMaxChars: 500, tagCount: 20, titleNeeded: true,  tagHasHash: false, notes: "Creative description. Tags WITHOUT # — Tumblr tag field is separate." },
  facebook:   { descMaxChars: 500, tagCount: 10, titleNeeded: false, tagHasHash: true,  notes: "Conversational, engaging post text. A few hashtags WITH # symbol." },
  socialdiff: { descMaxChars: 500, tagCount: 15, titleNeeded: false, tagHasHash: true,  notes: "General social media post." },
  custom:     { descMaxChars: 500, tagCount: 15, titleNeeded: false, tagHasHash: true,  notes: "General social media post." },
};

export const AI_PROVIDER_MODELS: Record<AiProvider, string[]> = {
  // Aliases — automatically point to the latest stable version (no pinned dates)
  openai:    ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"],
  // grok-2-vision* retired May 15 2026. Current models all support image input.
  // grok-latest = alias for grok-4.3 (latest stable, supports text+image)
  grok:      ["grok-latest", "grok-4.3", "grok-4.20"],
  gemini:    ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
};
