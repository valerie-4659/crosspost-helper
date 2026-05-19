<script setup lang="ts">
import { Cloud, FolderPlus, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-vue-next";
import { useImageStore } from "@/stores/imageStore";
import { useSourceStore } from "@/stores/sourceStore";

const sourceStore = useSourceStore();
const imageStore = useImageStore();

async function scan(sourceId: string) {
  const source = sourceStore.sources.find((item) => item.id === sourceId);
  if (!source) return;
  await sourceStore.scanSource(source);
  await imageStore.load();
  await imageStore.loadFolders();
}

async function addPlaceholder(type: "google_drive" | "dropbox") {
  await sourceStore.addSource({
    type,
    name: type === "google_drive" ? "Google Drive" : "Dropbox",
    rootPathOrId: "connect-next-milestone",
  });
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">Sources & Scanning</h1>
        <p class="mt-1 text-sm text-slate-400">Add folders, scan recursively, and keep indexing independent from posting targets.</p>
      </div>
      <div class="flex gap-2">
        <button class="button" @click="addPlaceholder('google_drive')">
          <Cloud class="h-4 w-4" />
          Google Drive
        </button>
        <button class="button" @click="addPlaceholder('dropbox')">
          <Plus class="h-4 w-4" />
          Dropbox
        </button>
        <button class="button-primary rounded-md" @click="sourceStore.addLocalFolder">
          <FolderPlus class="h-4 w-4" />
          Local folder
        </button>
      </div>
    </header>

    <div v-if="sourceStore.error" class="rounded-md border border-rose/40 bg-rose/10 p-3 text-sm text-rose">
      {{ sourceStore.error }}
    </div>

    <div v-if="sourceStore.sources.length" class="grid gap-3">
      <article v-for="source in sourceStore.sources" :key="source.id" class="surface rounded-lg p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-3">
              <h2 class="text-base font-semibold text-white">{{ source.name }}</h2>
              <span class="rounded-md border border-line bg-panelSoft px-2 py-1 text-xs text-slate-400">{{ source.type }}</span>
            </div>
            <p class="mt-1 truncate text-sm text-slate-400">{{ source.rootPathOrId }}</p>
            <!-- Live progress while this source is being scanned -->
            <div v-if="sourceStore.scanningSourceId === source.id" class="mt-3 space-y-2">
              <div class="flex items-center gap-2 text-sm text-accent">
                <Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
                <!-- Phase 1: worker walking the directory tree, total unknown -->
                <span v-if="!sourceStore.scanProgress || sourceStore.scanProgress.total === null" class="font-medium">
                  Walking folder…
                  <span v-if="sourceStore.scanProgress" class="font-normal text-slate-300">
                    {{ sourceStore.scanProgress.scanned.toLocaleString() }} files found
                  </span>
                </span>
                <!-- Phase 2: thumbnail generation, total is now known -->
                <span v-else class="font-medium">
                  Processing…
                  <span class="font-normal text-slate-300">
                    {{ sourceStore.scanProgress.scanned.toLocaleString() }}
                    / {{ sourceStore.scanProgress.total.toLocaleString() }}
                  </span>
                </span>
              </div>

              <!-- Progress bar (only during phase 2 when we know the total) -->
              <div v-if="sourceStore.scanProgress?.total" class="h-1 w-full overflow-hidden rounded-full bg-line">
                <div
                  class="h-full rounded-full bg-accent transition-all duration-150"
                  :style="{ width: `${Math.round((sourceStore.scanProgress.scanned / sourceStore.scanProgress.total) * 100)}%` }"
                />
              </div>

              <p
                v-if="sourceStore.scanProgress"
                class="max-w-sm truncate text-xs text-slate-500"
                :title="sourceStore.scanProgress.currentFile"
              >
                {{ sourceStore.scanProgress.currentFile }}
              </p>
            </div>

            <p v-if="!sourceStore.scanningSourceId && sourceStore.lastScanResults[source.id]" class="mt-2 text-sm text-slate-300">
              Scanned {{ sourceStore.lastScanResults[source.id].scanned }},
              new {{ sourceStore.lastScanResults[source.id].indexed }},
              existing {{ sourceStore.lastScanResults[source.id].duplicates }}
            </p>
            <p v-if="sourceStore.lastScanResults[source.id]?.errors.length" class="mt-2 text-sm text-rose">
              {{ sourceStore.lastScanResults[source.id].errors.join(", ") }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <label class="flex items-center gap-2 text-sm text-slate-300">
              <input :checked="source.enabled" type="checkbox" class="accent-accent" @change="sourceStore.setEnabled(source.id, ($event.target as HTMLInputElement).checked)" />
              Enabled
            </label>
            <button class="button" :disabled="sourceStore.scanningSourceId === source.id || !source.enabled" @click="scan(source.id)">
              <Loader2 v-if="sourceStore.scanningSourceId === source.id" class="h-4 w-4 animate-spin" />
              <RefreshCcw v-else class="h-4 w-4" />
              {{ sourceStore.scanningSourceId === source.id ? "Scanning…" : "Scan" }}
            </button>
            <button class="button h-10 w-10 p-0" title="Remove source" @click="sourceStore.removeSource(source.id)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="surface flex flex-1 items-center justify-center rounded-lg">
      <div class="max-w-md text-center">
        <h2 class="text-lg font-semibold text-white">Start with a local image folder</h2>
        <p class="mt-2 text-sm leading-6 text-slate-400">Google Drive and Dropbox are represented by the same source abstraction and ready for provider credentials in the next milestone.</p>
      </div>
    </div>
  </div>
</template>
