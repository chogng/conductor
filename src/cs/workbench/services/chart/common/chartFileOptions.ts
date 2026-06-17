/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	FileId,
	FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type ChartFileOption = {
	readonly fileId: string;
	readonly fileName: string;
};

export type ChartFileOptionsInput = {
	readonly activeFileId?: string | null;
	readonly chartFileOptions?: readonly ChartFileOption[];
};

export function resolveChartFileOptions({
	chartFileOptions,
}: ChartFileOptionsInput): ChartFileOption[] {
	if (chartFileOptions?.length) {
		return [...chartFileOptions];
	}

	return [];
}

export function resolveActiveChartFileOption(
	input: ChartFileOptionsInput,
): ChartFileOption | null {
	const options = resolveChartFileOptions(input);
	const normalizedActiveFileId = String(input.activeFileId ?? "").trim();
	return (
		options.find(option => option.fileId === normalizedActiveFileId) ??
		options[0] ??
		null
	);
}

export function createChartFileOptionsFromRecords(
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): ChartFileOption[] {
	const seen = new Set<FileId>();
	const options: ChartFileOption[] = [];
	const pushFile = (fileId: FileId): void => {
		if (seen.has(fileId)) {
			return;
		}
		seen.add(fileId);

		const file = filesById[fileId];
		if (!file || !hasChartData(file)) {
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

function hasChartData(file: FileRecord): boolean {
	return Object.values(file.curvesByKey).some(curve => curve.curveGeneration === "base");
}
