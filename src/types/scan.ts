export interface LocalImageFile {
  localPath: string;
  sourceFileId: string;
  filename: string;
  folderPath: string;
  mimeType: string;
  fileSize: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  perceptualHash: string | null;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
}

export interface ScanResult {
  sourceId: string;
  scanned: number;
  indexed: number;
  duplicates: number;
  removed: number;
  errors: string[];
}
