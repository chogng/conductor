/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

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
