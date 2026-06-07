import fs from "node:fs";
import path from "node:path";

import {
  SETTINGS_FILENAME,
  STORE_CONFIG_FILENAME,
  TEMPLATE_FILENAME,
} from "../common/schema.js";

export type LegacyUserStorageFile = {
  readonly fileName: string;
  readonly label: string;
};

export const LEGACY_USER_STORAGE_FILES: readonly LegacyUserStorageFile[] = Object.freeze([
  { fileName: SETTINGS_FILENAME, label: "settings" },
  { fileName: TEMPLATE_FILENAME, label: "template" },
  { fileName: STORE_CONFIG_FILENAME, label: "store path" },
]);

export function deleteLegacyUserStorageFiles(
  legacyHomeDir: string,
  files: readonly LegacyUserStorageFile[] = LEGACY_USER_STORAGE_FILES,
): string[] {
  const legacyRoot = path.resolve(legacyHomeDir);
  const deletedFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(legacyRoot, file.fileName);
		if (!fs.existsSync(filePath)) {
			continue;
		}

		if (!fs.statSync(filePath).isFile()) {
			continue;
		}

		fs.unlinkSync(filePath);
		deletedFiles.push(filePath);
	}

  return deletedFiles;
}
