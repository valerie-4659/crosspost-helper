<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronLeft, Check, FolderOpen } from "lucide-vue-next";
import { convertFileSrc } from "@/electron-shims/core";
import { useImageStore } from "@/stores/imageStore";

const props = defineProps<{
  selectedPaths: string[];
}>();

const emit = defineEmits<{
  toggle: [folderPath: string];
  clear: [];
}>();

const imageStore = useImageStore();

/** Common root directory derived from all indexed folder paths. */
const rootDir = computed(() => {
  const paths = imageStore.folders.map((f) => f.folderPath);
  if (!paths.length) return "";
  const segs = paths.map((p) => p.split("/"));
  const minLen = Math.min(...segs.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    if (segs.every((s) => s[i] === segs[0][i])) common.push(segs[0][i]);
    else break;
  }
  return common.join("/");
});

const browsePath = ref("");

const activeBrowsePath = computed(() => browsePath.value || rootDir.value);

/** Immediate child folders of the current browse path, with thumbnail and count. */
const childFolders = computed(() => {
  const base = activeBrowsePath.value;
  if (!base) return [];
  const children = new Map<string, { count: number; hasChildren: boolean }>();
  for (const f of imageStore.folders) {
    if (f.folderPath === base || !f.folderPath.startsWith(base + "/")) continue;
    const remaining = f.folderPath.slice(base.length + 1);
    const nextSeg = remaining.split("/")[0];
    const childPath = base + "/" + nextSeg;
    const existing = children.get(childPath);
    const hasChildren = remaining.includes("/");
    children.set(childPath, {
      count: (existing?.count ?? 0) + f.count,
      hasChildren: (existing?.hasChildren ?? false) || hasChildren,
    });
  }

  return [...children.entries()].map(([path, { count, hasChildren }]) => {
    const thumbnails: string[] = [];
    for (const [fp, urls] of imageStore.folderThumbnails) {
      if (fp === path || fp.startsWith(path + "/")) {
        for (const u of urls) {
          if (!thumbnails.includes(u)) thumbnails.push(u);
          if (thumbnails.length >= 3) break;
        }
        if (thumbnails.length >= 3) break;
      }
    }
    return {
      path,
      name: path.split("/").pop()!,
      count,
      hasChildren,
      thumbnails,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
});

/** Breadcrumb segments from rootDir to current browsePath. */
const breadcrumbs = computed(() => {
  const root = rootDir.value;
  const current = activeBrowsePath.value;
  if (!root || current === root) return [];
  const rel = current.slice(root.length + 1);
  const segs = rel.split("/");
  return segs.map((seg, i) => ({
    label: seg,
    path: root + "/" + segs.slice(0, i + 1).join("/"),
  }));
});

function navigateInto(path: string) {
  browsePath.value = path;
}

function navigateTo(path: string) {
  browsePath.value = path;
}

function navigateUp() {
  const current = activeBrowsePath.value;
  const root = rootDir.value;
  if (!current || current === root) return;
  browsePath.value = current.replace(/\/[^/]+$/, "") || root;
}

function thumbnailSrc(url: string): string {
  if (url.startsWith("localfile://")) {
    let p = decodeURIComponent(url.slice("localfile://".length));
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return convertFileSrc(p);
  }
  return url;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Header row -->
    <div class="flex items-center gap-2">
      <button
        v-if="activeBrowsePath !== rootDir"
        class="button h-6 gap-1 px-2 text-[11px]"
        @click="navigateUp"
      >
        <ChevronLeft class="h-3 w-3" />Back
      </button>

      <!-- Breadcrumb -->
      <div class="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-slate-400">
        <button class="transition hover:text-white" @click="navigateTo(rootDir)">Root</button>
        <template v-for="crumb in breadcrumbs" :key="crumb.path">
          <span class="text-slate-600">/</span>
          <button class="max-w-24 truncate transition hover:text-white" @click="navigateTo(crumb.path)">{{ crumb.label }}</button>
        </template>
      </div>

      <!-- Clear selection -->
      <button
        v-if="selectedPaths.length"
        class="button h-6 gap-1 px-2 text-[11px] text-rose hover:border-rose/50"
        @click="emit('clear')"
      >
        Clear {{ selectedPaths.length }} selected
      </button>
    </div>

    <!-- Folder grid -->
    <div
      v-if="childFolders.length"
      class="grid gap-2"
      style="grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))"
    >
      <div
        v-for="folder in childFolders"
        :key="folder.path"
        class="group cursor-pointer rounded-lg border transition"
        :class="selectedPaths.includes(folder.path)
          ? 'border-accent bg-accent/10'
          : 'border-line bg-panelSoft hover:border-white/25'"
        @click="emit('toggle', folder.path)"
      >
        <!-- Thumbnail strip -->
        <div class="relative h-16 overflow-hidden rounded-t-lg bg-slate-800">
          <div class="flex h-full">
            <img
              v-for="(thumb, i) in folder.thumbnails.slice(0, 3)"
              :key="i"
              :src="thumbnailSrc(thumb)"
              class="h-full flex-1 object-cover"
              :style="{ width: `${100 / Math.min(folder.thumbnails.length, 3)}%` }"
              loading="lazy"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <div
              v-if="!folder.thumbnails.length"
              class="flex h-full w-full items-center justify-center"
            >
              <FolderOpen class="h-6 w-6 text-slate-600" />
            </div>
          </div>

          <!-- Selected checkmark -->
          <div
            v-if="selectedPaths.includes(folder.path)"
            class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent"
          >
            <Check class="h-3 w-3 text-white" />
          </div>

          <!-- Navigate-into button (only if has subfolders, stop propagation) -->
          <button
            v-if="folder.hasChildren"
            class="absolute bottom-1 right-1 flex h-5 items-center gap-0.5 rounded border border-white/20 bg-black/60 px-1.5 text-[9px] text-slate-300 opacity-0 transition hover:border-white/40 hover:text-white group-hover:opacity-100"
            title="Browse into folder"
            @click.stop="navigateInto(folder.path)"
          >Open</button>
        </div>

        <!-- Folder info -->
        <div class="px-2 py-1.5">
          <p class="truncate text-[11px] font-medium text-white" :title="folder.path">{{ folder.name }}</p>
          <p class="text-[10px] text-slate-500">{{ folder.count }} images</p>
        </div>
      </div>
    </div>

    <p v-else class="text-xs text-slate-500">No subfolders found.</p>
  </div>
</template>
