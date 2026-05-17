#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { loadEnv } = require("./env.cjs");

const root = path.resolve(__dirname, "..");
loadEnv(root);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = process.argv[2] || `v${packageJson.version}`;
const version = tag.replace(/^v/, "");
const releaseDir = path.join(root, "dist", "release", tag);
const itchUsername = process.env.ITCH_USERNAME || "valerie-4659";
const itchGameSlug = process.env.ITCH_GAME_SLUG || "crossposthelper";
const itchTarget = `${itchUsername}/${itchGameSlug}`;

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function assertFiles(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Missing ${dir}. Run npm run release first.`);
  if (fs.readdirSync(dir).length === 0) throw new Error(`No artifacts in ${dir}.`);
}

run("butler", ["-V"]);

for (const platform of ["macos", "windows", "linux"]) {
  const dir = path.join(releaseDir, platform);
  assertFiles(dir);
  run("butler", ["push", dir, `${itchTarget}:${platform}`, "--userversion", version]);
}

console.log(`Published ${tag} to itch.io target ${itchTarget}.`);
