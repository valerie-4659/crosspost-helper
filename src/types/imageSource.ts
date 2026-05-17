export type ImageSourceType = "google_drive" | "dropbox" | "local_folder";

export interface ImageSource {
  id: string;
  type: ImageSourceType;
  name: string;
  rootPathOrId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImageSourceInput {
  type: ImageSourceType;
  name: string;
  rootPathOrId: string;
}
