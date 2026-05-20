import type { ImageWithPostState } from "./image";

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated when the collection is loaded with its images. */
  imageCount?: number;
}

export interface CollectionWithImages extends Collection {
  images: CollectionImage[];
}

export interface CollectionImage extends ImageWithPostState {
  position: number;
  addedAt: string;
}

export interface CollectionInput {
  name: string;
  description?: string | null;
}
