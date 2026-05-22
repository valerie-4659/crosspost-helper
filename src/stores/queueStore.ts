import { ref, computed } from "vue";
import { defineStore } from "pinia";
import {
  listQueues, createQueue, deleteQueue,
  listSlots, createSlot, updateSlotAi,
  reorderSlots, deleteSlot, markSlotPosted, getSlotImageData,
  setSlotImagesExclusive,
} from "@/repositories/queueRepository";
import type { PostQueue, QueueSlot, SlotImageData } from "@/types/queue";

export const useQueueStore = defineStore("queues", () => {
  const queues = ref<PostQueue[]>([]);
  const activeQueueId = ref<string | null>(null);
  const slots = ref<QueueSlot[]>([]);
  const slotImages = ref<Record<string, SlotImageData[]>>({});
  const loading = ref(false);
  const slotsLoading = ref(false);
  const message = ref("");
  const error = ref("");

  const activeQueue = computed(() =>
    queues.value.find((q) => q.id === activeQueueId.value) ?? null,
  );

  // ── Load ──────────────────────────────────────────────────────────────────────
  async function load() {
    loading.value = true;
    try {
      queues.value = await listQueues();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function openQueue(id: string) {
    activeQueueId.value = id;
    slotsLoading.value = true;
    slotImages.value = {};
    try {
      slots.value = await listSlots(id);
      await resolveSlotImages();
    } finally {
      slotsLoading.value = false;
    }
  }

  async function resolveSlotImages() {
    for (const slot of slots.value) {
      if (slot.imageIds.length) {
        const images = await getSlotImageData(slot.imageIds);
        if (images.length < slot.imageIds.length) {
          const foundIds = new Set(images.map((i) => i.id));
          const missing = slot.imageIds.filter((id) => !foundIds.has(id));
          console.warn(
            `[Queue] Slot ${slot.id}: ${slot.imageIds.length} id(s) stored, ` +
            `but only ${images.length} found in DB. Missing: ${missing.join(", ")}`,
          );
        }
        slotImages.value[slot.id] = images;
      } else {
        slotImages.value[slot.id] = [];
      }
    }
  }

  // ── Queue CRUD ────────────────────────────────────────────────────────────────
  async function addQueue(name: string, targetId: string, initialSlots = 0) {
    const q = await createQueue(name, targetId);
    queues.value.push(q);
    activeQueueId.value = q.id;
    slots.value = [];
    slotImages.value = {};
    for (let i = 0; i < initialSlots; i++) {
      await _appendSlot(q.id, i);
    }
  }

  async function removeQueue(id: string) {
    await deleteQueue(id);
    queues.value = queues.value.filter((q) => q.id !== id);
    if (activeQueueId.value === id) {
      activeQueueId.value = queues.value[0]?.id ?? null;
      if (activeQueueId.value) await openQueue(activeQueueId.value);
      else slots.value = [];
    }
  }

  // ── Slot CRUD ─────────────────────────────────────────────────────────────────
  async function _appendSlot(queueId: string, position: number) {
    const slot = await createSlot(queueId, position);
    slots.value.push(slot);
    slotImages.value[slot.id] = [];
  }

  async function addSlot() {
    if (!activeQueueId.value) return;
    await _appendSlot(activeQueueId.value, slots.value.length);
    await refreshQueueMeta();
  }

  async function removeSlot(id: string) {
    await deleteSlot(id);
    slots.value = slots.value.filter((s) => s.id !== id);
    delete slotImages.value[id];
    // Re-number positions
    for (let i = 0; i < slots.value.length; i++) slots.value[i].position = i;
    await reorderSlots(slots.value.map((s) => s.id));
    await refreshQueueMeta();
  }

  async function setSlotImages(slotId: string, imageIds: string[]) {
    // Exclusive assignment: removes these IDs from every other slot in the queue.
    const changed = await setSlotImagesExclusive(slotId, imageIds);

    // Update in-memory slots and thumbnail cache for every affected slot.
    for (const [changedSlotId, newIds] of Object.entries(changed)) {
      const idx = slots.value.findIndex((s) => s.id === changedSlotId);
      if (idx !== -1) slots.value[idx] = { ...slots.value[idx], imageIds: newIds };
      slotImages.value[changedSlotId] = newIds.length ? await getSlotImageData(newIds) : [];
    }
  }

  async function setSlotAi(slotId: string, title: string, description: string, tags: string[]) {
    await updateSlotAi(slotId, title, description, tags);
    const idx = slots.value.findIndex((s) => s.id === slotId);
    if (idx !== -1) slots.value[idx] = { ...slots.value[idx], aiTitle: title, aiDescription: description, aiTags: tags };
  }

  async function reorder(orderedIds: string[]) {
    await reorderSlots(orderedIds);
    const byId = Object.fromEntries(slots.value.map((s) => [s.id, s]));
    slots.value = orderedIds.map((id, i) => ({ ...byId[id], position: i }));
  }

  async function postSlot(slotId: string) {
    await markSlotPosted(slotId);
    const idx = slots.value.findIndex((s) => s.id === slotId);
    if (idx !== -1) slots.value[idx] = { ...slots.value[idx], posted: true };
    await refreshQueueMeta();
  }

  async function refreshQueueMeta() {
    // Refresh queue list to get updated slot/pending counts
    queues.value = await listQueues();
  }

  return {
    queues, activeQueueId, activeQueue, slots, slotImages,
    loading, slotsLoading, message, error,
    load, openQueue, addQueue, removeQueue,
    addSlot, removeSlot, setSlotImages, setSlotAi, reorder, postSlot,
  };
});
