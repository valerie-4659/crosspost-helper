<script setup lang="ts">
import { ref } from "vue";
import { Chrome, Download, ExternalLink, FolderOpen, Puzzle } from "lucide-vue-next";

const platforms = [
  { icon: "𝕏", name: "Twitter / X", url: "twitter.com · x.com" },
  { icon: "🦋", name: "Bluesky", url: "bsky.app" },
  { icon: "🎨", name: "DeviantArt", url: "deviantart.com" },
  { icon: "⚙️", name: "CivitAI", url: "civitai.com · civitai.red" },
];

const ffStatus = ref<"idle" | "saving" | "done" | "error">("idle");
const ffError = ref("");

async function openChrome() {
  await window.desktop.extension.openChrome();
}

async function downloadFirefox() {
  ffStatus.value = "saving";
  ffError.value = "";
  const result = await window.desktop.extension.downloadFirefox();
  if (result.ok) {
    ffStatus.value = "done";
    setTimeout(() => (ffStatus.value = "idle"), 3000);
  } else {
    ffStatus.value = "error";
    ffError.value = result.error ?? "Unknown error";
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-ink p-6 text-slate-100">
    <div class="mx-auto max-w-3xl space-y-8 pb-12">

      <!-- Header -->
      <section>
        <div class="flex items-center gap-3">
          <Puzzle class="h-7 w-7 text-accent" />
          <h1 class="text-2xl font-semibold text-white">Browser Extension</h1>
        </div>
        <p class="mt-3 text-sm leading-6 text-slate-400">
          The Crosspost Helper browser extension lets you inject images directly into X, Bluesky,
          DeviantArt, and CivitAI — no API keys, no rate limits. The extension talks to this app
          over a local HTTP bridge on <code class="rounded bg-panel px-1 py-0.5 font-mono text-xs text-accent">localhost:27842</code>.
        </p>
      </section>

      <!-- Chrome -->
      <section class="surface rounded-lg p-6">
        <div class="flex items-center gap-3">
          <Chrome class="h-5 w-5 text-accent" />
          <h2 class="text-lg font-semibold text-white">Chrome / Chromium</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-slate-400">
          Chrome extensions are loaded directly from the source folder — no packaging needed.
          Click the button below to open the extension folder in Finder / Explorer, then follow
          the steps.
        </p>
        <ol class="mt-4 space-y-2 text-sm leading-6 text-slate-300">
          <li class="flex gap-3">
            <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">1</span>
            Open <strong class="text-white">chrome://extensions</strong> in Chrome
          </li>
          <li class="flex gap-3">
            <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">2</span>
            Enable <strong class="text-white">Developer mode</strong> (toggle top-right)
          </li>
          <li class="flex gap-3">
            <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">3</span>
            Click <strong class="text-white">Load unpacked</strong> and select the opened folder
          </li>
        </ol>
        <div class="mt-5">
          <button class="button-primary" @click="openChrome">
            <FolderOpen class="h-4 w-4" />
            Open Extension Folder
          </button>
        </div>
      </section>

      <!-- Firefox -->
      <section class="surface rounded-lg p-6">
        <div class="flex items-center gap-3">
          <ExternalLink class="h-5 w-5 text-mint" />
          <h2 class="text-lg font-semibold text-white">Firefox</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-slate-400">
          Firefox requires a <code class="rounded bg-panel px-1 py-0.5 font-mono text-xs text-mint">.zip</code> (or
          <code class="rounded bg-panel px-1 py-0.5 font-mono text-xs text-mint">.xpi</code>) archive for temporary
          installation. The download uses the Firefox-specific manifest automatically.
        </p>
        <ol class="mt-4 space-y-2 text-sm leading-6 text-slate-300">
          <li class="flex gap-3">
            <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-xs font-bold text-mint">1</span>
            Download the <strong class="text-white">.zip</strong> using the button below
          </li>
          <li class="flex gap-3">
            <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-xs font-bold text-mint">2</span>
            Open <strong class="text-white">about:debugging</strong> in Firefox
          </li>
          <li class="flex gap-3">
            <span class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-xs font-bold text-mint">3</span>
            Click <strong class="text-white">This Firefox → Load Temporary Add-on…</strong> and select the zip
          </li>
        </ol>
        <div class="mt-5 flex items-center gap-3">
          <button
            class="button-primary"
            :disabled="ffStatus === 'saving'"
            @click="downloadFirefox"
          >
            <Download class="h-4 w-4" />
            {{ ffStatus === "saving" ? "Saving…" : ffStatus === "done" ? "✓ Saved!" : "Download Firefox Extension" }}
          </button>
          <span v-if="ffStatus === 'error'" class="text-sm text-red-400">{{ ffError }}</span>
        </div>
      </section>

      <!-- Supported platforms -->
      <section class="surface rounded-lg p-6">
        <h2 class="text-base font-semibold text-white">Supported Platforms</h2>
        <ul class="mt-4 grid gap-3 sm:grid-cols-2">
          <li v-for="p in platforms" :key="p.name" class="flex items-center gap-3 rounded-md bg-panel px-4 py-3">
            <span class="text-xl">{{ p.icon }}</span>
            <div>
              <div class="text-sm font-semibold text-white">{{ p.name }}</div>
              <div class="text-xs text-slate-500">{{ p.url }}</div>
            </div>
          </li>
        </ul>
      </section>

    </div>
  </div>
</template>

