/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import {
	TABLE_KNOWN_FILE_EXTENSIONS,
	getTableFormatByExtension,
	type TableFormatId,
	type TableKnownFileExtension,
} from "src/cs/workbench/services/table/common/tableFormatRegistry";

export const getTableFormatIdByResource = (
	resource: URI | string | null | undefined,
): TableFormatId | null => {
	const extension = getTableFileExtension(getResourcePathOrName(resource));
	return extension ? getTableFormatByExtension(extension) : null;
};

export const getTableFileExtension = (
	value: unknown,
): TableKnownFileExtension | null => {
	const normalized = getBaseName(String(value ?? "").trim()).toLowerCase();
	if (!normalized) {
		return null;
	}

	for (const extension of TABLE_KNOWN_FILE_EXTENSIONS) {
		if (
			normalized.length > extension.length &&
			normalized.endsWith(extension)
		) {
			return extension;
		}
	}

	return null;
};

const getResourcePathOrName = (
	resource: URI | string | null | undefined,
): string => {
	if (typeof resource === "string") {
		return resource;
	}

	return typeof resource?.path === "string" ? resource.path : "";
};

const getBaseName = (value: string): string => {
	const normalized = value.replace(/\\/g, "/");
	const slashIndex = normalized.lastIndexOf("/");
	return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
};
