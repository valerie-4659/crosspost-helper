<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Check, FolderHeart, Plus, Send, Trash2, X } from "lucide-vue-next";
import ImageLightbox from "@/components/ImageLightbox.vue";
import { useCollectionStore } from "@/stores/collectionStore";
import { useTargetStore } from "@/stores/targetStore";
import type { CollectionImage } from "@/types/collection";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTargetType } from "@/types/postingTarget";

const EXTENSION_TYPES = new Set<PostingTargetType>(["x", "bluesky", "deviantart", "civitai"]);
const PLATFORM_LIMITS: Record<string, number> = { civitai: 20, x: 4, bluesky: 4, deviantart: 1 };

const collectionStore = useCollectionStore();
const targetStore = useTargetStore();

const newName = ref("");
const editingId = ref<string | null>(null);
const editingName = ref("");
const confirmingDeleteId = ref<string | null>(null);
const previewImage = ref<CollectionImage | null>(null);
const queueMessage = ref("");

const extensionTargets = computed(() =>
  targetStore.enabledTargets.filter((t) => EXTENSION_TYPES.has(t.type)),
);

onMounted(async () => {
  await collectionStore.load();
});

// ── Collection list actions ────────────────────────────────────────────────

async function createCollection() {
  const name = newName.value.trim();
  if (!name) return;
  await collectionStore.create({ name });
  newName.value = "";
}

function startEdit(id: string, name: string) {
  editingId.value = id;
  editingName.value = name;
}

async function saveEdit(id: string) {
  const name = editingName.value.trim();
  if (name) await collectionStore.rename(id, { name });
  editingId.value = null;
}

async function confirmDelete(id: string) {
  await collectionStore.remove(id);
  confirmingDeleteId.value = null;
}

// ── Open a collection ──────────────────────────────────────────────────────

async function openCollection(id: string) {
  queueMessage.value = "";
  await collectionStore.openCollection(id);
}

// ── Queue for extension ────────────────────────────────────────────────────

async function queueForExtension(targetType: string) {
  const limit = PLATFORM_LIMITS[targetType] ?? 1;
  const ids = collectionStore.activeImages.slice(0, limit).map((i) => i.id);
  if (!ids.length) return;
  try {
    await window.desktop.bridge.setQueue(targetType, ids);
    const name = collectionStore.activeCollection?.name ?? "collection";
    const extra = collectionStore.activeImages.length > limit ? ` (capped at ${limit})` : "";
    queueMessage.value = `✓ ${ids.length} image(s) from "${name}" queued for ${targetType}${extra}. Open the Chrome Extension to inject.`;
  } catch (e) {
    queueMessage.value = `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ── Lightbox ───────────────────────────────────────────────────────────────

function lightboxNavigate(img: ImageWithPostState) {
  // CollectionImage extends ImageWithPostState; cast is safe here.
  previewImage.value = img as CollectionImage;
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="shrink-0 px-5 pt-5">
      <h1 class="text-2xl font-semibold text-white">Collections</h1>
      <p class="mt-1 text-sm text-slate-400">
        Group images from any folder into named collections and queue them for posting.
      </p>
    </header>

    <!-- ── Content: split view ─────────────────────────────────────────── -->
    <div class="flex min-h-0 flex-1 gap-0 overflow-hidden">

      <!-- LEFT: collection list -->
      <aside class="flex w-72 shrink-0 flex-col border-r border-line overflow-hidden">
        <!-- New collection input -->
        <div class="shrink-0 border-b border-line px-4 py-3">
          <div class="flex gap-2">
            <input
              v-model="newName"
              type="text"
              placeholder="New collection name…"
              class="flex-1 rounded-lg border border-line bg-ink px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-accent focus:outline-none"
              @keyup.enter="createCollection"
            />
            <button class="button-primary h-8 w-8 shrink-0 p-0" title="Create collection" @click="createCollection">
              <Plus class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Collection list -->
        <div class="flex-1 overflow-y-auto py-2">
          <p v-if="!collectionStore.collections.length && !collectionStore.loading" class="px-4 py-8 text-center text-sm text-slate-500">
            No collections yet.<br>Select images in the Library and use "Add to Collection".
          </p>
          <button
            v-for="col in collectionStore.collections"
            :key="col.id"
            class="group flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-panelSoft"
            :class="collectionStore.activeCollection?.id === col.id ? 'bg-accent/10 text-accent' : 'text-slate-300'"
            @click="openCollection(col.id)"
          >
            <FolderHeart class="h-4 w-4 shrink-0 opacity-70" />
            <div v-if="editingId === col.id" class="flex flex-1 items-center gap-1" @click.stop>
              <input
                v-model="editingName"
                class="flex-1 rounded border border-accent bg-ink px-2 py-0.5 text-sm text-white focus:outline-none"
                @keyup.enter="saveEdit(col.id)"
                @keyup.escape="editingId = null"
              />
              <button class="button h-6 w-6 p-0" @click="saveEdit(col.id)"><Check class="h-3 w-3" /></button>
              <button class="button h-6 w-6 p-0" @click="editingId = null"><X class="h-3 w-3" /></button>
            </div>
            <div v-else class="flex flex-1 items-center justify-between overflow-hidden">
              <span class="truncate text-sm font-medium">{{ col.name }}</span>
              <div class="ml-2 flex shrink-0 items-center gap-1">
                <span class="text-xs text-slate-500">{{ col.imageCount ?? 0 }}</span>
                <button
                  class="hidden h-5 w-5 items-center justify-center rounded p-0 text-slate-500 hover:text-white group-hover:flex"
                  title="Rename"
                  @click.stop="startEdit(col.id, col.name)"
                >✎</button>
                <template v-if="confirmingDeleteId === col.id">
                  <button class="h-5 rounded border border-rose/60 px-1 text-[10px] text-rose hover:bg-rose/10" @click.stop="confirmDelete(col.id)">Del</button>
                  <button class="h-5 rounded border border-line px-1 text-[10px]" @click.stop="confirmingDeleteId = null">No</button>
                </template>
                <button
                  v-else
                  class="hidden h-5 w-5 items-center justify-center rounded p-0 text-slate-600 hover:text-rose group-hover:flex"
                  title="Delete collection"
                  @click.stop="confirmingDeleteId = col.id"
                ><Trash2 class="h-3 w-3" /></button>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <!-- RIGHT: active collection images -->
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <!-- Empty state -->
        <div v-if="!collectionStore.activeCollection" class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <FolderHeart class="h-12 w-12 opacity-30" />
          <p class="text-sm">Select a collection to view its images.</p>
        </div>

        <template v-else>
          <!-- Collection header + queue toolbar -->
          <div class="shrink-0 border-b border-line px-5 py-3">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-base font-semibold text-white">{{ collectionStore.activeCollection.name }}</h2>
                <p class="text-xs text-slate-500">{{ collectionStore.activeImages.length }} image(s)</p>
              </div>
              <!-- Queue buttons -->
              <div v-if="extensionTargets.length" class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs text-slate-400">Queue for</span>
                <button
                  v-for="target in extensionTargets"
                  :key="target.id"
                  class="button h-7 px-2 text-xs"
                  :disabled="!collectionStore.activeImages.length"
                  :title="`Queue up to ${PLATFORM_LIMITS[target.type] ?? 1} images for ${target.name}`"
                  @click="queueForExtension(target.type)"
                >
                  <Send class="h-3 w-3" />{{ target.name }}
                  <span class="ml-0.5 text-[10px] text-slate-500">(max {{ PLATFORM_LIMITS[target.type] ?? 1 }})</span>
                </button>
              </div>
            </div>
            <p v-if="queueMessage" class="mt-2 text-xs" :class="queueMessage.startsWith('Error') ? 'text-rose' : 'text-mint'">
              {{ queueMessage }}
            </p>
          </div>

          <!-- Image grid -->
          <div class="flex-1 overflow-y-auto p-5">
            <p v-if="!collectionStore.activeImages.length" class="py-16 text-center text-sm text-slate-500">
              This collection is empty. Add images from the Library.
            </p>
            <div
              v-else
              class="grid gap-3"
              style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))"
            >
              <div
                v-for="img in collectionStore.activeImages"
                :key="img.id"
                class="group relative cursor-pointer overflow-hidden rounded-xl border border-line bg-panel transition hover:border-accent"
                @click="previewImage = img"
              >
                <img
                  v-if="img.localPath"
                  :src="`localfile://${img.localPath}`"
                  :alt="img.filename"
                  class="w-full object-contain"
                  loading="lazy"
                />
                <div class="p-2">
                  <p class="truncate text-xs text-slate-400">{{ img.filename }}</p>
                </div>
                <button
                  class="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-rose/80 group-hover:flex"
                  title="Remove from collection"
                  @click.stop="collectionStore.removeImage(collectionStore.activeCollection!.id, img.id)"
                ><X class="h-3 w-3" /></button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Lightbox -->
    <ImageLightbox
      v-if="previewImage"
      :image="previewImage"
      :images="collectionStore.activeImages"
      :selected-image-ids="new Set()"
      @close="previewImage = null"
      @navigate="lightboxNavigate"
    />
  </div>
</template>
