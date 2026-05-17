<script setup lang="ts">
import { ExternalLink, Github, Heart, PackageCheck } from "lucide-vue-next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { changelogEntries } from "@/data/changelog";

const version = __APP_VERSION__;
const authorImage = new URL("../../autor.png", import.meta.url).href;
const appIcon = new URL("../../crossposthelpericon.png", import.meta.url).href;
const appBanner = new URL("../../crossposthelperbanner.png", import.meta.url).href;

const changelog = changelogEntries;
</script>

<template>
  <div class="h-full overflow-y-auto bg-ink p-6 text-slate-100">
    <div class="mx-auto max-w-4xl space-y-8 pb-12">
      <section class="surface overflow-hidden rounded-lg">
        <img :src="appBanner" alt="Crosspost Helper banner" class="h-52 w-full object-cover" />
        <div class="p-6">
          <div class="flex flex-col items-center text-center">
            <img :src="authorImage" alt="Valerie" class="h-36 w-36 rounded-full border-4 border-accent object-cover shadow-glow" />
            <h1 class="mt-6 text-3xl font-semibold text-white">Valerie</h1>
            <p class="mt-2 flex items-center gap-2 text-sm text-slate-400">
              <Heart class="h-4 w-4 text-rose" />
              built for focused AI image posting workflows
            </p>
            <p class="mt-6 max-w-2xl text-base leading-8 text-slate-300">
              Crosspost Helper keeps your AI image library organized locally, helps you choose what to post next,
              and makes sure each image is only posted to the networks you actually intended. It is built for
              manual posting, careful review, and quiet duplicate protection without accounts or cloud sync.
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-[220px_1fr]">
        <article class="surface rounded-lg p-5">
          <img :src="appIcon" alt="Crosspost Helper icon" class="mx-auto h-28 w-28 rounded-2xl object-cover" />
          <h2 class="mt-4 text-center text-lg font-semibold text-white">Crosspost Helper</h2>
          <p class="mt-1 text-center text-sm text-slate-400">v{{ version }}</p>
        </article>

        <article class="surface rounded-lg p-5">
          <h2 class="flex items-center gap-2 text-lg font-semibold text-white">
            <PackageCheck class="h-5 w-5 text-accent" />
            Release Notes
          </h2>
          <p class="mt-3 text-sm leading-6 text-slate-400">
            Releases are prepared from Git history, documented in the changelog, built for desktop platforms,
            and published through itch.io with a Discord announcement. Credentials stay in a local `.env` file.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button class="button" @click="openUrl('https://github.com/valerie-4659/crosspost-helper')">
              <Github class="h-4 w-4" />
              GitHub
            </button>
            <button class="button" @click="openUrl('https://valerie-4659.itch.io/crossposthelper')">
              <ExternalLink class="h-4 w-4" />
              itch.io
            </button>
          </div>
        </article>
      </section>

      <section>
        <h2 class="mb-4 text-center text-xl font-semibold text-white">Changelog</h2>
        <div class="space-y-5">
          <article v-for="entry in changelog" :key="entry.version" class="surface rounded-lg p-5">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-accent">v{{ entry.version }}</h3>
              <span class="text-sm text-slate-500">{{ entry.date }}</span>
            </div>
            <ul class="mt-4 space-y-2 text-sm leading-6 text-slate-300">
              <li v-for="item in entry.items" :key="item" class="flex gap-3">
                <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
                <span>{{ item }}</span>
              </li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
