#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ||= value;
  }
}

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) {
  console.log("DISCORD_WEBHOOK_URL is not set. Skipping Discord notification.");
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.RELEASE_VERSION || packageJson.version;
const repoUrl = "https://github.com/valerie-4659/crosspost-helper";
const itchUrl = "https://valerie-4659.itch.io/crossposthelper";

fetch(webhook, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    embeds: [
      {
        title: `Crosspost Helper v${version}`,
        description: `Unsigned desktop builds for macOS, Windows, and Linux are available.\n\nGitHub: ${repoUrl}/releases/tag/v${version}\nitch.io: ${itchUrl}`,
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
