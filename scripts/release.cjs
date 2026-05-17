#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { execFileSync } = require("node:child_process");
const { loadEnv } = require("./env.cjs");

const root = path.resolve(__dirname, "..");
loadEnv(root);

const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
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

function bumpVersion(version, bump) {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Unsupported semver version: ${version}`);
  }
  if (bump === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
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
  const result = run("git", ["log", "--pretty=format:%s", range], { capture: true }).trim();
  return result ? result.split("\n").filter(Boolean) : [];
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
  fs.writeFileSync(
    inAppChangelogPath,
    source.replace("export const changelogEntries: ChangelogEntry[] = [\n", `export const changelogEntries: ChangelogEntry[] = [\n${entry}`),
  );
}

function assertButlerAvailable() {
  run("butler", ["-V"]);
}

async function main() {
  const bump = process.argv[2] || "patch";
  if (!["patch", "minor"].includes(bump)) {
    throw new Error("Use: npm run release -- patch  or  npm run release -- minor");
  }

  assertButlerAvailable();

  const packageJson = readJson(packagePath);
  const oldVersion = packageJson.version;
  const version = bumpVersion(oldVersion, bump);
  const tag = `v${version}`;
  const date = todayIso();

  console.log(`\nBumping version (${bump}): ${oldVersion} -> ${version}`);

  const previousTag = latestTag();
  const defaultBullets = commitsSince(previousTag);
  const rl = readline.createInterface({ input, output });

  console.log("\nRelease bullets. Enter custom bullets or press Enter to use commit subjects:");
  defaultBullets.forEach((bullet) => console.log(`- ${bullet}`));
  const enteredBullets = [];
  while (true) {
    const line = (await rl.question("Bullet: ")).trim();
    if (!line) break;
    enteredBullets.push(line.replace(/^- /, ""));
  }
  const bullets = enteredBullets.length ? enteredBullets : defaultBullets.length ? defaultBullets : [`Release ${tag}`];

  packageJson.version = version;
  writeJson(packagePath, packageJson);

  const lockJson = readJson(lockPath);
  lockJson.version = version;
  if (lockJson.packages?.[""]) lockJson.packages[""].version = version;
  writeJson(lockPath, lockJson);

  updateChangelog(version, date, bullets);
  updateInAppChangelog(version, date, bullets);

  console.log("\nBuilding local macOS, Linux, and Windows artifacts with electron-builder...");
  run("npm", ["run", "electron:build"]);

  console.log("\nCollecting artifacts...");
  run("node", ["scripts/collect-local-release.cjs", tag]);

  const publishAnswer = (await rl.question("Publish to itch.io with local butler now? [Y/n]: ")).trim().toLowerCase();
  if (publishAnswer !== "n" && publishAnswer !== "no") {
    run("node", ["scripts/publish-itch-local.cjs", tag]);
  }

  const discordAnswer = (await rl.question("Send Discord notification now? [Y/n]: ")).trim().toLowerCase();
  if (discordAnswer !== "n" && discordAnswer !== "no") {
    run("node", ["scripts/notify-discord.cjs"], { env: { RELEASE_VERSION: tag } });
  }
  rl.close();

  run("git", ["add", "package.json", "package-lock.json", "CHANGELOG.md", "src/data/changelog.ts"]);
  run("git", ["commit", "-m", `chore: release ${tag}`]);
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);

  console.log(`\nRelease ${tag} complete.`);
  console.log(`Artifacts: dist/release/${tag}`);
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error.message}`);
  process.exit(1);
});
