#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { loadEnv } = require("./env.cjs");

const root = path.resolve(__dirname, "..");
loadEnv(root);

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) {
  console.log("DISCORD_WEBHOOK_URL is not set. Skipping Discord notification.");
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = (process.env.RELEASE_VERSION || `v${packageJson.version}`).replace(/^v/, "");
const itchUrl = "https://valerie-4659.itch.io/crossposthelper";

// Up to 3 user-facing bullets passed as JSON array from release.cjs
const rawBullets = process.env.RELEASE_BULLETS || "[]";
const bullets = JSON.parse(rawBullets).slice(0, 3);
const bulletLines = bullets.length
  ? bullets.map((b) => `• ${b}`).join("\n")
  : null;

const description = [
  `**v${version}**`,
  "",
  bulletLines,
  "",
  `[:inbox_tray: Download on itch.io](${itchUrl})`,
  "",
  `v${version} · Windows · macOS · Linux`,
]
  .filter((line) => line !== null)
  .join("\n");

fetch(webhook, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    embeds: [
      {
        title: "Crosspost Helper Update",
        description,
        color: 7395071,
      },
    ],
  }),
})
  .then((response) => {
    if (!response.ok) throw new Error(`Discord webhook failed with ${response.status}`);
    console.log("Discord notification sent.");
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
