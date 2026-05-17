<script setup lang="ts">
import { Images, Search, Settings, Shuffle } from "lucide-vue-next";

export type AppPage = "picker" | "library" | "scan" | "settings";

const page = defineModel<AppPage>("page", { required: true });

const items = [
  { id: "picker", label: "Picker", icon: Shuffle },
  { id: "library", label: "Library", icon: Images },
  { id: "scan", label: "Scan", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
] as const;
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col border-r border-line bg-[#0e1117] p-5">
    <div class="mb-8">
      <div class="text-lg font-semibold text-white">Crosspost Helper</div>
      <div class="mt-1 text-xs text-slate-500">Local-first image picker</div>
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

    <div class="mt-auto rounded-md border border-line bg-panel p-3 text-xs leading-5 text-slate-400">
      Images stay local. Posting is tracked per target so X, Bluesky, Civitai, and custom destinations remain independent.
    </div>
  </aside>
</template>
