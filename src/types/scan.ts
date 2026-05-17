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
}

export interface ScanResult {
  sourceId: string;
  scanned: number;
  indexed: number;
  duplicates: number;
  errors: string[];
}
