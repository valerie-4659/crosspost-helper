import { ref } from "vue";
import { defineStore } from "pinia";
import {
  addImagesToCollection,
  createCollection,
  deleteCollection,
  getCollection,
  listCollectionImages,
  listCollections,
  removeImageFromCollection,
  updateCollection,
} from "@/repositories/collectionRepository";
import type { Collection, CollectionImage, CollectionInput } from "@/types/collection";

export const useCollectionStore = defineStore("collections", () => {
  const collections = ref<Collection[]>([]);
  const activeCollection = ref<Collection | null>(null);
  const activeImages = ref<CollectionImage[]>([]);
  const loading = ref(false);
  const message = ref("");
  const error = ref("");

  // ── List ──────────────────────────────────────────────────────────────────

  async function load() {
    loading.value = true;
    error.value = "";
    try {
      collections.value = await listCollections();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // ── Open / close active collection ────────────────────────────────────────

  async function openCollection(id: string) {
    loading.value = true;
    error.value = "";
    try {
      activeCollection.value = await getCollection(id);
      activeImages.value = await listCollectionImages(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function closeCollection() {
    activeCollection.value = null;
    activeImages.value = [];
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function create(input: CollectionInput): Promise<Collection> {
    const col = await createCollection(input);
    collections.value = [col, ...collections.value];
    message.value = `Collection "${col.name}" created.`;
    return col;
  }

  async function rename(id: string, input: Partial<CollectionInput>) {
    await updateCollection(id, input);
    const idx = collections.value.findIndex((c) => c.id === id);
    if (idx !== -1 && input.name) collections.value[idx] = { ...collections.value[idx], name: input.name };
    if (activeCollection.value?.id === id && input.name) {
      activeCollection.value = { ...activeCollection.value, name: input.name };
    }
  }

  async function remove(id: string) {
    await deleteCollection(id);
    collections.value = collections.value.filter((c) => c.id !== id);
    if (activeCollection.value?.id === id) closeCollection();
    message.value = "Collection deleted.";
  }

  // ── Image management ──────────────────────────────────────────────────────

  /** Add image IDs to an existing collection. Refreshes count in list. */
  async function addImages(collectionId: string, imageIds: string[]) {
    await addImagesToCollection(collectionId, imageIds);
    // Refresh count in the sidebar list.
    const idx = collections.value.findIndex((c) => c.id === collectionId);
    if (idx !== -1) {
      // Re-fetch the collection to get the accurate count.
      const updated = await getCollection(collectionId);
      if (updated) collections.value[idx] = updated;
    }
    // If this is the open collection, refresh images too.
    if (activeCollection.value?.id === collectionId) {
      activeImages.value = await listCollectionImages(collectionId);
    }
    const col = collections.value.find((c) => c.id === collectionId);
    message.value = `${imageIds.length} image(s) added to "${col?.name ?? "collection"}".`;
  }

  async function removeImage(collectionId: string, imageId: string) {
    await removeImageFromCollection(collectionId, imageId);
    activeImages.value = activeImages.value.filter((i) => i.id !== imageId);
    const idx = collections.value.findIndex((c) => c.id === collectionId);
    if (idx !== -1) {
      collections.value[idx] = { ...collections.value[idx], imageCount: (collections.value[idx].imageCount ?? 1) - 1 };
    }
  }

  return {
    collections, activeCollection, activeImages, loading, message, error,
    load, openCollection, closeCollection,
    create, rename, remove,
    addImages, removeImage,
  };
});
