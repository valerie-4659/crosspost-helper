<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { convertFileSrc } from "@/electron-shims/core";
import { Archive, Check, Clapperboard, Clipboard, Copy, EyeOff, Expand, FolderOpen, Image, Pin, PinOff, RotateCcw, Zap } from "lucide-vue-next";
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
    let iconPath: string | undefined;
    if (firstImg.thumbnailUrl?.startsWith("localfile://")) {
      let p = decodeURIComponent(firstImg.thumbnailUrl.slice("localfile://".length));
      // On Windows the URL encodes as /C:/... — strip the leading slash.
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
      iconPath = p;
    }
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
  videoPrompt: [localPath: string];
  recreateImage: [localPath: string];
  upscaleImage: [localPath: string];
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

// Only show platforms where the image is already posted (compact indicators)
const postedTargets = computed(() => props.targets.filter((t) => props.image.postStates[t.id] === "posted"));
</script>

<template>
  <!--
    Default:  only image + checkbox visible.
    Hover:    card ring highlights, image brightens slightly,
              compact action strip slides up from the bottom (never covers the full image).
  -->
  <article
    class="group relative rounded-lg bg-ink p-1 transition-all duration-200 hover:z-10 hover:scale-[1.04] hover:shadow-2xl hover:shadow-black/60"
    :class="selected
      ? 'ring-2 ring-accent'
      : 'ring-1 ring-transparent hover:ring-2 hover:ring-white/25'"
  >
    <!-- ── Image — inset inside the frame, scales on hover ───────────────────── -->
    <div
      class="relative overflow-hidden rounded cursor-grab active:cursor-grabbing"
      :class="{ 'min-h-32 animate-pulse': imageUrl && !imageLoaded }"
    >
      <img
        v-if="imageUrl"
        ref="imgEl"
        :src="imageUrl"
        :alt="image.filename"
        loading="lazy"
        decoding="async"
        draggable="true"
        class="block w-full transition duration-300 group-hover:scale-[1.03] group-hover:brightness-110"
        :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imageLoaded = true"
        @error="imageLoaded = true"
        @dragstart.stop="handleDragStart"
      />

      <!-- ── Checkbox — always visible, top-left ─────────────────────────────── -->
      <label
        class="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded border border-line bg-ink/75 transition group-hover:border-accent"
        @click.stop
      >
        <input class="h-3.5 w-3.5 accent-accent" type="checkbox" :checked="selected" @change.stop="emit('toggleSelected', image.id)" />
      </label>

      <!-- ── Expand / Vollansicht — top-right, visible on hover ──────────────── -->
      <button
        class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded border border-line bg-ink/75 text-slate-300 opacity-0 transition hover:border-white/40 hover:text-white group-hover:opacity-100"
        title="Full preview"
        @click.stop="emit('preview', image)"
      >
        <Expand class="h-3.5 w-3.5" />
      </button>

      <!-- ── Excluded badge ───────────────────────────────────────────────────── -->
      <span
        v-if="image.isArchived"
        class="absolute bottom-1.5 left-1.5 rounded border border-rose/50 bg-rose/20 px-1.5 py-0.5 text-[10px] text-rose"
      >Excluded</span>

      <!-- ── Compact action strip — slides up from bottom ───────────────────── -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full transition-transform duration-200 ease-out group-hover:translate-y-0 group-hover:pointer-events-auto"
      >
        <div class="border-t border-white/10 bg-ink/95 px-2 py-1.5 flex flex-col gap-1.5">

          <!-- Row 1: filename + posted-platform indicators -->
          <div class="flex items-center gap-1.5 min-w-0">
            <p class="min-w-0 flex-1 truncate text-[11px] font-medium text-white">{{ image.filename }}</p>
            <!-- Only platforms where image is already posted -->
            <div v-if="postedTargets.length > 0" class="flex shrink-0 gap-0.5">
              <span
                v-for="target in postedTargets"
                :key="target.id"
                class="flex h-4 w-4 items-center justify-center rounded border border-mint/40 bg-mint/10 text-mint"
                :title="`Posted on ${target.name}`"
              >
                <PlatformIcon :type="target.type" :size="9" />
              </span>
            </div>
          </div>

          <!-- Row 2: Mark for active target -->
          <div v-if="activeTarget" class="flex gap-1">
            <button
              class="button-primary h-6 flex-1 rounded text-[11px]"
              :disabled="activeTargetStatus === 'posted'"
              :title="`Mark as posted on ${activeTarget.name}`"
              @click.stop="emit('markPosted', image.id, activeTarget.id)"
            >
              <Check class="h-3 w-3" />
              {{ activeTargetStatus === "posted" ? `✓ ${activeTarget.name}` : `Mark ${activeTarget.name}` }}
            </button>
            <button
              class="button h-6 w-6 shrink-0 p-0"
              :class="activeTargetStatus === 'skipped' ? 'border-rose/50 bg-rose/10 text-rose' : 'hover:border-rose/50 hover:text-rose'"
              :title="activeTargetStatus === 'skipped' ? `Skipped for ${activeTarget.name} — undo` : `Skip for ${activeTarget.name}`"
              @click.stop="activeTargetStatus === 'skipped'
                ? emit('markPosted', image.id, activeTarget.id)
                : emit('markSkipped', image.id, activeTarget.id)"
            >
              <EyeOff class="h-3 w-3" />
            </button>
          </div>

          <!-- Row 3: utility + AI actions -->
          <div class="flex items-center gap-1">
            <button class="button h-6 w-6 shrink-0 p-0" title="Reveal file" @click.stop="emit('reveal', image)">
              <FolderOpen class="h-3.5 w-3.5" />
            </button>
            <button class="button h-6 w-6 shrink-0 p-0" title="Copy image to clipboard" @click.stop="emit('copyImage', image)">
              <Clipboard class="h-3.5 w-3.5" />
            </button>
            <button class="button h-6 w-6 shrink-0 p-0" title="Copy file path" @click.stop="emit('copyPath', image)">
              <Copy class="h-3.5 w-3.5" />
            </button>
            <button
              class="button h-6 w-6 shrink-0 p-0 transition"
              :class="image.isArchived ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'hover:border-amber-500/50 hover:text-amber-400'"
              :title="image.isArchived ? 'Restore (globally)' : 'Exclude globally'"
              @click.stop="emit('archive', image.id, !image.isArchived)"
            >
              <RotateCcw v-if="image.isArchived" class="h-3.5 w-3.5" />
              <Archive v-else class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="isFolderPreview !== undefined"
              class="button h-6 w-6 shrink-0 p-0 transition"
              :class="isFolderPreview ? 'border-violet-500/50 text-violet-400' : 'hover:border-violet-500/50 hover:text-violet-400'"
              :title="isFolderPreview ? 'Remove from folder preview' : 'Pin as folder preview (max 3)'"
              @click.stop="emit('toggleFolderPreview', image.id)"
            >
              <PinOff v-if="isFolderPreview" class="h-3.5 w-3.5" />
              <Pin v-else class="h-3.5 w-3.5" />
            </button>
            <!-- AI tools — right-aligned -->
            <div v-if="!image.isArchived && image.localPath" class="ml-auto flex gap-1">
              <button
                class="flex h-6 w-6 items-center justify-center rounded border border-line bg-transparent text-slate-400 transition hover:border-violet-500/50 hover:text-violet-400"
                title="Generate video prompt"
                @click.stop="emit('videoPrompt', image.localPath!)"
              >
                <Clapperboard class="h-3.5 w-3.5" />
              </button>
              <button
                class="flex h-6 w-6 items-center justify-center rounded border border-line bg-transparent text-slate-400 transition hover:border-sky-500/50 hover:text-sky-400"
                title="Recreate with AI"
                @click.stop="emit('recreateImage', image.localPath!)"
              >
                <Image class="h-3.5 w-3.5" />
              </button>
              <button
                class="flex h-6 w-6 items-center justify-center rounded border border-line bg-transparent text-slate-400 transition hover:border-amber-500/50 hover:text-amber-400"
                title="Upscale with Topaz"
                @click.stop="emit('upscaleImage', image.localPath!)"
              >
                <Zap class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </article>
</template>
