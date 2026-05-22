export type PostingTargetType =
  | "x"
  | "bluesky"
  | "deviantart"
  | "civitai"
  | "instagram"
  | "facebook"
  | "tumblr"
  | "socialdiff"
  | "custom";

export interface PostingTarget {
  id: string;
  name: string;
  type: PostingTargetType;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostingTargetInput {
  name: string;
  type: PostingTargetType;
}
