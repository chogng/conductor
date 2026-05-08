import fs from "node:fs";
import path from "node:path";

export function ensureDirectoryForFile(filePath: string): void {
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
}

export function jsonFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readJsonFile<T = unknown>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirectoryForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function removeJsonFileIfExists(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  try {
    fs.unlinkSync(filePath);
  } catch {
    // Leave the file in place if cleanup fails.
  }
}

export function migrateStorageFile(
  previousPath: string,
  currentPath: string,
  label: string,
): void {
  if (currentPath === previousPath) return;
  if (!fs.existsSync(previousPath) || fs.existsSync(currentPath)) return;

  ensureDirectoryForFile(currentPath);

  try {
    fs.renameSync(previousPath, currentPath);
  } catch (error) {
    fs.copyFileSync(previousPath, currentPath);
    fs.unlinkSync(previousPath);
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "EXDEV") {
      console.warn(
        `[${label}] rename failed (${code || "unknown"}), migrated by copy+delete.`,
      );
    }
  }
}
