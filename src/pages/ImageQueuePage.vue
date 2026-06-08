<script setup lang="ts">
import ImageQueuePanel from "@/components/ImageQueuePanel.vue";
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Page header -->
    <header class="shrink-0 border-b border-line bg-panel px-6 py-4">
      <h1 class="text-2xl font-semibold text-white">Image Queue</h1>
      <p class="mt-1 text-sm text-slate-400">
        Wavespeed image recreation jobs — status updates automatically every 12 seconds.
      </p>
    </header>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto px-6 py-5 max-w-2xl">
      <ImageQueuePanel />
    </div>
  </div>
</template>
