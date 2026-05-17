<script setup lang="ts">
import { onMounted, ref } from "vue";
import PickerPage from "@/pages/PickerPage.vue";
import LibraryPage from "@/pages/LibraryPage.vue";
import ScanPage from "@/pages/ScanPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import AboutPage from "@/pages/AboutPage.vue";
import SidebarNavigation, { type AppPage } from "@/components/SidebarNavigation.vue";
import { useTargetStore } from "@/stores/targetStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useImageStore } from "@/stores/imageStore";

const currentPage = ref<AppPage>("picker");
const targetStore = useTargetStore();
const sourceStore = useSourceStore();
const settingsStore = useSettingsStore();
const imageStore = useImageStore();

onMounted(async () => {
  settingsStore.applyTheme();
  await Promise.all([targetStore.load(), sourceStore.load()]);
  // Pre-load images and folder list so Library and Picker are populated immediately.
  await imageStore.load();
  await imageStore.loadFolders();
});
</script>

<template>
  <div class="flex h-screen bg-ink text-slate-100">
    <SidebarNavigation v-model:page="currentPage" />
    <main class="min-w-0 flex-1 overflow-hidden">
      <PickerPage v-if="currentPage === 'picker'" />
      <LibraryPage v-else-if="currentPage === 'library'" />
      <ScanPage v-else-if="currentPage === 'scan'" />
      <SettingsPage v-else-if="currentPage === 'settings'" />
      <AboutPage v-else />
    </main>
  </div>
</template>
