/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const TABLE_UI_CHUNK_SIZE_ROWS = 50;
export const TABLE_MAX_CACHED_UI_ROWS_PER_FILE = 5000;
export const TABLE_MAX_CACHED_FILES = 20;

type TableRowCache = Map<number, unknown[]>;
type TableLoadedChunks = Set<number>;

export type MissingTableRowChunkRange = {
	readonly rangeStart: number;
	readonly rangeEnd: number;
	readonly chunkStarts: readonly number[];
};

export type MergeTableChunkRangeResult = {
	readonly complete: boolean;
	readonly mergedChunkStarts: readonly number[];
};

const toSafeInt = (value: unknown, fallback = 0): number => {
	const n = Math.floor(Number(value));
	return Number.isFinite(n) ? n : fallback;
};

export const sanitizeTableRowBatch = (rows: unknown): unknown[][] => {
	if (!Array.isArray(rows)) return [];
	return rows.map(row => Array.isArray(row) ? row : []);
};

export const isTableRowBatchResultForRequest = ({
	requestFileId,
	requestStartRow,
	payloadFileId,
	payloadStartRow,
}: {
	readonly requestFileId: unknown;
	readonly requestStartRow: unknown;
	readonly payloadFileId: unknown;
	readonly payloadStartRow: unknown;
}): boolean => {
	const expectedFileId =
		typeof requestFileId === "string" ? requestFileId : String(requestFileId || "");
	const actualFileId =
		typeof payloadFileId === "string" ? payloadFileId : String(payloadFileId || "");
	const expectedStart = Math.max(0, toSafeInt(requestStartRow, 0));
	const actualStart = Math.max(0, toSafeInt(payloadStartRow, 0));
	return expectedFileId === actualFileId && expectedStart === actualStart;
};

export const hasChunkRowsInCache = (
	rowCache: ReadonlyMap<number, unknown[]> | null | undefined,
	chunkStart: unknown,
	chunkEnd: unknown,
): boolean => {
	if (!rowCache) return false;

	const start = Math.max(0, toSafeInt(chunkStart, 0));
	const end = Math.max(start, toSafeInt(chunkEnd, start));
	for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
		if (!rowCache.has(rowIndex)) return false;
	}
	return true;
};

export const clearChunkRows = (
	rowCache: TableRowCache | null | undefined,
	chunkStart: unknown,
	chunkEnd: unknown,
): void => {
	if (!rowCache) return;

	const start = Math.max(0, toSafeInt(chunkStart, 0));
	const end = Math.max(start, toSafeInt(chunkEnd, start));
	for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
		rowCache.delete(rowIndex);
	}
};

export const collectMissingChunkRanges = ({
	rowCache,
	pendingChunks,
	startRow,
	endRow,
	chunkSize,
	maxRangeRows,
}: {
	readonly rowCache: ReadonlyMap<number, unknown[]> | null | undefined;
	readonly pendingChunks?: ReadonlySet<number> | null;
	readonly startRow: unknown;
	readonly endRow: unknown;
	readonly chunkSize: unknown;
	readonly maxRangeRows?: unknown;
}): MissingTableRowChunkRange[] => {
	const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
	const start = Math.max(0, toSafeInt(startRow, 0));
	const end = Math.max(start, toSafeInt(endRow, start));
	const safeMaxRangeRows = Number.isFinite(Number(maxRangeRows))
		? Math.max(safeChunkSize, toSafeInt(maxRangeRows, safeChunkSize))
		: Number.POSITIVE_INFINITY;
	const pendingSet = pendingChunks ?? new Set<number>();

	const ranges: MissingTableRowChunkRange[] = [];
	let currentRange: {
		rangeStart: number;
		rangeEnd: number;
		chunkStarts: number[];
	} | null = null;

	const flushRange = (): void => {
		if (!currentRange || !currentRange.chunkStarts.length) return;
		ranges.push(currentRange);
		currentRange = null;
	};

	const firstChunkStart = Math.floor(start / safeChunkSize) * safeChunkSize;
	const lastChunkStart =
		end > start
			? Math.floor((end - 1) / safeChunkSize) * safeChunkSize
			: firstChunkStart;

	for (
		let chunkStart = firstChunkStart;
		chunkStart <= lastChunkStart;
		chunkStart += safeChunkSize
	) {
		const chunkEnd = Math.min(end, chunkStart + safeChunkSize);
		const isLoaded = hasChunkRowsInCache(rowCache, chunkStart, chunkEnd);
		const isPending = pendingSet.has(chunkStart);
		if (isLoaded || isPending) {
			flushRange();
			continue;
		}

		if (!currentRange) {
			currentRange = {
				rangeStart: chunkStart,
				rangeEnd: chunkEnd,
				chunkStarts: [chunkStart],
			};
			continue;
		}

		const nextRangeEnd = Math.max(currentRange.rangeEnd, chunkEnd);
		const nextRangeSize = Math.max(0, nextRangeEnd - currentRange.rangeStart);
		if (nextRangeSize > safeMaxRangeRows) {
			flushRange();
			currentRange = {
				rangeStart: chunkStart,
				rangeEnd: chunkEnd,
				chunkStarts: [chunkStart],
			};
			continue;
		}

		currentRange.rangeEnd = nextRangeEnd;
		currentRange.chunkStarts.push(chunkStart);
	}

	flushRange();
	return ranges;
};

export const mergeChunkRows = ({
	rowCache,
	loadedChunks,
	chunkStart,
	chunkEnd,
	rows,
	chunkSize,
	maxChunks,
}: {
	readonly rowCache: TableRowCache;
	readonly loadedChunks: TableLoadedChunks;
	readonly chunkStart: unknown;
	readonly chunkEnd: unknown;
	readonly rows: unknown;
	readonly chunkSize: unknown;
	readonly maxChunks: unknown;
}): boolean => {
	const start = Math.max(0, toSafeInt(chunkStart, 0));
	const end = Math.max(start, toSafeInt(chunkEnd, start));
	const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
	const safeMaxChunks = Math.max(1, toSafeInt(maxChunks, 1));
	const safeRows = sanitizeTableRowBatch(rows);
	const expectedRows = Math.max(0, end - start);

	if (safeRows.length !== expectedRows) {
		clearChunkRows(rowCache, start, end);
		loadedChunks.delete(start);
		return false;
	}

	for (let index = 0; index < safeRows.length; index += 1) {
		rowCache.set(start + index, safeRows[index]);
	}

	loadedChunks.delete(start);
	loadedChunks.add(start);

	while (loadedChunks.size > safeMaxChunks) {
		const evictChunkStart = Number(loadedChunks.values().next().value);
		if (!Number.isFinite(evictChunkStart)) break;
		loadedChunks.delete(evictChunkStart);
		clearChunkRows(rowCache, evictChunkStart, evictChunkStart + safeChunkSize);
	}

	return true;
};

export const mergeChunkRangeRows = ({
	rowCache,
	loadedChunks,
	rangeStart,
	rangeEnd,
	rows,
	chunkSize,
	maxChunks,
}: {
	readonly rowCache: TableRowCache;
	readonly loadedChunks: TableLoadedChunks;
	readonly rangeStart: unknown;
	readonly rangeEnd: unknown;
	readonly rows: unknown;
	readonly chunkSize: unknown;
	readonly maxChunks: unknown;
}): MergeTableChunkRangeResult => {
	const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
	const start = Math.max(0, toSafeInt(rangeStart, 0));
	const end = Math.max(start, toSafeInt(rangeEnd, start));
	const safeRows = sanitizeTableRowBatch(rows);
	const expectedRows = Math.max(0, end - start);

	if (safeRows.length !== expectedRows) {
		return {
			complete: false,
			mergedChunkStarts: [],
		};
	}

	const mergedChunkStarts: number[] = [];
	for (let chunkStart = start; chunkStart < end; chunkStart += safeChunkSize) {
		const chunkEnd = Math.min(end, chunkStart + safeChunkSize);
		const sliceStart = Math.max(0, chunkStart - start);
		const sliceEnd = Math.max(sliceStart, chunkEnd - start);
		const merged = mergeChunkRows({
			rowCache,
			loadedChunks,
			chunkStart,
			chunkEnd,
			rows: safeRows.slice(sliceStart, sliceEnd),
			chunkSize: safeChunkSize,
			maxChunks,
		});
		if (!merged) {
			return {
				complete: false,
				mergedChunkStarts,
			};
		}
		mergedChunkStarts.push(chunkStart);
	}

	return {
		complete: true,
		mergedChunkStarts,
	};
};

export const createTableRowCacheVersion = () => {
	let rowsVersion = 0;
	let rowsNotifyRaf = 0;
	const rowsSubscribers = new Set<() => void>();

	const getRowsVersion = () => rowsVersion;

	const subscribeRowsVersion = (callback: () => void) => {
		rowsSubscribers.add(callback);
		return () => rowsSubscribers.delete(callback);
	};

	const cancelRowsVersionNotification = () => {
		if (typeof window === "undefined") return;
		if (!rowsNotifyRaf) return;

		cancelAnimationFrame(rowsNotifyRaf);
		rowsNotifyRaf = 0;
	};

	const notifyRowsVersion = () => {
		if (typeof window === "undefined") return;
		if (rowsNotifyRaf) return;

		rowsNotifyRaf = requestAnimationFrame(() => {
			rowsNotifyRaf = 0;
			rowsVersion += 1;

			for (const callback of Array.from(rowsSubscribers)) {
				try {
					callback();
				} catch {
					// A broken listener must not prevent the row cache from advancing.
				}
			}
		});
	};

	return {
		cancelRowsVersionNotification,
		getRowsVersion,
		notifyRowsVersion,
		subscribeRowsVersion,
	};
};
