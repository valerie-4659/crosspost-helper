<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { ExternalLink, FolderOpen, RefreshCcw, Trash2 } from "lucide-vue-next";

const jobs = ref<WavespeedJobRecord[]>([]);
const loading = ref(false);

const STATUS_LABEL: Record<string, string> = {
  created:    "Queued",
  processing: "Rendering…",
  completed:  "Done",
  failed:     "Failed",
};

const STATUS_DOT: Record<string, string> = {
  created:    "bg-gold animate-pulse",
  processing: "bg-violet-400 animate-pulse",
  completed:  "bg-mint",
  failed:     "bg-rose",
};

async function load() {
  loading.value = true;
  try {
    jobs.value = await window.desktop.wavespeed.getJobs();
  } finally {
    loading.value = false;
  }
}

function handleJobUpdated(data: Partial<WavespeedJobRecord>) {
  const idx = jobs.value.findIndex((j) => j.id === data.id);
  if (idx !== -1) {
    jobs.value[idx] = { ...jobs.value[idx], ...data };
  }
}

async function deleteJob(localId: string) {
  await window.desktop.wavespeed.deleteJob(localId);
  jobs.value = jobs.value.filter((j) => j.id !== localId);
}

function openVideo(url: string) {
  window.desktop.opener.openUrl(url);
}

function revealImage(path: string) {
  window.desktop.opener.revealItemInDir(path);
}

function thumbSrc(imagePath: string): string {
  return window.desktop.core.convertFileSrcSync?.(imagePath) ?? imagePath;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

onMounted(async () => {
  await load();
  window.desktop.wavespeed.onJobUpdated(handleJobUpdated);
});

onUnmounted(() => {
  window.desktop.wavespeed.offJobUpdated();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Header -->
    <div class="flex items-center gap-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 flex-1">
        Video Generation Jobs
      </p>
      <button class="button h-6 w-6 p-0" title="Refresh" @click="load">
        <RefreshCcw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Empty state -->
    <p v-if="!loading && !jobs.length" class="text-center text-xs text-slate-600 py-6">
      No jobs yet — generate a prompt and click "Submit to Wavespeed".
    </p>

    <!-- Job list -->
    <div class="flex flex-col gap-2">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="flex items-start gap-3 rounded-lg border border-line bg-panelSoft p-2.5"
      >
        <!-- Thumbnail -->
        <img
          v-if="job.image_path"
          :src="thumbSrc(job.image_path)"
          class="h-12 w-12 shrink-0 rounded object-cover border border-line"
          draggable="false"
        />

        <!-- Info -->
        <div class="min-w-0 flex-1 space-y-1">
          <!-- Status row -->
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="STATUS_DOT[job.status] ?? 'bg-slate-500'" />
            <span class="text-xs font-medium text-slate-200">{{ STATUS_LABEL[job.status] ?? job.status }}</span>
            <span class="ml-auto text-[10px] text-slate-600 shrink-0">{{ relativeTime(job.created_at) }}</span>
          </div>
          <!-- Model + settings -->
          <p class="text-[10px] text-slate-500 truncate">
            {{ job.model }} · {{ job.resolution }} · {{ job.duration }}s
          </p>
          <!-- Prompt snippet -->
          <p class="text-[11px] text-slate-400 line-clamp-2 leading-snug">{{ job.prompt }}</p>
          <!-- Error -->
          <p v-if="job.error_msg" class="text-[11px] text-rose">{{ job.error_msg }}</p>
        </div>

        <!-- Actions -->
        <div class="flex shrink-0 flex-col gap-1">
          <button
            v-if="job.video_url"
            class="button h-6 gap-1 px-2 text-[10px] border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
            title="Open video"
            @click="openVideo(job.video_url!)"
          >
            <ExternalLink class="h-3 w-3" />Video
          </button>
          <button
            v-if="job.image_path"
            class="button h-6 w-6 p-0"
            title="Reveal source image in Finder"
            @click="revealImage(job.image_path)"
          >
            <FolderOpen class="h-3 w-3" />
          </button>
          <button
            class="button h-6 w-6 p-0 hover:border-rose/60 hover:text-rose"
            title="Remove from list"
            @click="deleteJob(job.id)"
          >
            <Trash2 class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
