<script setup lang="ts">
import { ref, watch } from "vue";
import ImageQueuePanel from "@/components/ImageQueuePanel.vue";
import JobQueuePanel from "@/components/JobQueuePanel.vue";
import VideoQueuePanel from "@/components/VideoQueuePanel.vue";

type Tab = "queue" | "images" | "videos";

const props = defineProps<{ initialTab?: Tab }>();

const activeTab = ref<Tab>(props.initialTab ?? "queue");

watch(() => props.initialTab, (t) => { if (t) activeTab.value = t; });

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "queue",  label: "Job Queue" },
  { id: "images", label: "Image Results" },
  { id: "videos", label: "Video Results" },
];
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <header class="shrink-0 border-b border-line bg-panel px-6 py-4">
      <h1 class="text-2xl font-semibold text-white">Generation Queue</h1>
      <p class="mt-1 text-sm text-slate-400">
        Wavespeed generation jobs — sequential queue, images &amp; videos. Status updates every 12 seconds.
      </p>

      <div class="mt-4 flex gap-1">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="rounded border px-3 py-1 text-xs font-medium transition"
          :class="activeTab === tab.id
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line bg-ink text-slate-400 hover:border-accent hover:text-white'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto px-6 py-5 max-w-2xl">
      <JobQueuePanel  v-if="activeTab === 'queue'"  />
      <ImageQueuePanel v-else-if="activeTab === 'images'" />
      <VideoQueuePanel v-else-if="activeTab === 'videos'" />
    </div>
  </div>
</template>
