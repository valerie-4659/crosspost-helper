<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Archive, Check, Clipboard, Copy, Expand, FolderOpen, RotateCcw } from "lucide-vue-next";
import { setImagesDragData } from "@/services/imageActionService";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTarget } from "@/types/postingTarget";

const props = defineProps<{
  image: ImageWithPostState;
  targets: PostingTarget[];
  activeTargetId?: string;
  selected?: boolean;
  dragImages?: ImageWithPostState[];
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
}>();

const imageUrl = computed(() => {
  if (props.image.thumbnailUrl) return props.image.thumbnailUrl;
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return "";
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
    @dragstart="setImagesDragData($event, dragImages)"
  >
    <div class="relative aspect-[4/3] cursor-grab bg-black/40 active:cursor-grabbing" @dblclick="emit('preview', image)">
      <img v-if="imageUrl" :src="imageUrl" :alt="image.filename" class="h-full w-full object-cover" />
      <label class="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-line bg-ink/80">
        <input class="h-4 w-4 accent-accent" type="checkbox" :checked="selected" @change.stop="emit('toggleSelected', image.id)" />
      </label>
      <button class="button absolute right-3 top-3 h-8 w-8 bg-ink/80 p-0" title="Preview large" @click="emit('preview', image)">
        <Expand class="h-4 w-4" />
      </button>
      <span v-if="image.isArchived" class="absolute bottom-3 left-3 rounded-md border border-rose/50 bg-rose/20 px-2 py-1 text-xs text-rose">
        Excluded
      </span>
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
          class="rounded-md border px-2 py-1 text-xs transition"
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
          {{ target.name }}
        </button>
      </div>
      <button
        v-if="activeTarget"
        class="button-primary w-full rounded-md"
        :disabled="activeTargetStatus === 'posted'"
        @click="emit('markPosted', image.id, activeTarget.id)"
      >
        <Check class="h-4 w-4" />
        {{ activeTargetStatus === "posted" ? `Posted on ${activeTarget.name}` : `Marked ${activeTarget.name}` }}
      </button>
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
        <button class="button h-8 w-8 p-0" :title="image.isArchived ? 'Restore' : 'Exclude'" @click="emit('archive', image.id, !image.isArchived)">
          <RotateCcw v-if="image.isArchived" class="h-4 w-4" />
          <Archive v-else class="h-4 w-4" />
        </button>
      </div>
    </div>
  </article>
</template>
