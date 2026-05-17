<script setup lang="ts">
import { ref } from "vue";
import { Download, Plus, Upload } from "lucide-vue-next";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTargetStore } from "@/stores/targetStore";

const settings = useSettingsStore();
const targets = useTargetStore();
const customTargetName = ref("");
const importPayload = ref("");

async function addTarget() {
  if (!customTargetName.value.trim()) return;
  await targets.addCustomTarget(customTargetName.value.trim());
  customTargetName.value = "";
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-5">
    <header>
      <h1 class="text-2xl font-semibold text-white">Settings</h1>
      <p class="mt-1 text-sm text-slate-400">Manage posting targets and portable JSON backups.</p>
    </header>

    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">Posting targets</h2>
      <div class="mt-4 grid gap-2">
        <label v-for="target in targets.targets" :key="target.id" class="flex items-center justify-between rounded-md border border-line bg-ink px-3 py-2">
          <span class="text-sm text-slate-200">{{ target.name }}</span>
          <input :checked="target.enabled" type="checkbox" class="accent-accent" @change="targets.setEnabled(target.id, ($event.target as HTMLInputElement).checked)" />
        </label>
      </div>
      <div class="mt-4 flex gap-2">
        <input v-model="customTargetName" class="field flex-1" placeholder="Custom target name" />
        <button class="button" @click="addTarget">
          <Plus class="h-4 w-4" />
          Add
        </button>
      </div>
    </section>

    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">Import / export</h2>
      <p class="mt-1 text-sm text-slate-400">Export includes sources, targets, image metadata, hashes, and post records.</p>
      <div class="mt-4 flex gap-2">
        <button class="button-primary rounded-md" @click="settings.exportData">
          <Download class="h-4 w-4" />
          Copy export JSON
        </button>
        <button class="button" :disabled="!importPayload.trim()" @click="settings.importData(importPayload)">
          <Upload class="h-4 w-4" />
          Import JSON
        </button>
      </div>
      <textarea v-model="importPayload" class="field mt-4 h-56 w-full resize-none" placeholder="Paste export JSON to merge safely" />
      <p v-if="settings.lastMessage" class="mt-3 text-sm text-mint">{{ settings.lastMessage }}</p>
    </section>
  </div>
</template>
