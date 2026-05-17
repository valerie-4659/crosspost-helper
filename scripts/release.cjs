#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const changelogPath = path.join(root, "CHANGELOG.md");
const inAppChangelogPath = path.join(root, "src", "data", "changelog.ts");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpPatch(version) {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Unsupported semver version: ${version}`);
  }
  parts[2] += 1;
  return parts.join(".");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function latestTag() {
  try {
    return run("git", ["describe", "--tags", "--abbrev=0"], { capture: true }).trim();
  } catch {
    return "";
  }
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const output = run("git", ["log", "--pretty=format:%s", range], { capture: true }).trim();
  return output ? output.split("\n").filter(Boolean) : [];
}

function assertCleanWorktree() {
  const status = run("git", ["status", "--short"], { capture: true }).trim();
  if (status) {
    throw new Error("Release requires a clean git worktree. Commit or stash changes first.");
  }
}

function updateChangelog(version, date, bullets) {
  const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf8").trimEnd() : "# Changelog";
  const entry = [`## v${version} - ${date}`, "", ...bullets.map((bullet) => `- ${bullet}`), ""].join("\n");
  const next = existing.startsWith("# Changelog")
    ? existing.replace("# Changelog", `# Changelog\n\n${entry}`)
    : `# Changelog\n\n${entry}\n${existing}`;
  fs.writeFileSync(changelogPath, `${next.trimEnd()}\n`);
}

function escapeForTs(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function updateInAppChangelog(version, date, bullets) {
  const source = fs.readFileSync(inAppChangelogPath, "utf8");
  const entry = `  {\n    version: "${escapeForTs(version)}",\n    date: "${escapeForTs(date)}",\n    items: [\n${bullets.map((bullet) => `      "${escapeForTs(bullet)}",`).join("\n")}\n    ],\n  },\n`;
  const next = source.replace("export const changelogEntries: ChangelogEntry[] = [\n", `export const changelogEntries: ChangelogEntry[] = [\n${entry}`);
  fs.writeFileSync(inAppChangelogPath, next);
}

async function main() {
  assertCleanWorktree();

  const rl = readline.createInterface({ input, output });
  const packageJson = readJson(packagePath);
  const suggestedVersion = bumpPatch(packageJson.version);
  const versionAnswer = (await rl.question(`Version [${suggestedVersion}]: `)).trim();
  const version = versionAnswer || suggestedVersion;
  const tag = `v${version}`;
  const date = todayIso();

  const previousTag = latestTag();
  const commits = commitsSince(previousTag);
  const defaultBullets = commits.length ? commits : [`Release ${tag}`];

  console.log("\nRelease bullets. Edit in your terminal now; blank line finishes.");
  defaultBullets.forEach((bullet) => console.log(`- ${bullet}`));
  console.log("");

  const enteredBullets = [];
  while (true) {
    const line = (await rl.question("Bullet: ")).trim();
    if (!line) break;
    enteredBullets.push(line.replace(/^- /, ""));
  }

  const bullets = enteredBullets.length ? enteredBullets : defaultBullets;

  packageJson.version = version;
  writeJson(packagePath, packageJson);

  const lockJson = readJson(lockPath);
  lockJson.version = version;
  if (lockJson.packages?.[""]) {
    lockJson.packages[""].version = version;
  }
  writeJson(lockPath, lockJson);

  const tauriConfig = readJson(tauriConfigPath);
  tauriConfig.version = version;
  writeJson(tauriConfigPath, tauriConfig);

  updateChangelog(version, date, bullets);
  updateInAppChangelog(version, date, bullets);

  run("npm", ["run", "build"]);
  run("git", ["add", "package.json", "package-lock.json", "src-tauri/tauri.conf.json", "CHANGELOG.md", "src/data/changelog.ts"]);
  run("git", ["commit", "-m", `chore: release ${tag}`]);
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);

  console.log("\nRelease commit and tag created.");
  const pushAnswer = (await rl.question("Push origin main --tags now? [Y/n]: ")).trim().toLowerCase();
  rl.close();

  if (pushAnswer !== "n" && pushAnswer !== "no") {
    run("git", ["push", "origin", "main", "--tags"]);
    console.log("\nPushed. The tag starts the GitHub Actions desktop release build for macOS, Windows, and Linux.");
  } else {
    console.log("Push later with:");
    console.log("  git push origin main --tags");
  }
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error.message}`);
  process.exit(1);
});
