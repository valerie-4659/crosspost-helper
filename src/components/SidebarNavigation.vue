<script setup lang="ts">
import { Clapperboard, Clock, Images, ListChecks, Moon, Puzzle, Search, Settings, Shuffle, Sun } from "lucide-vue-next";
import { useSettingsStore } from "@/stores/settingsStore";

export type AppPage = "picker" | "library" | "queue" | "video-queue" | "scan" | "history" | "settings" | "extension" | "about";

const page = defineModel<AppPage>("page", { required: true });
const settingsStore = useSettingsStore();
const version = __APP_VERSION__;

const items = [
  { id: "picker",      label: "Picker",           icon: Shuffle },
  { id: "library",     label: "Library",           icon: Images },
  { id: "queue",       label: "Job Queue",         icon: ListChecks },
  { id: "video-queue", label: "Video Queue",       icon: Clapperboard },
  { id: "history",     label: "History",           icon: Clock },
  { id: "scan",        label: "Scan",              icon: Search },
  { id: "settings",    label: "Settings",          icon: Settings },
  { id: "extension",   label: "Browser Extension", icon: Puzzle },
] as const;
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col border-r border-line bg-[#0e1117] p-5">
    <div class="mb-8">
      <div class="text-lg font-semibold text-white">Crosspost Helper</div>
    </div>

    <nav class="space-y-1">
      <button
        v-for="item in items"
        :key="item.id"
        class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition"
        :class="page === item.id ? 'bg-panelSoft text-accent' : 'text-slate-300 hover:bg-panel hover:text-white'"
        @click="page = item.id"
      >
        <component :is="item.icon" class="h-4 w-4" />
        {{ item.label }}
      </button>
    </nav>
    <div class="mt-auto flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2">
      <button class="text-left text-xs font-medium text-accent hover:text-mint" @click="page = 'about'">
        v{{ version }}
      </button>
      <div class="flex gap-1">
        <button
          class="button h-7 w-7 p-0"
          :class="settingsStore.themeMode === 'light' ? 'border-accent text-accent' : ''"
          :title="'Light mode'"
          @click="settingsStore.setThemeMode('light')"
        >
          <Sun class="h-3.5 w-3.5" />
        </button>
        <button
          class="button h-7 w-7 p-0"
          :class="settingsStore.themeMode === 'dark' ? 'border-accent text-accent' : ''"
          :title="'Dark mode'"
          @click="settingsStore.setThemeMode('dark')"
        >
          <Moon class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </aside>
</template>
