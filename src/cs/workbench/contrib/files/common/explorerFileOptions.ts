/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	FileId,
	FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type ExplorerFileOption = {
	readonly fileId: string;
	readonly fileName: string;
};

export function createExplorerFileOptionsFromRecords(
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): ExplorerFileOption[] {
	const seen = new Set<FileId>();
	const options: ExplorerFileOption[] = [];
	const pushFile = (fileId: FileId): void => {
		if (seen.has(fileId)) {
			return;
		}
		seen.add(fileId);

		const file = filesById[fileId];
		if (!file || !hasAnalysisData(file)) {
			return;
		}

		options.push({
			fileId,
			fileName: String(file.raw.fileName ?? fileId),
		});
	};

	for (const fileId of fileOrder) {
		pushFile(fileId);
	}
	for (const fileId of Object.keys(filesById)) {
		pushFile(fileId);
	}

	return options;
}

function hasAnalysisData(file: FileRecord): boolean {
	return file.seriesOrder.length > 0 ||
		Object.values(file.curvesByKey).some(curve => curve.curveGeneration === "base");
}
