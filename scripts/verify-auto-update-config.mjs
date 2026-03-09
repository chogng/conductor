import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`[auto-update] ${message}`);
  process.exitCode = 1;
}

function isPlaceholder(value) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  return /^YOUR_/i.test(text) || /placeholder/i.test(text);
}

const projectRoot = process.cwd();
const packageJsonPath = path.join(projectRoot, "package.json");

if (!fs.existsSync(packageJsonPath)) {
  fail(`package.json not found at: ${packageJsonPath}`);
  process.exit();
}

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
} catch (error) {
  fail(`Failed to parse package.json: ${error?.message || error}`);
  process.exit();
}

const build = pkg?.build && typeof pkg.build === "object" ? pkg.build : null;
const publishRaw = build?.publish;

if (!Array.isArray(publishRaw) || publishRaw.length === 0) {
  fail("build.publish is empty. Configure updater publish provider before dist:desktop:publish.");
  process.exit();
}

const first = publishRaw[0] && typeof publishRaw[0] === "object" ? publishRaw[0] : null;
if (!first) {
  fail("build.publish[0] is invalid.");
  process.exit();
}

const provider = String(first.provider ?? "").trim().toLowerCase();

if (provider === "github") {
  const owner = String(first.owner ?? "").trim();
  const repo = String(first.repo ?? "").trim();
  if (isPlaceholder(owner) || isPlaceholder(repo)) {
    fail(
      "GitHub publish config still uses placeholders. Set build.publish[0].owner/repo before dist:desktop:publish.",
    );
    process.exit();
  }
  console.log(`[auto-update] Publish target: github ${owner}/${repo}`);
  process.exit();
}

if (provider === "generic") {
  const url = String(first.url ?? "").trim();
  if (!url) {
    fail("Generic publish provider requires non-empty build.publish[0].url.");
    process.exit();
  }
  console.log(`[auto-update] Publish target: generic ${url}`);
  process.exit();
}

fail(`Unsupported build.publish provider '${provider || "unknown"}'.`);
