<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Archive, Check, Clipboard, Copy, EyeOff, Expand, FolderOpen, Pin, PinOff, RotateCcw } from "lucide-vue-next";
import { setImagesDragData } from "@/services/imageActionService";
import PlatformIcon from "@/components/PlatformIcon.vue";

function handleDragStart(event: DragEvent) {
  const localPaths = dragImages.value
    .map((img) => img.localPath)
    .filter((p): p is string => Boolean(p));

  if (localPaths.length > 0 && window.desktop?.core?.startDrag) {
    // Cancel HTML5 drag — running both simultaneously causes the app to freeze
    // after the drag ends because macOS gets two conflicting drag sessions.
    event.preventDefault();

    // Use cached thumbnail as drag icon (loads in <1 ms).
    const firstImg = dragImages.value[0];
    const iconPath = firstImg.thumbnailUrl?.startsWith("localfile://")
      ? decodeURIComponent(firstImg.thumbnailUrl.slice("localfile://".length))
      : undefined;
    window.desktop.core.startDrag(localPaths, iconPath);
  } else {
    setImagesDragData(event, dragImages.value);
  }
}
import type { ImageWithPostState } from "@/types/image";
import type { PostingTarget } from "@/types/postingTarget";

const props = defineProps<{
  image: ImageWithPostState;
  targets: PostingTarget[];
  activeTargetId?: string;
  selected?: boolean;
  dragImages?: ImageWithPostState[];
  /** When defined, shows the folder-preview pin button. true = currently pinned. */
  isFolderPreview?: boolean;
}>();

const emit = defineEmits<{
  toggleSelected: [imageId: string];
  preview: [image: ImageWithPostState];
  archive: [imageId: string, archived: boolean];
  reveal: [image: ImageWithPostState];
  copyPath: [image: ImageWithPostState];
  copyImage: [image: ImageWithPostState];
  markPosted: [imageId: string, targetId: string];
  markSkipped: [imageId: string, targetId: string];
  toggleFolderPreview: [imageId: string];
}>();

const imageUrl = computed(() => {
  if (props.image.thumbnailUrl) return props.image.thumbnailUrl;
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return "";
});

const imageLoaded = ref(false);
const imgEl = ref<HTMLImageElement | null>(null);

// For images already in the browser cache the 'load' event fires before
// the listener is attached, so we also check img.complete after mount.
onMounted(() => {
  if (imgEl.value?.complete) imageLoaded.value = true;
});

const activeTarget = computed(() => props.targets.find((target) => target.id === props.activeTargetId) ?? null);
const activeTargetStatus = computed(() => (activeTarget.value ? props.image.postStates[activeTarget.value.id] : undefined));
const dragImages = computed(() => (props.selected && props.dragImages?.length ? props.dragImages : [props.image]));
</script>

<template>
  <article
    class="surface overflow-hidden rounded-lg transition"
    :class="selected ? 'border-accent ring-1 ring-accent' : ''"
    draggable="true"
    @dragstart="handleDragStart"
  >
    <div
      class="relative cursor-grab bg-black/40 active:cursor-grabbing"
      :class="{ 'min-h-32 animate-pulse': imageUrl && !imageLoaded }"
      @dblclick="emit('preview', image)"
    >
      <img
        v-if="imageUrl"
        ref="imgEl"
        :src="imageUrl"
        :alt="image.filename"
        loading="lazy"
        decoding="async"
        class="w-full transition-opacity duration-500"
        :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imageLoaded = true"
        @error="imageLoaded = true"
      />
      <label class="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-line bg-ink/80">
        <input class="h-4 w-4 accent-accent" type="checkbox" :checked="selected" @change.stop="emit('toggleSelected', image.id)" />
      </label>
      <button class="button absolute right-3 top-3 h-8 w-8 bg-ink/80 p-0" title="Preview large" @click="emit('preview', image)">
        <Expand class="h-4 w-4" />
      </button>
      <span v-if="image.isArchived" class="absolute bottom-3 left-3 rounded-md border border-rose/50 bg-rose/20 px-2 py-1 text-xs text-rose">
        Excluded
      </span>
      <!-- Folder preview pin — bottom-right of image, only in leaf folder view -->
      <button
        v-if="isFolderPreview !== undefined"
        class="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-md border bg-ink/80 transition"
        :class="isFolderPreview
          ? 'border-violet-500/50 text-violet-400'
          : 'border-line text-slate-400 hover:border-violet-500/50 hover:text-violet-400'"
        :title="isFolderPreview ? 'Remove from folder preview' : 'Pin as folder preview (max 3)'"
        @click.stop="emit('toggleFolderPreview', image.id)"
      >
        <PinOff v-if="isFolderPreview" class="h-4 w-4" />
        <Pin v-else class="h-4 w-4" />
      </button>
    </div>
    <div class="space-y-3 p-3">
      <div>
        <h3 class="truncate text-sm font-semibold text-white">{{ image.filename }}</h3>
        <p class="mt-1 truncate text-xs text-slate-500">{{ image.folderPath }}</p>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="target in targets"
          :key="target.id"
          class="flex h-7 w-7 items-center justify-center rounded-md border transition"
          :class="{
            'border-mint/50 bg-mint/10 text-mint': image.postStates[target.id] === 'posted',
            'border-gold/50 bg-gold/10 text-gold': image.postStates[target.id] === 'planned',
            'border-rose/50 bg-rose/10 text-rose': image.postStates[target.id] === 'skipped',
            'border-line bg-panelSoft text-slate-400 hover:border-accent hover:text-accent': !image.postStates[target.id],
            'ring-1 ring-accent': activeTargetId === target.id,
          }"
          :title="image.postStates[target.id] === 'posted' ? `${target.name} already posted` : `Mark posted on ${target.name}`"
          :disabled="image.postStates[target.id] === 'posted'"
          @click="emit('markPosted', image.id, target.id)"
        >
          <PlatformIcon :type="target.type" :size="14" />
        </button>
      </div>
      <!-- Mark posted / Skip row for active target -->
      <div v-if="activeTarget" class="flex gap-1.5">
        <button
          class="button-primary flex-1 rounded-md text-xs"
          :disabled="activeTargetStatus === 'posted'"
          :title="`Mark as posted on ${activeTarget.name}`"
          @click="emit('markPosted', image.id, activeTarget.id)"
        >
          <Check class="h-3.5 w-3.5" />
          {{ activeTargetStatus === "posted" ? `✓ ${activeTarget.name}` : `Mark ${activeTarget.name}` }}
        </button>
        <!-- Skip for network (per-network exclude) -->
        <button
          class="button h-8 w-8 shrink-0 p-0 transition"
          :class="activeTargetStatus === 'skipped' ? 'border-rose/50 bg-rose/10 text-rose' : 'hover:border-rose/50 hover:text-rose'"
          :title="activeTargetStatus === 'skipped' ? `Skipped for ${activeTarget.name} — click to undo` : `Skip for ${activeTarget.name} (per-network exclude)`"
          @click="activeTargetStatus === 'skipped'
            ? emit('markPosted', image.id, activeTarget.id)
            : emit('markSkipped', image.id, activeTarget.id)"
        >
          <EyeOff class="h-3.5 w-3.5" />
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button class="button h-8 w-8 p-0" title="Reveal file" @click="emit('reveal', image)">
          <FolderOpen class="h-4 w-4" />
        </button>
        <button class="button h-8 w-8 p-0" title="Copy image to clipboard" @click="emit('copyImage', image)">
          <Clipboard class="h-4 w-4" />
        </button>
        <button class="button h-8 w-8 p-0" title="Copy file path" @click="emit('copyPath', image)">
          <Copy class="h-4 w-4" />
        </button>
        <!-- Global exclude / restore -->
        <button
          class="button h-8 w-8 p-0 transition"
          :class="image.isArchived ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'hover:border-amber-500/50 hover:text-amber-400'"
          :title="image.isArchived ? 'Restore (globally)' : 'Exclude globally (all networks + Picker)'"
          @click="emit('archive', image.id, !image.isArchived)"
        >
          <RotateCcw v-if="image.isArchived" class="h-4 w-4" />
          <Archive v-else class="h-4 w-4" />
        </button>
      </div>
    </div>
  </article>
</template>
