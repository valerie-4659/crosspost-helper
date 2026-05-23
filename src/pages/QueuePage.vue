<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { GripVertical, ListPlus, Play, Plus, Sparkles, Trash2, X, CheckCircle, SkipForward } from "lucide-vue-next";
import { useQueueStore } from "@/stores/queueStore";
import { useTargetStore } from "@/stores/targetStore";
import { useImageStore } from "@/stores/imageStore";
import { useAiStore } from "@/stores/aiStore";
import type { QueueSlot } from "@/types/queue";

const queueStore = useQueueStore();
const targetStore = useTargetStore();
const imageStore = useImageStore();
const ai = useAiStore();

// ── Create form ───────────────────────────────────────────────────────────────
const showCreateForm = ref(false);
const newName = ref("");
const newTargetId = ref("");
const newSlotCount = ref(3);

async function submitCreate() {
  if (!newName.value.trim() || !newTargetId.value) return;
  await queueStore.addQueue(newName.value.trim(), newTargetId.value, newSlotCount.value);
  newName.value = ""; newSlotCount.value = 3; showCreateForm.value = false;
}

// ── AI generation per slot ────────────────────────────────────────────────────
const generatingSlotId = ref<string | null>(null);
const aiHint = ref("");

async function generateAiForSlot(slot: QueueSlot) {
  const images = queueStore.slotImages[slot.id] ?? [];
  const localPath = images[0]?.localPath;
  if (!localPath) return;
  generatingSlotId.value = slot.id;
  ai.clearGeneratedPost();
  const target = targetStore.targets.find((t) => t.id === queueStore.activeQueue?.targetId);
  await ai.generatePost([localPath], target?.type ?? "x", aiHint.value.trim() || undefined);
  if (ai.generatedPost) {
    await queueStore.setSlotAi(
      slot.id,
      ai.generatedPost.title ?? "",
      ai.generatedPost.description ?? "",
      ai.generatedPost.tags ?? [],
    );
  }
  generatingSlotId.value = null;
}

// ── Drag & drop reorder ───────────────────────────────────────────────────────
const dragSlotId = ref<string | null>(null);
const dragOverSlotId = ref<string | null>(null);

function onDragStart(slotId: string) { dragSlotId.value = slotId; }
function onDragOver(e: DragEvent, slotId: string) { e.preventDefault(); dragOverSlotId.value = slotId; }
function onDragLeave() { dragOverSlotId.value = null; }
async function onDrop(targetSlotId: string) {
  if (!dragSlotId.value || dragSlotId.value === targetSlotId) { dragOverSlotId.value = null; return; }
  const ids = queueStore.slots.map((s) => s.id);
  const from = ids.indexOf(dragSlotId.value);
  const to = ids.indexOf(targetSlotId);
  ids.splice(from, 1); ids.splice(to, 0, dragSlotId.value);
  await queueStore.reorder(ids);
  dragSlotId.value = null; dragOverSlotId.value = null;
}

// ── Per-slot image management ─────────────────────────────────────────────────
async function removeImageFromSlot(slotId: string, imageId: string) {
  const slot = queueStore.slots.find((s) => s.id === slotId);
  if (!slot) return;
  await queueStore.setSlotImages(slotId, slot.imageIds.filter((id) => id !== imageId));
}

// Image drag-to-reorder within a slot
const imgDragSlot = ref<string | null>(null);
const imgDragId   = ref<string | null>(null);
const imgDragOver = ref<string | null>(null);

function onImgDragStart(e: DragEvent, slotId: string, imageId: string) {
  e.stopPropagation();
  imgDragSlot.value = slotId; imgDragId.value = imageId;
}
function onImgDragOver(e: DragEvent, imageId: string) {
  e.preventDefault(); e.stopPropagation();
  imgDragOver.value = imageId;
}
function onImgDragLeave(e: DragEvent) { e.stopPropagation(); imgDragOver.value = null; }
async function onImgDrop(e: DragEvent, slotId: string, targetId: string) {
  e.stopPropagation();
  if (!imgDragId.value || imgDragId.value === targetId || imgDragSlot.value !== slotId) {
    imgDragId.value = null; imgDragOver.value = null; return;
  }
  const slot = queueStore.slots.find((s) => s.id === slotId);
  if (!slot) return;
  const ids = [...slot.imageIds];
  const from = ids.indexOf(imgDragId.value);
  const to   = ids.indexOf(targetId);
  ids.splice(from, 1); ids.splice(to, 0, imgDragId.value);
  await queueStore.setSlotImages(slotId, ids);
  imgDragId.value = null; imgDragOver.value = null;
}

// ── Execution mode ────────────────────────────────────────────────────────────
const execMode  = ref(false);
const execIndex = ref(0);
// Steps: compose (initial) → generating → sent
const execStep  = ref<"compose" | "generating" | "sent">("compose");
// Holds freshly generated AI text for this execution (separate from slot-stored AI)
const execAiResult = ref<{ title: string; description: string; tags: string[] } | null>(null);
const execAiError  = ref<string | null>(null);

const pendingSlots = computed(() => queueStore.slots.filter((s) => !s.posted));
const execSlot     = computed(() => pendingSlots.value[execIndex.value] ?? null);

// Reset step state whenever the active slot changes
watch(execSlot, () => {
  execStep.value     = "compose";
  execAiResult.value = null;
  execAiError.value  = null;
});

function startExecution() { execIndex.value = 0; execMode.value = true; }
function execExit()       { execMode.value = false; }

async function execGenerateAI() {
  if (!execSlot.value || !queueStore.activeQueue) return;
  const images = queueStore.slotImages[execSlot.value.id] ?? [];
  const localPath = images[0]?.localPath;
  if (!localPath) return;
  execStep.value     = "generating";
  execAiResult.value = null;
  execAiError.value  = null;
  try {
    const target = targetStore.targets.find((t) => t.id === queueStore.activeQueue!.targetId);
    await ai.generatePost([localPath], target?.type ?? "x", aiHint.value.trim() || undefined);
    if (ai.generatedPost) {
      execAiResult.value = {
        title:       ai.generatedPost.title       ?? "",
        description: ai.generatedPost.description ?? "",
        tags:        [...(ai.generatedPost.tags   ?? [])],
      };
      // Persist to slot so it survives navigation
      await queueStore.setSlotAi(execSlot.value.id, execAiResult.value.title, execAiResult.value.description, execAiResult.value.tags);
    }
  } catch (err) {
    execAiError.value = err instanceof Error ? err.message : String(err);
  }
  execStep.value = "compose";
}

async function execSend() {
  if (!execSlot.value || !queueStore.activeQueue) return;
  const { targetType } = queueStore.activeQueue;
  const ids = execSlot.value.imageIds;
  if (ids.length) await window.desktop.bridge.setQueue(targetType, ids);
  // Use freshly generated AI if available, otherwise fall back to slot-stored AI
  const aiData = execAiResult.value ?? (
    (execSlot.value.aiTitle || execSlot.value.aiDescription)
      ? { title: execSlot.value.aiTitle ?? "", description: execSlot.value.aiDescription ?? "", tags: [...(execSlot.value.aiTags ?? [])] }
      : null
  );
  if (aiData) {
    await window.desktop.bridge.setPostContent(targetType, {
      title:       aiData.title,
      description: aiData.description,
      tags:        aiData.tags,
    });
  }
  execStep.value = "sent";
}

async function execMark() {
  if (!execSlot.value || !queueStore.activeQueue) return;
  const { targetId } = queueStore.activeQueue;
  for (const imgId of execSlot.value.imageIds) {
    await imageStore.markPosted(imgId, targetId);
  }
  await queueStore.postSlot(execSlot.value.id);
  execStep.value = "compose";
  if (execIndex.value >= pendingSlots.value.length) execMode.value = false;
}

function execSkip() {
  execStep.value = "compose";
  if (execIndex.value < pendingSlots.value.length - 1) execIndex.value++;
  else execMode.value = false;
}

// ── Debug helper ─────────────────────────────────────────────────────────────
async function debugSlotData() {
  const queueId = queueStore.activeQueueId;
  if (!queueId) { console.warn("[Debug] No active queue"); return; }
  const rows = await (window as any).desktop.core.invoke("debug_queue_slots", { queueId });
  console.table(rows.map((r: any) => ({
    id: r.id,
    stored: (r._stored_ids ?? []).length,
    found: (r._found_ids ?? []).length,
    missing: (r._missing_ids ?? []).join(", ") || "—",
    aiTitle: r.ai_title ?? "",
    posted: r.posted,
  })));
  console.log("[Debug] Full rows:", rows);
}

onMounted(async () => {
  await queueStore.load();
  if (!newTargetId.value && targetStore.enabledTargets.length)
    newTargetId.value = targetStore.enabledTargets[0].id;
  // Auto-open the sole queue (or previously-active queue) so images reload from DB.
  const target = queueStore.activeQueueId
    ?? (queueStore.queues.length === 1 ? queueStore.queues[0].id : null);
  if (target && !queueStore.activeQueueId) await queueStore.openQueue(target);
});
</script>

<template>
  <div class="relative flex h-full overflow-hidden">

    <!-- ── Left sidebar: queue list ─────────────────────────────────────────── -->
    <aside class="flex w-64 shrink-0 flex-col border-r border-line bg-panel p-3 gap-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-white">Job Queues</span>
        <button class="button h-7 w-7 p-0" title="New Queue" @click="showCreateForm = !showCreateForm">
          <Plus class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Create form -->
      <form v-if="showCreateForm" class="flex flex-col gap-2 rounded-lg border border-line bg-panelSoft p-2" @submit.prevent="submitCreate">
        <input v-model="newName" aria-label="Queue name" class="input h-7 text-xs" placeholder="Queue name" required />
        <select v-model="newTargetId" class="input h-7 text-xs">
          <option v-for="t in targetStore.enabledTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 shrink-0">Slots:</span>
          <input v-model.number="newSlotCount" type="number" min="0" max="30" aria-label="Initial slot count" class="input h-7 w-16 text-xs" />
        </div>
        <div class="flex gap-1.5">
          <button type="button" class="button h-7 flex-1 text-xs" @click="showCreateForm = false">Cancel</button>
          <button type="submit" class="button-primary h-7 flex-1 text-xs">Create</button>
        </div>
      </form>

      <!-- Queue list -->
      <nav class="flex flex-1 flex-col gap-1 overflow-y-auto">
        <button
          v-for="q in queueStore.queues" :key="q.id"
          class="group flex items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition hover:bg-panelSoft"
          :class="queueStore.activeQueueId === q.id ? 'bg-panelSoft border border-accent/40' : 'border border-transparent'"
          @click="queueStore.openQueue(q.id)"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-white">{{ q.name }}</p>
            <p class="text-slate-400">{{ q.targetName }} · {{ q.pendingCount }}/{{ q.slotCount }} pending</p>
          </div>
          <button
            class="shrink-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
            @click.stop="queueStore.removeQueue(q.id)"
          ><Trash2 class="h-3.5 w-3.5" /></button>
        </button>
        <p v-if="!queueStore.queues.length" class="text-xs text-slate-500 px-1 pt-2">No queues yet. Create one above.</p>
      </nav>
    </aside>

    <!-- ── Main content: slot editor ────────────────────────────────────────── -->
    <main class="flex flex-1 flex-col overflow-hidden">
      <!-- Empty state -->
      <div v-if="!queueStore.activeQueue" class="flex flex-1 items-center justify-center text-slate-500 text-sm">
        Select or create a queue →
      </div>

      <template v-else>
        <!-- Queue header -->
        <div class="flex shrink-0 flex-col gap-2 border-b border-line px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <h2 class="font-semibold text-white truncate">{{ queueStore.activeQueue.name }}</h2>
              <p class="text-xs text-slate-400">{{ queueStore.activeQueue.targetName }} · {{ queueStore.activeQueue.pendingCount }} pending</p>
            </div>
            <button
              class="button h-7 px-2 text-xs text-slate-500 hover:text-slate-300"
              title="Debug: log slot image data to console"
              @click="debugSlotData"
            >🔍</button>
            <button
              class="button-primary h-8 gap-1.5 px-3 text-xs"
              :disabled="!pendingSlots.length"
              @click="startExecution"
            ><Play class="h-3.5 w-3.5" />Execute</button>
          </div>
          <!-- AI hint input — shared across all slots and execute mode -->
          <input
            v-model="aiHint"
            class="input h-7 w-full text-xs"
            placeholder="AI context (optional) — e.g. this is a post for #FoxyFriday"
          />
        </div>

        <!-- Slot list -->
        <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          <div
            v-for="slot in queueStore.slots" :key="slot.id"
            class="rounded-lg border transition"
            :class="[
              dragOverSlotId === slot.id ? 'border-accent bg-accent/5' : 'border-line bg-panel',
              slot.posted ? 'opacity-50' : '',
            ]"
            draggable="true"
            @dragstart="onDragStart(slot.id)"
            @dragover="onDragOver($event, slot.id)"
            @dragleave="onDragLeave"
            @drop="onDrop(slot.id)"
          >
            <!-- Slot header -->
            <div class="flex items-center gap-2 px-3 py-2 border-b border-line/50">
              <GripVertical class="h-4 w-4 text-slate-600 cursor-grab shrink-0" />
              <span class="text-xs font-semibold text-slate-300">Slot {{ slot.position + 1 }}</span>
              <span v-if="slot.posted" class="ml-1 rounded-full bg-mint/20 px-1.5 py-0.5 text-[10px] text-mint">posted</span>
              <div class="ml-auto flex gap-1.5">

                <button
                  class="button h-6 gap-1 px-2 text-xs"
                  :disabled="!queueStore.slotImages[slot.id]?.length || generatingSlotId === slot.id"
                  @click="generateAiForSlot(slot)"
                >
                  <Sparkles class="h-3 w-3" :class="generatingSlotId === slot.id ? 'animate-pulse' : ''" />AI
                </button>
                <button class="button h-6 w-6 p-0 hover:border-red-500/50 hover:text-red-400" @click="queueStore.removeSlot(slot.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>

            <!-- Images -->
            <div class="flex flex-wrap gap-2 px-3 py-2">
              <div v-if="!(queueStore.slotImages[slot.id]?.length)" class="text-xs text-slate-500 italic">← Use Library or Picker to assign images to this slot.</div>
              <!-- Draggable image tile with × remove button -->
              <div
                v-for="img in (queueStore.slotImages[slot.id] ?? [])"
                :key="img.id"
                class="group relative h-16 w-16 shrink-0 cursor-grab overflow-hidden rounded border transition"
                :class="imgDragOver === img.id && imgDragSlot === slot.id
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-line'"
                draggable="true"
                @dragstart="onImgDragStart($event, slot.id, img.id)"
                @dragover="onImgDragOver($event, img.id)"
                @dragleave="onImgDragLeave($event)"
                @drop="onImgDrop($event, slot.id, img.id)"
              >
                <img :src="img.thumbnailUrl ?? ''" :alt="img.filename" class="h-full w-full object-cover" />
                <!-- Remove button — appears on hover -->
                <button
                  class="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink/80 opacity-0 transition group-hover:opacity-100 hover:bg-rose/90"
                  title="Remove from slot"
                  @click.stop="removeImageFromSlot(slot.id, img.id)"
                ><X class="h-2.5 w-2.5" /></button>
              </div>
            </div>

            <!-- AI text preview -->
            <div v-if="slot.aiTitle || slot.aiDescription" class="border-t border-line/50 px-3 py-2 text-xs space-y-0.5">
              <p v-if="slot.aiTitle" class="font-medium text-white truncate">{{ slot.aiTitle }}</p>
              <p v-if="slot.aiDescription" class="text-slate-400 line-clamp-2">{{ slot.aiDescription }}</p>
              <p v-if="slot.aiTags?.length" class="text-accent truncate">{{ slot.aiTags.map(t => '#'+t).join(' ') }}</p>
            </div>
          </div>

          <!-- Add slot -->
          <button class="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-slate-500 hover:border-accent/50 hover:text-accent transition" @click="queueStore.addSlot">
            <ListPlus class="h-4 w-4" />Add Slot
          </button>
        </div>
      </template>
    </main>

    <!-- ── Execution Mode Overlay ─────────────────────────────────────────────── -->
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="execMode" class="absolute inset-0 z-30 flex flex-col bg-ink/95 backdrop-blur-sm">
        <!-- Exec header -->
        <div class="flex items-center gap-3 border-b border-line px-6 py-4">
          <span class="text-sm font-semibold text-white">
            Slot {{ execIndex + 1 }} of {{ pendingSlots.length }}
            <span class="text-slate-400 font-normal"> — {{ queueStore.activeQueue?.name }}</span>
          </span>
          <div class="ml-auto flex gap-1 items-center">
            <div v-for="(s, i) in pendingSlots" :key="s.id" class="h-1.5 w-6 rounded-full transition-colors"
              :class="i === execIndex ? 'bg-accent' : i < execIndex ? 'bg-mint' : 'bg-slate-700'" />
          </div>
          <button class="button h-7 w-7 p-0 ml-4" @click="execExit"><X class="h-3.5 w-3.5" /></button>
        </div>

        <!-- Exec content -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Images panel -->
          <div class="flex flex-1 items-center justify-center gap-3 p-6 overflow-auto flex-wrap">
            <div v-if="!execSlot" class="text-center text-slate-500 text-sm">🎉 All slots done!</div>
            <template v-else>
              <img
                v-for="img in (queueStore.slotImages[execSlot.id] ?? []).slice(0, 4)"
                :key="img.id"
                :src="img.thumbnailUrl ?? ''"
                :alt="img.filename"
                class="max-h-64 max-w-xs rounded-xl border border-line object-cover shadow-lg"
              />
              <p v-if="!(queueStore.slotImages[execSlot.id]?.length)" class="text-slate-500 text-sm">No images in this slot.</p>
            </template>
          </div>

          <!-- AI preview panel (shown when there is AI content — freshly generated or stored) -->
          <aside
            v-if="execSlot && (execAiResult || execSlot.aiTitle || execSlot.aiDescription)"
            class="w-80 shrink-0 border-l border-line p-5 overflow-y-auto flex flex-col gap-3"
          >
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">AI Post Preview</p>
            <p v-if="(execAiResult?.title || execSlot.aiTitle)" class="font-semibold text-white">
              {{ execAiResult?.title || execSlot.aiTitle }}
            </p>
            <p class="text-sm text-slate-300 whitespace-pre-wrap">
              {{ execAiResult?.description || execSlot.aiDescription }}
            </p>
            <p v-if="(execAiResult?.tags?.length || execSlot.aiTags?.length)" class="text-xs text-accent">
              {{ (execAiResult?.tags ?? execSlot.aiTags ?? []).map((t: string) => '#'+t).join(' ') }}
            </p>
          </aside>
        </div>

        <!-- ── Exec actions footer — step-based ───────────────────────── -->

        <!-- Step: compose — ask about AI or send directly -->
        <div v-if="execStep === 'compose' && execSlot" class="flex flex-col gap-2 border-t border-line px-6 py-4">
          <input
            v-model="aiHint"
            class="input h-7 w-full text-xs"
            placeholder="AI context (optional) — e.g. this is a post for #FoxyFriday"
          />
          <div class="flex gap-3">
            <button
              class="button-primary h-10 gap-2 px-4"
              :disabled="!(queueStore.slotImages[execSlot.id]?.length)"
              @click="execGenerateAI"
            >
              <Sparkles class="h-4 w-4" />Generate AI Post
            </button>
            <button
              class="button h-10 gap-2 px-4"
              :disabled="!(queueStore.slotImages[execSlot.id]?.length)"
              @click="execSend"
            >
              📤 Send to Extension
            </button>
            <button class="button h-10 gap-2 px-4 ml-auto" @click="execSkip">
              <SkipForward class="h-4 w-4" />Skip
            </button>
          </div>
        </div>

        <!-- Step: generating — spinner -->
        <div v-else-if="execStep === 'generating'" class="flex items-center gap-3 border-t border-line px-6 py-4">
          <Sparkles class="h-5 w-5 animate-pulse text-accent" />
          <span class="text-sm text-slate-400">Generating AI post…</span>
        </div>

        <!-- Step: sent — mark as posted? -->
        <div v-else-if="execStep === 'sent'" class="flex gap-3 border-t border-line px-6 py-4 items-center">
          <p class="text-sm text-mint font-medium">✓ Sent to Extension</p>
          <div class="ml-auto flex gap-3">
            <button class="button h-10 gap-2 px-4" @click="execSkip">
              <SkipForward class="h-4 w-4" />Later
            </button>
            <button class="button-primary h-10 gap-2 px-4" @click="execMark">
              <CheckCircle class="h-4 w-4" />Mark as Posted
            </button>
          </div>
        </div>

        <!-- Fallback: all done -->
        <div v-else-if="!execSlot" class="flex gap-3 border-t border-line px-6 py-4">
          <button class="button h-10 gap-2 px-4 mx-auto" @click="execExit">
            <X class="h-4 w-4" />Close
          </button>
        </div>
      </div>
    </Transition>

  </div>
</template>
