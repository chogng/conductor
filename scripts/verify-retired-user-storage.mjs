import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const retiredFileNames = Object.freeze([
  "config.json",
  "template.json",
  "store-path.json",
]);

const resolveRetiredHomeDir = () => {
  const override = String(process.env.CONDUCTOR_RETIRED_HOME_DIR ?? "").trim();
  if (override) {
    return path.resolve(override);
  }

  return path.join(os.homedir(), ".device");
};

const retiredHomeDir = resolveRetiredHomeDir();
const deleted = [];

for (const fileName of retiredFileNames) {
  const filePath = path.join(retiredHomeDir, fileName);
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    console.warn(`[retired-user-storage] skipped non-file: ${filePath}`);
    continue;
  }

  fs.unlinkSync(filePath);
  deleted.push(filePath);
}

if (deleted.length) {
  console.log("[retired-user-storage] deleted retired files:");
  for (const filePath of deleted) {
    console.log(`- ${filePath}`);
  }
} else {
  console.log(`[retired-user-storage] no retired files found in ${retiredHomeDir}`);
}
