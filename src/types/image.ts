import type { PostRecordStatus } from "./postRecord";

export type ImageRating = "sfw" | "suggestive" | "nsfw" | "unknown";

export interface IndexedImage {
  id: string;
  sourceId: string;
  sourceFileId: string | null;
  localPath: string | null;
  filename: string;
  folderPath: string;
  mimeType: string;
  fileSize: number | null;
  thumbnailUrl: string | null;
  webViewLink: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  indexedAt: string;
  perceptualHash: string | null;
  width: number | null;
  height: number | null;
  rating: ImageRating | null;
  isArchived: boolean;
}

export interface ImageInput {
  sourceId: string;
  sourceFileId?: string | null;
  localPath?: string | null;
  filename: string;
  folderPath: string;
  mimeType: string;
  fileSize?: number | null;
  thumbnailUrl?: string | null;
  webViewLink?: string | null;
  createdAt?: string | null;
  modifiedAt?: string | null;
  perceptualHash?: string | null;
  width?: number | null;
  height?: number | null;
  rating?: ImageRating | null;
}

export interface ImageWithPostState extends IndexedImage {
  sourceName: string;
  sourceType: string;
  postStates: Record<string, PostRecordStatus>;
}

export interface ImageFilters {
  sourceId?: string;
  folderPath?: string;
  /** Exact folder path match — set by the folder sidebar, takes precedence over folderPath LIKE. */
  exactFolderPath?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  rating?: ImageRating | "all";
  includeSkipped: boolean;
  includeArchived: boolean;
  excludePostedAnywhere: boolean;
  /** When true, images from excluded folders are included in results (Library "Show excluded" toggle). */
  includeExcludedFolders?: boolean;
  /** Library toolbar: hide images already posted to this target ID (separate from the FilterBar targetId). */
  hidePostedForTargetId?: string;
  /** Library sort order for the image grid. */
  sortBy?: "date_desc" | "date_asc" | "alpha_asc" | "alpha_desc" | "pick_desc" | "pick_asc";
  /**
   * Ordered folder paths used when sortBy is "pick_desc" or "pick_asc".
   * Index 0 = first (highest priority). Passed by the Library page from folderHistoryStore.
   */
  folderPickOrder?: string[];
}

export interface DuplicateWarning {
  imageId: string;
  filename: string;
  folderPath: string;
  reason: "source_file_id" | "perceptual_hash" | "fallback";
}
