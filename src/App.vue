<script setup lang="ts">
import { onMounted, ref } from "vue";
import PickerPage from "@/pages/PickerPage.vue";
import LibraryPage from "@/pages/LibraryPage.vue";
import ScanPage from "@/pages/ScanPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import SidebarNavigation, { type AppPage } from "@/components/SidebarNavigation.vue";
import { useTargetStore } from "@/stores/targetStore";
import { useSourceStore } from "@/stores/sourceStore";

const currentPage = ref<AppPage>("picker");
const targetStore = useTargetStore();
const sourceStore = useSourceStore();

onMounted(async () => {
  await Promise.all([targetStore.load(), sourceStore.load()]);
});
</script>

<template>
  <div class="flex h-screen bg-ink text-slate-100">
    <SidebarNavigation v-model:page="currentPage" />
    <main class="min-w-0 flex-1 overflow-hidden">
      <PickerPage v-if="currentPage === 'picker'" />
      <LibraryPage v-else-if="currentPage === 'library'" />
      <ScanPage v-else-if="currentPage === 'scan'" />
      <SettingsPage v-else />
    </main>
  </div>
</template>
