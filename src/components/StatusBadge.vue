<script setup lang="ts">
import type { PostRecordStatus } from "@/types/postRecord";

defineProps<{
  label: string;
  status?: PostRecordStatus;
}>();
</script>

<template>
  <span
    class="inline-flex items-center rounded-md border px-2 py-1 text-xs"
    :class="{
      'border-mint/50 bg-mint/10 text-mint': status === 'posted',
      'border-gold/50 bg-gold/10 text-gold': status === 'planned',
      'border-rose/50 bg-rose/10 text-rose': status === 'skipped',
      'border-line bg-panelSoft text-slate-400': !status,
    }"
  >
    {{ label }}{{ status ? `: ${status}` : "" }}
  </span>
</template>
