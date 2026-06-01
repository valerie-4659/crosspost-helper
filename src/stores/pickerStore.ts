import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { copyImagePath, copyImageToClipboard, revealImage } from "@/services/imageActionService";
import { countEligibleImages, markImagePosted, pickRandomUnpostedImage } from "@/services/pickerService";
import { pickRandomImages, setImageArchived } from "@/repositories/imageRepository";
import { upsertPostRecord } from "@/repositories/postRecordRepository";
import { useTargetStore } from "./targetStore";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

const HISTORY_MAX = 10;
/** Fraction of the pool that must be picked before a skipped image is re-eligible. */
const COOLDOWN_FRACTION = 0.4;

export const usePickerStore = defineStore("picker", () => {
  const targetStore = useTargetStore();
  const currentImage = ref<ImageWithPostState | null>(null);
  const history = ref<ImageWithPostState[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const message = ref("");
  const filters = ref<ImageFilters>({
    targetId: "",
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
    includeExcludedFolders: false,
    rating: "all",
  });

  // ── Cooldown tracking (session-only — resets on app restart) ────────────
  /** Total picks done this session. Incremented on every successful pickRandom. */
  const sessionPickCount = ref(0);
  /**
   * Maps imageId → minimum sessionPickCount before the image is re-eligible.
   * Set on Skip; cleared automatically once the threshold is passed.
   */
  const cooldownMap = ref(new Map<string, number>());

  /** IDs currently on cooldown (threshold not yet reached). */
  const activeCooldownIds = computed(() =>
    [...cooldownMap.value.entries()]
      .filter(([, minCount]) => sessionPickCount.value < minCount)
      .map(([id]) => id),
  );

  const canPick = computed(() => Boolean(targetStore.activeTargetId));
  const canGoBack = computed(() => history.value.length > 0);

  async function pickRandom() {
    loading.value = true;
    error.value = null;
    try {
      filters.value.targetId = targetStore.activeTargetId;
      const next = await pickRandomUnpostedImage(filters.value, activeCooldownIds.value);
      if (!next) {
        error.value = "No unposted image matched the current filters.";
        return;
      }
      // Push current image into history before replacing it
      if (currentImage.value) {
        history.value = [currentImage.value, ...history.value].slice(0, HISTORY_MAX);
      }
      currentImage.value = next;
      sessionPickCount.value++;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  }

  function goBack() {
    if (!history.value.length) return;
    const [prev, ...rest] = history.value;
    history.value = rest;
    currentImage.value = prev;
    error.value = null;
  }

  async function markPosted() {
    if (!currentImage.value || !targetStore.activeTargetId) return;
    await markTargetPosted(targetStore.activeTargetId);
  }

  async function markTargetPosted(targetId: string) {
    if (!currentImage.value) return;
    await markImagePosted(currentImage.value.id, targetId);
    message.value = "Marked as posted.";
    await pickRandom();
  }

  /**
   * Skip the current image for this session.
   * The image is NOT written to the DB — it stays eligible long-term.
   * Instead it enters a session cooldown: it can only be re-picked after
   * 40% of the eligible pool has been seen (sessionPickCount threshold).
   */
  async function markSkipped() {
    if (!currentImage.value || !targetStore.activeTargetId) return;
    const imageId = currentImage.value.id;
    // Calculate pool size to set the cooldown threshold
    const poolSize = await countEligibleImages({ ...filters.value, targetId: targetStore.activeTargetId });
    const cooldownSteps = Math.max(1, Math.ceil(poolSize * COOLDOWN_FRACTION));
    cooldownMap.value.set(imageId, sessionPickCount.value + cooldownSteps);
    await pickRandom();
  }

  /**
   * Exclude the current image from ALL networks permanently (sets is_archived=1).
   * Use when image quality is not good enough for any platform.
   */
  async function excludeGlobally() {
    if (!currentImage.value) return;
    await setImageArchived(currentImage.value.id, true);
    message.value = "Image excluded from all networks.";
    await pickRandom();
  }

  async function openCurrentImage() {
    const image = currentImage.value;
    if (!image) return;
    await revealImage(image);
  }

  async function copyPath() {
    if (currentImage.value) {
      await copyImagePath(currentImage.value);
    }
  }

  async function copyImage() {
    if (currentImage.value) {
      await copyImageToClipboard(currentImage.value);
    }
  }

  // ── Multi-pick mode ───────────────────────────────────────────────────────
  /** When true the multi-pick panel replaces the single-image picker. */
  const multiPickMode = ref(false);
  /** The N slots for the multi-pick; undefined = empty (needs a pick). */
  const multiPickSlots = ref<Array<ImageWithPostState | undefined>>([]);
  /** How many images the user wants per post. */
  const multiPickCount = ref(3);
  /** Folders selected as the random source; empty = all folders. */
  const multiPickFolderPaths = ref<string[]>([]);
  const multiPickError = ref("");
  const multiPickMessage = ref("");

  function setMultiPickMode(on: boolean) {
    multiPickMode.value = on;
    multiPickSlots.value = Array(multiPickCount.value).fill(undefined);
    multiPickError.value = "";
    multiPickMessage.value = "";
  }

  function setMultiPickCount(n: number) {
    multiPickCount.value = n;
    // Trim or grow the slots array.
    const current = multiPickSlots.value.slice(0, n);
    while (current.length < n) current.push(undefined);
    multiPickSlots.value = current;
  }

  function toggleMultiPickFolder(folderPath: string) {
    const idx = multiPickFolderPaths.value.indexOf(folderPath);
    if (idx === -1) multiPickFolderPaths.value.push(folderPath);
    else multiPickFolderPaths.value.splice(idx, 1);
  }

  /** Fill only the empty slots with new random images. */
  async function fillMultiPickSlots() {
    multiPickError.value = "";
    multiPickMessage.value = "";
    const emptyCount = multiPickSlots.value.filter((s) => !s).length;
    if (emptyCount === 0) return;

    loading.value = true;
    try {
      const filledIds = multiPickSlots.value.filter(Boolean).map((s) => s!.id);
      const picked = await pickRandomImages(
        { ...filters.value, targetId: targetStore.activeTargetId },
        emptyCount,
        filledIds,
        multiPickFolderPaths.value,
      );
      if (!picked.length) {
        multiPickError.value = "No unposted images found for the selected folders/filters.";
        return;
      }
      // Place picked images into empty slots in order.
      let pi = 0;
      multiPickSlots.value = multiPickSlots.value.map((slot) =>
        slot ? slot : picked[pi++],
      );
      if (pi < picked.length) {
        // More were needed than available — already handled via emptyCount.
      }
      const stillEmpty = multiPickSlots.value.filter((s) => !s).length;
      if (stillEmpty > 0) {
        multiPickError.value = `Only ${multiPickCount.value - stillEmpty} images found — not enough to fill all ${multiPickCount.value} slots.`;
      }
    } catch (e) {
      multiPickError.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** Remove a specific image from the multi-pick set (clears its slot). */
  function removeMultiPickSlot(imageId: string) {
    multiPickSlots.value = multiPickSlots.value.map((s) =>
      s?.id === imageId ? undefined : s,
    );
  }

  /** Queue all filled multi-pick slots for the Chrome Extension. */
  async function queueMultiPickForExtension(targetType: string) {
    const ids = multiPickSlots.value.filter(Boolean).map((s) => s!.id);
    if (!ids.length) return;
    await window.desktop.bridge.setQueue(targetType, ids);
    multiPickMessage.value = `✓ ${ids.length} image(s) queued for ${targetType}. Open the Chrome Extension to inject.`;
  }

  /** Mark all filled slots as posted on the active target, then clear the set. */
  async function markMultiPickPosted() {
    const targetId = targetStore.activeTargetId;
    if (!targetId) return;
    const filled = multiPickSlots.value.filter(Boolean) as ImageWithPostState[];
    for (const img of filled) {
      await upsertPostRecord({ imageId: img.id, targetId, status: "posted" });
    }
    multiPickMessage.value = `Marked ${filled.length} image(s) as posted.`;
    multiPickSlots.value = Array(multiPickCount.value).fill(undefined);
  }

  return {
    currentImage,
    history,
    filters,
    loading,
    error,
    message,
    canPick,
    canGoBack,
    // Cooldown info (session)
    activeCooldownIds,
    sessionPickCount,
    pickRandom,
    goBack,
    markPosted,
    markTargetPosted,
    markSkipped,
    excludeGlobally,
    openCurrentImage,
    copyPath,
    copyImage,
    // Multi-pick
    multiPickMode,
    multiPickSlots,
    multiPickCount,
    multiPickFolderPaths,
    multiPickError,
    multiPickMessage,
    setMultiPickMode,
    setMultiPickCount,
    toggleMultiPickFolder,
    fillMultiPickSlots,
    removeMultiPickSlot,
    queueMultiPickForExtension,
    markMultiPickPosted,
  };
});
