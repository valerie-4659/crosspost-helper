import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { createTarget, ensureDefaultTargets, listTargets, updateTargetEnabled } from "@/repositories/targetRepository";
import type { PostingTarget } from "@/types/postingTarget";

export const useTargetStore = defineStore("targets", () => {
  const targets = ref<PostingTarget[]>([]);
  const activeTargetId = ref<string>("");
  const loading = ref(false);

  const enabledTargets = computed(() => targets.value.filter((target) => target.enabled));
  const activeTarget = computed(() => targets.value.find((target) => target.id === activeTargetId.value) ?? null);

  async function load() {
    loading.value = true;
    try {
      await ensureDefaultTargets();
      targets.value = await listTargets();
      activeTargetId.value ||= enabledTargets.value[0]?.id ?? "";
    } finally {
      loading.value = false;
    }
  }

  async function addCustomTarget(name: string) {
    await createTarget({ name, type: "custom" });
    targets.value = await listTargets();
  }

  async function setEnabled(id: string, enabled: boolean) {
    await updateTargetEnabled(id, enabled);
    targets.value = await listTargets();
  }

  return {
    targets,
    enabledTargets,
    activeTarget,
    activeTargetId,
    loading,
    load,
    addCustomTarget,
    setEnabled,
  };
});

