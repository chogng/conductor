import fs from "node:fs";
import path from "node:path";

import {
  SETTINGS_FILENAME,
  STORE_CONFIG_FILENAME,
  TEMPLATE_FILENAME,
} from "../common/conductorStoreSchema.js";

export type LegacyConductorStoreFile = {
  readonly fileName: string;
  readonly label: string;
};

export const LEGACY_CONDUCTOR_STORE_FILES: readonly LegacyConductorStoreFile[] = Object.freeze([
  { fileName: SETTINGS_FILENAME, label: "settings" },
  { fileName: TEMPLATE_FILENAME, label: "template" },
  { fileName: STORE_CONFIG_FILENAME, label: "store path" },
]);

export function deleteLegacyConductorStoreFiles(
  legacyHomeDir: string,
  files: readonly LegacyConductorStoreFile[] = LEGACY_CONDUCTOR_STORE_FILES,
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
