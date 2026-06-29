<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ArrowUp, Check, Clapperboard, Download, GripVertical, Image, Pencil, Trash2, X } from "lucide-vue-next";

const jobs = ref<JobQueueRecord[]>([]);
const loading = ref(true);

// Drag-and-drop state
const dragId = ref<number | null>(null);
const dragOverId = ref<number | null>(null);

// Edit modal state
const editingJob = ref<JobQueueRecord | null>(null);
const editPrompt = ref("");
const editSaving = ref(false);

// Delete confirm state
const confirmDeleteId = ref<number | null>(null);

const pendingJobs = computed(() => jobs.value.filter((j) => j.status === "pending"));
const runningJob  = computed(() => jobs.value.find((j) => j.status === "running") ?? null);
const doneJobs    = computed(() => jobs.value.filter((j) => j.status === "completed" || j.status === "failed").slice(0, 20));

async function loadJobs() {
  jobs.value = await window.desktop.jobqueue.list();
  loading.value = false;
}

onMounted(async () => {
  await loadJobs();
  window.desktop.jobqueue.onUpdated(async () => {
    await loadJobs();
  });
});

onUnmounted(() => {
  window.desktop.jobqueue.offUpdated();
});

// ── Drag & Drop ──────────────────────────────────────────────────────────────
function onDragStart(e: DragEvent, id: number) {
  dragId.value = id;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e: DragEvent, id: number) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOverId.value = id;
}

function onDragEnd() {
  dragId.value = null;
  dragOverId.value = null;
}

async function onDrop(e: DragEvent, targetId: number) {
  e.preventDefault();
  dragOverId.value = null;
  if (!dragId.value || dragId.value === targetId) return;

  const list = [...pendingJobs.value];
  const fromIdx = list.findIndex((j) => j.id === dragId.value);
  const toIdx   = list.findIndex((j) => j.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, moved);

  const newPositions = list.map((j, idx) => ({ id: j.id, position: idx }));
  dragId.value = null;
  await window.desktop.jobqueue.reorder(newPositions);
  await loadJobs();
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function prioritize(id: number) {
  await window.desktop.jobqueue.prioritize(id);
  await loadJobs();
}

function askDelete(id: number) {
  confirmDeleteId.value = id;
}

async function confirmDelete() {
  if (confirmDeleteId.value === null) return;
  await window.desktop.jobqueue.delete(confirmDeleteId.value);
  confirmDeleteId.value = null;
  await loadJobs();
}

function openEdit(job: JobQueueRecord) {
  editingJob.value = job;
  editPrompt.value = job.prompt;
}

function closeEdit() {
  editingJob.value = null;
  editPrompt.value = "";
}

async function saveEdit() {
  if (!editingJob.value) return;
  editSaving.value = true;
  try {
    let params: Record<string, unknown> = {};
    try { params = JSON.parse(editingJob.value.params); } catch { /* ignore */ }
    params.prompt = editPrompt.value;
    await window.desktop.jobqueue.edit({
      id: editingJob.value.id,
      prompt: editPrompt.value,
      params,
    });
    await loadJobs();
    closeEdit();
  } finally {
    editSaving.value = false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function modelLabel(job: JobQueueRecord) {
  return job.model.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function thumbnailSrc(imagePath: string) {
  return window.desktop.core.convertFileSrcSync?.(imagePath) ?? "";
}
</script>

<template>
  <div class="space-y-5">

    <!-- ── Running job ──────────────────────────────────────────────────────── -->
    <div v-if="runningJob">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-400/80">
        Processing
      </p>
      <div class="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-3">
        <div class="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-violet-400 animate-pulse" />
        <div class="min-w-0 flex-1 space-y-0.5">
          <div class="flex items-center gap-1.5">
            <Clapperboard v-if="runningJob.type === 'video'" class="h-3 w-3 shrink-0 text-violet-400" />
            <Image v-else class="h-3 w-3 shrink-0 text-violet-400" />
            <span class="text-[11px] font-medium text-violet-300">{{ modelLabel(runningJob) }}</span>
          </div>
          <p class="truncate text-xs text-slate-400">{{ runningJob.prompt || '—' }}</p>
        </div>
        <img
          v-if="runningJob.image_path"
          :src="thumbnailSrc(runningJob.image_path)"
          class="h-10 w-10 shrink-0 rounded object-cover opacity-70"
          alt=""
        />
      </div>
    </div>

    <!-- ── Pending queue ────────────────────────────────────────────────────── -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Queue
          <span v-if="pendingJobs.length" class="ml-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            {{ pendingJobs.length }}
          </span>
        </p>
        <p v-if="pendingJobs.length > 1" class="text-[10px] text-slate-600">Drag to reorder</p>
      </div>

      <div v-if="!pendingJobs.length && !loading" class="rounded-xl border border-dashed border-line py-8 text-center text-xs text-slate-600">
        No jobs queued — use "Add to Queue" in the image or video panels.
      </div>

      <ul class="space-y-1.5">
        <li
          v-for="(job, idx) in pendingJobs"
          :key="job.id"
          draggable="true"
          class="group flex cursor-grab items-start gap-2.5 rounded-xl border px-3 py-2.5 transition active:cursor-grabbing"
          :class="[
            dragOverId === job.id && dragId !== job.id
              ? 'border-accent/60 bg-accent/10'
              : 'border-line bg-panel hover:border-slate-600',
            dragId === job.id ? 'opacity-50' : '',
          ]"
          @dragstart="onDragStart($event, job.id)"
          @dragover="onDragOver($event, job.id)"
          @dragleave="dragOverId = null"
          @dragend="onDragEnd"
          @drop="onDrop($event, job.id)"
        >
          <!-- Grip + position -->
          <div class="flex shrink-0 flex-col items-center gap-1 pt-0.5">
            <GripVertical class="h-4 w-4 text-slate-600 group-hover:text-slate-400" />
            <span class="text-[10px] text-slate-700">{{ idx + 1 }}</span>
          </div>

          <!-- Thumbnail -->
          <img
            v-if="job.image_path"
            :src="thumbnailSrc(job.image_path)"
            class="h-10 w-10 shrink-0 rounded object-cover"
            alt=""
          />
          <div v-else class="h-10 w-10 shrink-0 rounded bg-slate-800" />

          <!-- Details -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span
                class="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                :class="job.type === 'video' ? 'bg-violet-500/20 text-violet-400' : 'bg-sky-500/20 text-sky-400'"
              >{{ job.type }}</span>
              <span class="text-[11px] font-medium text-slate-300">{{ modelLabel(job) }}</span>
            </div>
            <p class="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
              {{ job.prompt || 'No prompt' }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
            <button
              v-if="idx > 0"
              class="button h-6 w-6 p-0"
              title="Move to top"
              @click.stop="prioritize(job.id)"
            >
              <ArrowUp class="h-3 w-3" />
            </button>
            <button class="button h-6 w-6 p-0" title="Edit prompt" @click.stop="openEdit(job)">
              <Pencil class="h-3 w-3" />
            </button>
            <button class="button h-6 w-6 p-0 text-rose hover:border-rose/50 hover:bg-rose/10" title="Remove" @click.stop="askDelete(job.id)">
              <Trash2 class="h-3 w-3" />
            </button>
          </div>
        </li>
      </ul>
    </div>

    <!-- ── Done / failed ────────────────────────────────────────────────────── -->
    <div v-if="doneJobs.length">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent</p>
      <ul class="space-y-1">
        <li
          v-for="job in doneJobs"
          :key="job.id"
          class="flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
          :class="job.status === 'completed' ? 'border-mint/20 bg-mint/5' : 'border-rose/20 bg-rose/5'"
        >
          <div
            class="mt-1 h-2 w-2 shrink-0 rounded-full"
            :class="job.status === 'completed' ? 'bg-mint' : 'bg-rose'"
          />
          <img
            v-if="job.image_path"
            :src="thumbnailSrc(job.image_path)"
            class="h-8 w-8 shrink-0 rounded object-cover opacity-60"
            alt=""
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-medium" :class="job.status === 'completed' ? 'text-mint' : 'text-rose'">
                {{ job.status === 'completed' ? 'Done' : 'Failed' }}
              </span>
              <span class="text-[11px] text-slate-500">{{ modelLabel(job) }}</span>
              <span class="text-[10px] text-slate-700">{{ job.type }}</span>
            </div>
            <p v-if="job.status === 'failed' && job.error_msg" class="mt-0.5 text-[11px] text-rose/70 line-clamp-2">
              {{ job.error_msg }}
            </p>
            <p v-if="job.status === 'completed'" class="mt-0.5 text-[11px] text-slate-600">
              Result available in the {{ job.type === 'video' ? 'Video' : 'Image' }} Queue tab.
            </p>
          </div>
          <button
            class="button h-6 w-6 shrink-0 p-0 text-slate-600"
            title="Remove from history"
            @click="askDelete(job.id)"
          >
            <X class="h-3 w-3" />
          </button>
        </li>
      </ul>
    </div>

    <!-- ── Empty state (no jobs at all) ─────────────────────────────────────── -->
    <div v-if="!loading && !runningJob && !pendingJobs.length && !doneJobs.length" class="py-6 text-center">
      <Clapperboard class="mx-auto mb-3 h-8 w-8 text-slate-700" />
      <p class="text-sm text-slate-500">Queue is empty</p>
      <p class="mt-1 text-xs text-slate-600">
        Open an image or video panel and click <strong class="text-slate-500">Add to Queue</strong>.
      </p>
    </div>

    <!-- ── Edit modal ────────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="editingJob"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        @click.self="closeEdit"
      >
        <div class="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-white">Edit Job Prompt</h2>
            <button class="button h-7 w-7 p-0" @click="closeEdit"><X class="h-4 w-4" /></button>
          </div>

          <div class="space-y-1">
            <p class="text-[11px] text-slate-500">
              <span class="font-medium text-slate-400">Model:</span> {{ modelLabel(editingJob) }}
              &nbsp;·&nbsp;
              <span class="font-medium text-slate-400">Type:</span> {{ editingJob.type }}
            </p>
          </div>

          <textarea
            v-model="editPrompt"
            rows="7"
            class="w-full resize-y rounded-lg border border-line bg-panelSoft px-3 py-2.5 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
            placeholder="Enter prompt…"
          />

          <div class="flex justify-end gap-2">
            <button class="button h-8 px-4 text-xs" @click="closeEdit">Cancel</button>
            <button
              class="button-primary h-8 px-4 text-xs"
              :disabled="editSaving"
              @click="saveEdit"
            >
              <Check v-if="!editSaving" class="h-3.5 w-3.5" />
              {{ editSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Delete confirm ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="confirmDeleteId !== null"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        @click.self="confirmDeleteId = null"
      >
        <div class="w-80 rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4">
          <p class="text-sm font-semibold text-white">Remove job?</p>
          <p class="text-xs text-slate-400">This job will be removed from the queue.</p>
          <div class="flex justify-end gap-2">
            <button class="button h-8 px-4 text-xs" @click="confirmDeleteId = null">Cancel</button>
            <button class="button h-8 px-4 text-xs border-rose/50 bg-rose/10 text-rose hover:bg-rose/20" @click="confirmDelete">
              Remove
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
