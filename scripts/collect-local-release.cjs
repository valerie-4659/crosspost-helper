#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = process.argv[2] || `v${packageJson.version}`;
const outputRoot = path.join(root, "dist", "release", tag);

const rules = [
  { platform: "macos", test: (name) => /\.(dmg|zip)$/i.test(name) && !name.includes("blockmap") },
  // Only the NSIS setup installer — not the unpacked app exe or helper binaries.
  { platform: "windows", test: (name) => /setup.*\.exe$/i.test(name) && !name.includes("blockmap") },
  { platform: "linux", test: (name) => /\.(AppImage|deb|rpm)$/i.test(name) },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (current.includes(`${path.sep}release${path.sep}`)) continue;
      walk(current, files);
    } else {
      files.push(current);
    }
  }
  return files;
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const files = walk(path.join(root, "dist-electron"));
const copied = new Map(rules.map((rule) => [rule.platform, 0]));

for (const file of files) {
  const name = path.basename(file);
  const rule = rules.find((candidate) => candidate.test(name));
  if (!rule) continue;
  const targetDir = path.join(outputRoot, rule.platform);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(file, path.join(targetDir, name));
  copied.set(rule.platform, copied.get(rule.platform) + 1);
}

for (const [platform, count] of copied.entries()) {
  if (count === 0) {
    throw new Error(`No ${platform} artifacts found in dist/.`);
  }
}

console.log(`Collected release artifacts in ${outputRoot}`);
