#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const releaseDir = path.join(root, "dist", "release");

fs.mkdirSync(releaseDir, { recursive: true });

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

if (process.platform === "darwin") {
  const appPath = path.join(root, "src-tauri", "target", "release", "bundle", "macos", "Crosspost Helper.app");
  if (!fs.existsSync(appPath)) {
    throw new Error("macOS .app bundle not found. Run npm run tauri:build:app first.");
  }
  const zipPath = path.join(releaseDir, `Crosspost-Helper-${version}-macos-unsigned.zip`);
  run("ditto", ["-c", "-k", "--keepParent", appPath, zipPath]);
  console.log(`Created ${zipPath}`);
} else {
  console.log("Local packaging currently only zips the macOS .app bundle. Cross-platform artifacts are built in GitHub Actions.");
}
