import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const legacyFileNames = Object.freeze([
  "config.json",
  "template.json",
  "store-path.json",
]);

const resolveLegacyHomeDir = () => {
  const override = String(process.env.CONDUCTOR_LEGACY_HOME_DIR ?? "").trim();
  if (override) {
    return path.resolve(override);
  }

  return path.join(os.homedir(), ".device");
};

const legacyHomeDir = resolveLegacyHomeDir();
const deleted = [];

for (const fileName of legacyFileNames) {
  const filePath = path.join(legacyHomeDir, fileName);
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    console.warn(`[legacy-user-storage] skipped non-file: ${filePath}`);
    continue;
  }

  fs.unlinkSync(filePath);
  deleted.push(filePath);
}

if (deleted.length) {
  console.log("[legacy-user-storage] deleted legacy files:");
  for (const filePath of deleted) {
    console.log(`- ${filePath}`);
  }
} else {
  console.log(`[legacy-user-storage] no legacy files found in ${legacyHomeDir}`);
}
