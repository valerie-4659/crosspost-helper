export type PostRecordStatus = "planned" | "posted" | "skipped";

export interface PostRecord {
  id: string;
  imageId: string;
  targetId: string;
  status: PostRecordStatus;
  postedAt: string | null;
  postUrl: string | null;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostRecordInput {
  imageId: string;
  targetId: string;
  status: PostRecordStatus;
  postedAt?: string | null;
  postUrl?: string | null;
  caption?: string | null;
}

export interface PostHistoryEntry {
  id: string;
  imageId: string;
  targetId: string;
  status: PostRecordStatus;
  postedAt: string | null;
  filename: string;
  localPath: string | null;
  thumbnailUrl: string | null;
  targetName: string;
  targetType: string;
}

export interface PostHistoryFilters {
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
}
