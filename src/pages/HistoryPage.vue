<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RefreshCcw } from "lucide-vue-next";
import PlatformIcon from "@/components/PlatformIcon.vue";
import { getPostHistory } from "@/repositories/postRecordRepository";
import { useTargetStore } from "@/stores/targetStore";
import type { PostHistoryEntry } from "@/types/postRecord";

const targetStore = useTargetStore();
const entries     = ref<PostHistoryEntry[]>([]);
const loading     = ref(false);
const error       = ref("");
const filterType  = ref<string>("all");

// Collect distinct target types from history + configured targets.
const availableTypes = computed(() => {
  const types = new Set(entries.value.map((e) => e.targetType));
  return ["all", ...Array.from(types).sort()];
});

const filtered = computed(() =>
  filterType.value === "all"
    ? entries.value
    : entries.value.filter((e) => e.targetType === filterType.value),
);

// Group by date (YYYY-MM-DD) so we get day headers.
const grouped = computed(() => {
  const map = new Map<string, PostHistoryEntry[]>();
  for (const e of filtered.value) {
    const day = e.postedAt ? e.postedAt.slice(0, 10) : "Unknown date";
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return Array.from(map.entries());
});

function formatDay(isoDay: string): string {
  if (isoDay === "Unknown date") return isoDay;
  const d = new Date(isoDay + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function labelForType(type: string): string {
  if (type === "all") return "All Networks";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    entries.value = await getPostHistory();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
      <div>
        <h1 class="text-lg font-semibold text-white">Post History</h1>
        <p class="text-xs text-slate-500">{{ entries.length }} posts recorded</p>
      </div>
      <button class="button h-8 w-8 p-0" :class="loading ? 'animate-spin' : ''" title="Reload" @click="load">
        <RefreshCcw class="h-4 w-4" />
      </button>
    </div>

    <!-- Network filter -->
    <div class="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-6 py-3">
      <button
        v-for="type in availableTypes"
        :key="type"
        class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition"
        :class="filterType === type
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
        @click="filterType = type"
      >
        <PlatformIcon v-if="type !== 'all'" :type="type" :size="12" />
        {{ labelForType(type) }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="mx-6 mt-4 rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">{{ error }}</div>

    <!-- Empty state -->
    <div v-else-if="!loading && filtered.length === 0" class="flex flex-1 items-center justify-center text-sm text-slate-500">
      No posts found for this filter.
    </div>

    <!-- Grouped list -->
    <div v-else class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
      <section v-for="[day, dayEntries] in grouped" :key="day">
        <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{{ formatDay(day) }}</h2>
        <div class="space-y-1">
          <div
            v-for="entry in dayEntries"
            :key="entry.id"
            class="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2"
          >
            <!-- Thumbnail -->
            <div class="h-10 w-10 shrink-0 overflow-hidden rounded bg-panelSoft">
              <img v-if="entry.thumbnailUrl" :src="entry.thumbnailUrl" :alt="entry.filename" class="h-full w-full object-cover" loading="lazy" />
            </div>
            <!-- Filename -->
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-white">{{ entry.filename }}</p>
              <p class="text-[10px] text-slate-500">{{ formatTime(entry.postedAt) }}</p>
            </div>
            <!-- Network badge -->
            <div class="flex items-center gap-1.5 rounded-md border border-line bg-panelSoft px-2 py-1 text-[11px] text-slate-300">
              <PlatformIcon :type="entry.targetType" :size="12" />
              {{ entry.targetName }}
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
