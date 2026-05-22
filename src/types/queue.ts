export interface PostQueue {
  id: string;
  name: string;
  targetId: string;
  /** Joined from posting_targets */
  targetName: string;
  targetType: string;
  /** Count of slots (not posted) */
  slotCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QueueSlot {
  id: string;
  queueId: string;
  position: number;
  imageIds: string[];
  aiTitle: string | null;
  aiDescription: string | null;
  aiTags: string[] | null;
  posted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight image info for display within a slot */
export interface SlotImageData {
  id: string;
  filename: string;
  thumbnailUrl: string | null;
  localPath: string | null;
}
