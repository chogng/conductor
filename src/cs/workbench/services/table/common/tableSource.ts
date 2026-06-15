/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TableSource } from "src/cs/workbench/services/table/common/tableContracts";

export const toTableSourceKey = (source: TableSource): string => {
	const fileId = encodeURIComponent(source.fileId);
	const sheetId = typeof source.sheetId === "string" && source.sheetId
		? encodeURIComponent(source.sheetId)
		: "";
	return sheetId ? `${fileId}::${sheetId}` : fileId;
};
