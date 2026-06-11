/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import { normalizeYUnit } from "src/cs/workbench/services/plot/common/units";
import {
    buildAutoWorkerConfig,
} from "src/cs/workbench/services/template/common/autoTemplateConfig";
import {
    inferAutoExtraction,
} from "src/cs/workbench/services/assessment/common/autoTemplatePlan";
import {
    resolveAutoGroupShape,
    resolveAutoGroupShapeFromXValues,
} from "src/cs/workbench/services/assessment/common/autoTemplateGrouping";
import {
    matchFileNameAgainstPatternTokens,
    normalizeFileNameFieldSeparators,
    splitFileNameMatchInput,
} from "src/cs/workbench/services/template/common/fileNameMatching";
import {
    normalizeTemplateProcessingAssessment,
} from "src/cs/workbench/services/template/common/templateProcessingAssessment";
import {
    getPerfNow,
    isPerfEnabled,
    logPerf,
    startPerf,
    summarizeProcessedFile,
} from "src/cs/workbench/common/perf";

const DEFAULT_MAX_POINTS = 600;
const PREVIEW_ROW_CACHE_CHUNK_DEFAULT = 200;
const PREVIEW_INDEX_STRIDE_ROWS_DEFAULT = 2000;
const PREVIEW_MAX_CACHED_CHUNKS_PER_FILE = 30;

const detectTemplateAxisRoleToken = (value: unknown): "vg" | "vd" | null => {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_\-./()[\]{}:=]+/g, "");
    if (!normalized) {
        return null;
    }
    if (normalized === "vg" || normalized.includes("gate")) {
        return "vg";
    }
    if (normalized === "vd" || normalized.includes("drain")) {
        return "vd";
    }
    return null;
};
const PREVIEW_RESULT_SEED_ROWS = PREVIEW_ROW_CACHE_CHUNK_DEFAULT * 2;
const AUTO_EXTRACTION_PREVIEW_ROWS = 512;
type LocalizedError = Error & {
    messageKey?: string | null;
    messageParams?: Record<string, unknown> | null;
};
type CsvRow = unknown[];
type RowStartCursor = {
    cursor: number;
    rowIndex: number;
};
type PreviewCache = {
    chunkCache: Map<number, CsvRow[]>;
    chunkLru: number[];
    columnCount: number;
    file: File;
    fileName: string;
    fileSize: number;
    indexStrideRows: number;
    inflightChunks: Map<number, Promise<CsvRow[]>>;
    lastModified: number;
    maxCellLengths: number[];
    parseQueue: Promise<unknown>;
    rowCount: number;
    rowStartCursors: RowStartCursor[];
};
type PreviewMetadata = Pick<
    PreviewCache,
    "chunkCache" | "chunkLru" | "columnCount" | "maxCellLengths" | "rowCount" | "rowStartCursors"
>;
type ProcessFileOptions = {
    readonly assessment?: unknown;
    readonly curveFilterField?: unknown;
    readonly curveFilterKey?: unknown;
    readonly maxPoints?: unknown;
    readonly perfEnabled?: unknown;
};
type AutoBlockConfig = {
    readonly bottomTitle?: unknown;
    readonly endCol?: unknown;
    readonly legendStartCell?: unknown;
    readonly legendStep?: unknown;
    readonly legendTarget?: unknown;
    readonly startCol?: unknown;
    readonly xCol?: unknown;
    readonly yCols?: unknown;
};
type ProcessedWorkerSeries = Record<string, unknown> & {
    readonly groupIndex?: unknown;
    readonly id?: unknown;
    readonly name?: unknown;
    readonly y: readonly unknown[] | Float64Array;
};
type ProcessedWorkerFile = Record<string, unknown> & {
    readonly series: readonly ProcessedWorkerSeries[];
    readonly xGroups: readonly (readonly number[] | Float64Array)[];
    readonly y?: {
        readonly columnLabels?: readonly unknown[];
        readonly columns?: readonly unknown[];
    };
};
type TemplateWorkerScope = {
    onmessage:
        | ((event: MessageEvent<{
            readonly payload?: Record<string, unknown>;
            readonly type?: string;
        }>) => unknown)
        | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};
const workerScope = self as unknown as TemplateWorkerScope;
// fileId -> preview metadata + sparse row index for fast range reads
// {
//   file, fileName, fileSize, lastModified,
//   rowCount, columnCount, maxCellLengths,
//   rowStartCursors: [{ rowIndex, cursor }], // sparse (absolute offsets into file)
//   chunkCache: Map<chunkStartRow, rows[]>,
//   chunkLru: number[],
//   inflightChunks: Map<chunkStartRow, Promise<rows[]>>,
//   parseQueue: Promise<void>,
// }
const previewCacheByFileId = new Map<string, PreviewCache>();
const collectProcessedTransferables = (processed: ProcessedWorkerFile): Transferable[] => {
    const transfer: Transferable[] = [];
    for (const xArr of processed.xGroups) {
        if (xArr instanceof Float64Array) {
            transfer.push(xArr.buffer);
        }
    }
    for (const series of processed.series) {
        if (series.y instanceof Float64Array) {
            transfer.push(series.y.buffer);
        }
    }
    return transfer;
};
const getExcelColumnLabel = (index: unknown): string => {
    let label = "";
    let i = Math.floor(Number(index));
    while (i >= 0) {
        label = String.fromCharCode(65 + (i % 26)) + label;
        i = Math.floor(i / 26) - 1;
    }
    return label;
};
const parseNumberStrict = (raw: unknown): number | null => {
    if (raw === null || raw === undefined)
        return null;
    if (typeof raw === "number")
        return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed)
            return null;
        const num = Number(trimmed);
        return Number.isFinite(num) ? num : null;
    }
    return null;
};
const trimCompactExponent = (text: string): string => text.replace(/e([+-])0+(\d+)/i, "e$1$2");
const trimTrailingZeros = (text: string): string => trimCompactExponent(text
    .replace(/(\.\d*?[1-9])0+$/i, "$1")
    .replace(/\.0+$/i, ""));
const formatCompactNumericLabel = (value: number): string | null => {
    if (!Number.isFinite(value))
        return null;
    const normalized = Number(value);
    if (Math.abs(normalized) < 1e-12)
        return "0";
    const roundedInteger = Math.round(normalized);
    const integerTolerance = Math.max(1e-12, Math.abs(normalized) * 1e-9);
    if (Math.abs(normalized - roundedInteger) <= integerTolerance) {
        return String(roundedInteger);
    }
    const abs = Math.abs(normalized);
    if (abs >= 1e-3 && abs < 1e4) {
        return trimTrailingZeros(normalized.toFixed(6));
    }
    return trimCompactExponent(normalized.toExponential(3));
};
const normalizeNearZeroLegendLabels = (labels: Array<string | null> | null): Array<string | null> | null => {
    if (!Array.isArray(labels) || labels.length === 0)
        return labels;
    const numericValues = labels.map((label) => typeof label === "string" ? parseNumberStrict(label) : null);
    const finiteValues = numericValues.filter((value): value is number => Number.isFinite(value));
    if (finiteValues.length < 3)
        return labels;
    const hasNegative = finiteValues.some((value) => value < 0);
    const hasPositive = finiteValues.some((value) => value > 0);
    const hasZero = finiteValues.some((value) => value === 0);
    if (!hasNegative || !hasPositive || hasZero)
        return labels;
    const absValues = finiteValues
        .map((value) => Math.abs(value))
        .filter((value) => value > 0)
        .sort((a, b) => a - b);
    if (!absValues.length)
        return labels;
    const medianIndex = Math.floor(absValues.length / 2);
    const medianAbs = absValues.length % 2 === 1
        ? (absValues[medianIndex] ?? null)
        : ((absValues[medianIndex - 1] ?? 0) + (absValues[medianIndex] ?? 0)) / 2;
    if (!Number.isFinite(medianAbs) || medianAbs <= 0)
        return labels;
    const zeroTolerance = Math.max(1e-12, medianAbs * 1e-4);
    let changed = false;
    const nextLabels = labels.map((label, index) => {
        const numericValue = numericValues[index];
        if (numericValue === null || Math.abs(numericValue) > zeroTolerance)
            return label;
        changed = true;
        return "0";
    });
    return changed ? nextLabels : labels;
};
const createLocalizedError = (
    messageKey: unknown,
    messageParams: unknown,
    fallbackMessage: unknown,
): LocalizedError => {
    const err = new Error(String(fallbackMessage || messageKey || "Unknown error")) as LocalizedError;
    err.messageKey = typeof messageKey === "string" ? messageKey : null;
    err.messageParams =
        messageParams && typeof messageParams === "object"
            ? messageParams as Record<string, unknown>
            : null;
    return err;
};
const padDomain = (min: unknown, max: unknown): [number, number] => {
    const minValue = Number(min);
    const maxValue = Number(max);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue))
        return [0, 1];
    const lo = Math.min(minValue, maxValue);
    const hi = Math.max(minValue, maxValue);
    if (lo === hi) {
        const pad = lo === 0 ? 1 : Math.abs(lo) * 0.05;
        return [lo - pad, hi + pad];
    }
    const span = hi - lo;
    const pad = span * 0.05;
    return [lo - pad, hi + pad];
};
function touchChunk(cache: PreviewCache, chunkStart: number): void {
    const lru = cache.chunkLru;
    const idx = lru.indexOf(chunkStart);
    if (idx >= 0)
        lru.splice(idx, 1);
    lru.push(chunkStart);
    while (lru.length > PREVIEW_MAX_CACHED_CHUNKS_PER_FILE) {
        const evict = lru.shift();
        if (evict === undefined)
            break;
        cache.chunkCache.delete(evict);
    }
}
function setChunk(cache: PreviewCache, chunkStart: number, rows: CsvRow[]): void {
    cache.chunkCache.set(chunkStart, rows);
    touchChunk(cache, chunkStart);
}
function findBaseCursor(cache: PreviewCache, targetRow: unknown): RowStartCursor {
    const idx = Math.max(0, Math.floor(Number(targetRow) || 0));
    let base = cache.rowStartCursors?.[0] ?? { rowIndex: 0, cursor: 0 };
    for (const point of cache.rowStartCursors ?? []) {
        if (point.rowIndex <= idx) {
            base = point;
            continue;
        }
        break;
    }
    return base;
}
function insertRowStartCursor(cache: PreviewCache, rowIndexRaw: unknown, cursorRaw: unknown): boolean {
    const rowIndex = Number(rowIndexRaw);
    const cursor = Number(cursorRaw);
    if (!Number.isInteger(rowIndex) || rowIndex < 0)
        return false;
    if (!Number.isFinite(cursor) || cursor < 0)
        return false;
    const points = cache.rowStartCursors;
    const last = points[points.length - 1];
    if (last && last.rowIndex === rowIndex) {
        if (cursor > last.cursor)
            last.cursor = cursor;
        return true;
    }
    // Insert maintaining ascending rowIndex order.
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (p.rowIndex === rowIndex) {
            if (cursor > p.cursor)
                p.cursor = cursor;
            return true;
        }
        if (p.rowIndex < rowIndex) {
            points.splice(i + 1, 0, { rowIndex, cursor });
            return true;
        }
    }
    points.unshift({ rowIndex, cursor });
    return true;
}
const readCsvCellNumber = async (file: File, rowIndex: unknown, colIndex: unknown): Promise<number | null> => {
    const targetRow = Number(rowIndex);
    const targetCol = Number(colIndex);
    if (!Number.isInteger(targetRow) || targetRow < 0) {
        throw new Error("Invalid cell row index");
    }
    if (!Number.isInteger(targetCol) || targetCol < 0) {
        throw new Error("Invalid cell column index");
    }
    return await new Promise<number | null>((resolve, reject) => {
        let currentRowIndex = -1;
        let done = false;
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            step: (results: Papa.ParseStepResult<CsvRow>, parser: Papa.Parser) => {
                if (done)
                    return;
                currentRowIndex += 1;
                if (currentRowIndex < targetRow)
                    return;
                if (currentRowIndex > targetRow) {
                    done = true;
                    parser.abort();
                    reject(new Error("Cell row not found"));
                    return;
                }
                const row = Array.isArray(results?.data) ? results.data : [];
                const raw = row[targetCol];
                done = true;
                parser.abort();
                resolve(parseNumberStrict(raw));
            },
            complete: () => {
                if (done)
                    return;
                done = true;
                reject(new Error("Cell row not found"));
            },
            error: (err: Error) => {
                if (done)
                    return;
                done = true;
                reject(err);
            },
        });
    });
};
const buildUniformSampleIndices = (lengthRaw: unknown, targetRaw: unknown): number[] | null => {
    const length = Math.max(0, Math.floor(Number(lengthRaw) || 0));
    const target = Math.max(0, Math.floor(Number(targetRaw) || 0));
    if (target <= 1)
        return [0];
    if (target >= length)
        return null;
    const last = length - 1;
    const idx = new Array(target);
    for (let i = 0; i < target; i++) {
        idx[i] = Math.round((i * last) / (target - 1));
    }
    // Ensure monotonic non-decreasing indices (guard against rounding artifacts)
    for (let i = 1; i < idx.length; i++) {
        if (idx[i] < idx[i - 1])
            idx[i] = idx[i - 1];
    }
    idx[idx.length - 1] = last;
    return idx;
};
const buildPreviewMetadataAndIndex = async (
    file: File,
    {
        indexStrideRows = PREVIEW_INDEX_STRIDE_ROWS_DEFAULT,
        warmCacheRows = PREVIEW_ROW_CACHE_CHUNK_DEFAULT * 4,
    }: {
        indexStrideRows?: unknown;
        warmCacheRows?: unknown;
    } = {},
): Promise<PreviewMetadata> => {
    const stride = Math.max(200, Math.floor(Number(indexStrideRows) || 0));
    const warmRows = Math.max(0, Math.floor(Number(warmCacheRows) || 0));
    let rowCount = 0;
    let columnCount = 0;
    let maxCellLengths: number[] = [];
    const rowStartCursors: RowStartCursor[] = [{ rowIndex: 0, cursor: 0 }];
    const chunkCache = new Map<number, CsvRow[]>();
    await new Promise<void>((resolve, reject) => {
        let done = false;
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            step: (results: Papa.ParseStepResult<CsvRow>) => {
                if (done)
                    return;
                const row = Array.isArray(results?.data) ? results.data : [];
                const rowIndex = rowCount;
                rowCount += 1;
                if (row.length > columnCount) {
                    columnCount = row.length;
                    if (maxCellLengths.length < columnCount) {
                        maxCellLengths = maxCellLengths.concat(new Array(columnCount - maxCellLengths.length).fill(0));
                    }
                }
                for (let i = 0; i < row.length; i++) {
                    const cell = row[i];
                    const len = cell === null || cell === undefined ? 0 : String(cell).length;
                    if (len > (maxCellLengths[i] ?? 0))
                        maxCellLengths[i] = len;
                }
                if (rowIndex < warmRows) {
                    const chunkStart = Math.floor(rowIndex / PREVIEW_ROW_CACHE_CHUNK_DEFAULT) *
                        PREVIEW_ROW_CACHE_CHUNK_DEFAULT;
                    const chunk = chunkCache.get(chunkStart) ?? [];
                    chunk.push(row);
                    if (!chunkCache.has(chunkStart))
                        chunkCache.set(chunkStart, chunk);
                }
                const cursor = Number(results?.meta?.cursor);
                if (Number.isFinite(cursor)) {
                    const nextRowIndex = rowCount;
                    if (nextRowIndex % stride === 0) {
                        rowStartCursors.push({ rowIndex: nextRowIndex, cursor });
                    }
                }
                // Intentionally do not pause/resume here; PapaParse step parsing is synchronous.
            },
            complete: () => {
                if (done)
                    return;
                done = true;
                resolve();
            },
            error: (err: Error) => {
                if (done)
                    return;
                done = true;
                reject(err);
            },
        });
    });
    if (maxCellLengths.length < columnCount) {
        maxCellLengths = maxCellLengths.concat(new Array(columnCount - maxCellLengths.length).fill(0));
    }
    // Ensure all warm chunks participate in eviction policy from the start.
    const chunkLru = Array.from(chunkCache.keys()).sort((a, b) => a - b);
    return {
        rowCount,
        columnCount,
        maxCellLengths,
        rowStartCursors,
        chunkCache,
        chunkLru,
    };
};
const ensurePreviewCache = async (
    fileId: unknown,
    file: File,
    {
        indexStrideRows,
        maxCacheRows,
    }: {
        indexStrideRows?: unknown;
        maxCacheRows?: unknown;
    } = {},
): Promise<PreviewCache> => {
    if (!fileId)
        throw new Error("Missing fileId for preview cache.");
    if (!file)
        throw new Error("Missing file for preview cache.");
    const normalizedFileId = String(fileId ?? "").trim();
    const existing = previewCacheByFileId.get(normalizedFileId);
    if (existing &&
        existing.fileName === file.name &&
        existing.fileSize === file.size &&
        existing.lastModified === file.lastModified) {
        return existing;
    }
    // Backwards-compat: callers historically used maxCacheRows=0 to mean "cache everything".
    // We now keep only a small warm cache, and rely on a sparse row index for fast random access.
    const maxCacheRowsNumber = Number(maxCacheRows);
    const indexStrideRowsNumber = Number(indexStrideRows);
    const warmCacheRows = Number.isFinite(maxCacheRowsNumber) && maxCacheRowsNumber > 0
        ? Math.min(5000, Math.floor(maxCacheRowsNumber))
        : PREVIEW_ROW_CACHE_CHUNK_DEFAULT * 4;
    const meta = await buildPreviewMetadataAndIndex(file, {
        indexStrideRows: Number.isFinite(indexStrideRowsNumber) && indexStrideRowsNumber > 0
            ? indexStrideRowsNumber
            : PREVIEW_INDEX_STRIDE_ROWS_DEFAULT,
        warmCacheRows,
    });
    const stride = Number.isFinite(indexStrideRowsNumber) && indexStrideRowsNumber > 0
        ? Math.max(200, Math.floor(indexStrideRowsNumber))
        : PREVIEW_INDEX_STRIDE_ROWS_DEFAULT;
    const next = {
        file,
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        rowCount: meta.rowCount,
        columnCount: meta.columnCount,
        maxCellLengths: meta.maxCellLengths,
        rowStartCursors: meta.rowStartCursors,
        indexStrideRows: stride,
        chunkCache: meta.chunkCache,
        chunkLru: meta.chunkLru,
        inflightChunks: new Map(),
        parseQueue: Promise.resolve(),
    };
    previewCacheByFileId.set(normalizedFileId, next);
    return next;
};
function enqueueParse<T>(cache: PreviewCache, task: () => Promise<T>): Promise<T> {
    const next = cache.parseQueue.then(task, task);
    cache.parseQueue = next.then(() => undefined, () => undefined);
    return next;
}
async function parsePreviewRowsRange(cache: PreviewCache, startRow: unknown, endRow: unknown): Promise<CsvRow[]> {
    const total = Math.max(0, Math.floor(Number(cache.rowCount) || 0));
    const start = Math.max(0, Math.min(total, Math.floor(Number(startRow) || 0)));
    const end = Math.max(start, Math.min(total, Math.floor(Number(endRow) || start)));
    if (end <= start)
        return [];
    const base = findBaseCursor(cache, start);
    const baseRowIndex = Math.max(0, Math.floor(Number(base.rowIndex) || 0));
    const baseCursor = Math.max(0, Math.floor(Number(base.cursor) || 0));
    const take = end - start;
    const blob = cache.file.slice(baseCursor);
    return await new Promise<CsvRow[]>((resolve, reject) => {
        let currentRowIndex = baseRowIndex;
        let collected = 0;
        const rows: CsvRow[] = [];
        let done = false;
        Papa.parse(blob as unknown as File, {
            header: false,
            skipEmptyLines: true,
            step: (results: Papa.ParseStepResult<CsvRow>, parser: Papa.Parser) => {
                if (done)
                    return;
                const row = Array.isArray(results?.data) ? results.data : [];
                // Record additional sparse index points opportunistically (keep the index small).
                const nextRowIndex = currentRowIndex + 1;
                const stride = Math.max(200, Math.floor(Number(cache.indexStrideRows) || PREVIEW_INDEX_STRIDE_ROWS_DEFAULT));
                if (nextRowIndex % stride === 0) {
                    const cursorRel = Number(results?.meta?.cursor);
                    if (Number.isFinite(cursorRel)) {
                        insertRowStartCursor(cache, nextRowIndex, baseCursor + cursorRel);
                    }
                }
                if (currentRowIndex < start) {
                    currentRowIndex += 1;
                    return;
                }
                if (collected < take) {
                    rows.push(row);
                    collected += 1;
                    currentRowIndex += 1;
                }
                if (collected >= take || currentRowIndex >= end) {
                    done = true;
                    parser.abort();
                    resolve(rows);
                }
            },
            complete: () => {
                if (done)
                    return;
                done = true;
                resolve(rows);
            },
            error: (err: Error) => {
                if (done)
                    return;
                done = true;
                reject(err);
            },
        });
    });
}
async function ensureChunk(cache: PreviewCache, chunkStart: unknown, chunkEnd: unknown): Promise<CsvRow[]> {
    const start = Math.max(0, Math.floor(Number(chunkStart) || 0));
    if (cache.chunkCache.has(start)) {
        touchChunk(cache, start);
        return cache.chunkCache.get(start) ?? [];
    }
    if (cache.inflightChunks.has(start)) {
        return await (cache.inflightChunks.get(start) ?? Promise.resolve([]));
    }
    const promise = enqueueParse(cache, async () => {
        const rows = await parsePreviewRowsRange(cache, start, chunkEnd);
        setChunk(cache, start, rows);
        return rows;
    });
    cache.inflightChunks.set(start, promise);
    try {
        return await promise;
    }
    finally {
        cache.inflightChunks.delete(start);
    }
}
async function getPreviewRows(cache: PreviewCache, startRow: unknown, endRow: unknown): Promise<CsvRow[]> {
    const total = Math.max(0, Math.floor(Number(cache.rowCount) || 0));
    const start = Math.max(0, Math.min(total, Math.floor(Number(startRow) || 0)));
    const end = Math.max(start, Math.min(total, Math.floor(Number(endRow) || start)));
    if (end <= start)
        return [];
    const chunkSize = PREVIEW_ROW_CACHE_CHUNK_DEFAULT;
    let cursor = Math.floor(start / chunkSize) * chunkSize;
    const rows: CsvRow[] = [];
    while (cursor < end) {
        const chunkStart = cursor;
        const chunkEnd = Math.min(total, chunkStart + chunkSize);
        const chunkRows = await ensureChunk(cache, chunkStart, chunkEnd);
        const takeStart = Math.max(start, chunkStart);
        const takeEnd = Math.min(end, chunkEnd);
        const offset = takeStart - chunkStart;
        const takeCount = takeEnd - takeStart;
        if (takeCount > 0) {
            rows.push(...chunkRows.slice(offset, offset + takeCount));
        }
        cursor = chunkEnd;
    }
    return rows;
}
const readXValuesForAutoGroupShape = async ({
    cache,
    endRow,
    fileName,
    startRow,
    xCol,
}: {
    cache: PreviewCache;
    endRow: unknown;
    fileName: unknown;
    startRow: unknown;
    xCol: unknown;
}): Promise<number[]> => {
    const startRowIndex = Math.max(0, Math.floor(Number(startRow) || 0));
    const endRowIndex = Math.max(startRowIndex, Math.floor(Number(endRow) || startRowIndex));
    const xColIndex = Math.max(0, Math.floor(Number(xCol) || 0));
    const rows = await getPreviewRows(cache, startRowIndex, endRowIndex + 1);
    const xValues: number[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i += 1) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const xRaw = row[xColIndex];
        const xVal = parseNumberStrict(xRaw);
        if (xVal === null) {
            const rowIndex = startRowIndex + i;
            const cellRef = `${getExcelColumnLabel(xColIndex)}${rowIndex + 1}`;
            throw new Error(`${fileName}: Invalid X at ${cellRef} (${JSON.stringify(xRaw ?? "")}).`);
        }
        xValues[i] = xVal;
    }
    return xValues;
};
const processFile = async (
    file: File,
    fileId: unknown,
    fileName: unknown,
    config: Record<string, unknown>,
    { assessment, curveFilterField, curveFilterKey, maxPoints, perfEnabled }: ProcessFileOptions,
) => {
    const shouldLogPerf = Boolean(perfEnabled) || isPerfEnabled();
    const finishProcessPerf = startPerf("worker:process-file", {
        fileId,
        fileName,
        sizeBytes: file?.size ?? null,
    }, { force: shouldLogPerf });
    const xCol = Number(config?.xCol);
    const startRow = Number(config?.startRow);
    const endRowRaw = config?.endRow;
    let groupSize = Number(config?.groupSize);
    let groups = Number(config?.groups);
    const segmentCount = Number(config?.segmentCount);
    const xSegmentationMode = String(config?.xSegmentationMode ?? "").trim().toLowerCase();
    const isAutoSegmentationMode = xSegmentationMode === "auto";
    const yCols = Array.isArray(config?.yCols) ? config.yCols.map(Number) : [];
    const groupSizeCell = config?.groupSizeCell ?? null;
    const yLegendStartCell = config?.yLegendStartCell ?? null;
    const yLegendStartValueRaw = config?.yLegendStartValue ?? null;
    const yLegendCountCell = config?.yLegendCountCell ?? null;
    const yLegendStepCell = config?.yLegendStepCell ?? null;
    const yLegendCountRaw = config?.yLegendCount ?? null;
    const yLegendStepRaw = config?.yLegendStep ?? null;
    const yLegendTargetRaw = config?.yLegendTarget ?? "auto";
    const normalizedCurveFilterKey = typeof curveFilterKey === "string" ? curveFilterKey.trim() : "";
    const normalizedCurveFilterField = typeof curveFilterField === "string" ? curveFilterField.trim() : "";
    /* New helper to read specific cell as string */
    const readCsvCellString = async (file: File, rowIndex: unknown, colIndex: unknown): Promise<string> => {
        const targetRow = Number(rowIndex);
        const targetCol = Number(colIndex);
        if (!Number.isInteger(targetRow) || targetRow < 0)
            throw new Error("Invalid cell row index");
        if (!Number.isInteger(targetCol) || targetCol < 0)
            throw new Error("Invalid cell column index");
        return await new Promise<string>((resolve, reject) => {
            let currentRowIndex = -1;
            let done = false;
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                step: (results: Papa.ParseStepResult<CsvRow>, parser: Papa.Parser) => {
                    if (done)
                        return;
                    currentRowIndex += 1;
                    if (currentRowIndex < targetRow)
                        return;
                    if (currentRowIndex > targetRow) {
                        done = true;
                        parser.abort();
                        reject(new Error("Cell row not found"));
                        return;
                    }
                    const row = Array.isArray(results?.data) ? results.data : [];
                    const raw = row[targetCol];
                    done = true;
                    parser.abort();
                    resolve(raw === null || raw === undefined ? "" : String(raw).trim());
                },
                complete: () => {
                    if (done)
                        return;
                    done = true;
                    reject(new Error("Cell row not found"));
                },
                error: (err: Error) => {
                    if (done)
                        return;
                    done = true;
                    reject(err);
                },
            });
        });
    };
    /* Helper to resolve keyword from config (literal or cell ref) */
    const resolveKeyword = async (input: unknown): Promise<string> => {
        const raw = String(input || "").trim();
        if (!raw)
            return "";
        // Check for A1-style cell reference (e.g., "A1", "AB12", etc.)
        const match = raw.match(/^([A-Z]+)([1-9][0-9]*)$/);
        if (!match)
            return raw; // Treat as literal keyword
        const colStr = match[1];
        const rowStr = match[2];
        // Decode column label to 0-based index
        let colIndex = 0;
        for (let i = 0; i < colStr.length; i++) {
            colIndex = colIndex * 26 + (colStr.charCodeAt(i) - 64);
        }
        colIndex -= 1; // 0-based
        const rowIndex = Number(rowStr) - 1; // 0-based
        try {
            return await readCsvCellString(file, rowIndex, colIndex);
        }
        catch {
            return raw; // Fallback to treating as literal on read error
        }
    };
    const bottomTitleRaw = config?.bottomTitle;
    const leftTitleRaw = config?.leftTitle;
    const legendPrefixRaw = config?.legendPrefix;
    const xUnitRaw = config?.xUnit;
    const yUnitRaw = normalizeYUnit(config?.yUnit, "");
    const fileNameVgKeywordsRaw = config?.fileNameVgKeywords;
    const fileNameVdKeywordsRaw = config?.fileNameVdKeywords;
    const appendAxisUnit = (labelRaw: unknown, unitRaw: unknown): string => {
        const label = String(labelRaw ?? "").trim();
        const unit = String(unitRaw ?? "").trim();
        if (!unit)
            return label;
        if (!label)
            return unit;
        if (/\([^()]+\)\s*$/.test(label)) {
            return label.replace(/\([^()]+\)\s*$/, `(${unit})`);
        }
        if (label === unit)
            return label;
        return `${label} (${unit})`;
    };
    const fileNameFieldSeparators = normalizeFileNameFieldSeparators(config?.fileNameFieldSeparators);
    const fileNameVgKeywords = splitFileNameMatchInput(fileNameVgKeywordsRaw);
    const fileNameVdKeywords = splitFileNameMatchInput(fileNameVdKeywordsRaw);
    const useFileNameMapping = fileNameVgKeywords.length > 0 || fileNameVdKeywords.length > 0;
    // Resolve potentially dynamic keywords
    const bottomTitle = await resolveKeyword(bottomTitleRaw);
    const leftTitle = await resolveKeyword(leftTitleRaw);
    const legendPrefix = await resolveKeyword(legendPrefixRaw);
    const var2Token = detectTemplateAxisRoleToken(legendPrefix);
    const assessmentSummary = normalizeTemplateProcessingAssessment(assessment);
    const curveType = assessmentSummary?.curveType ?? null;
    const curveTypeConfidence = assessmentSummary?.curveTypeConfidence ?? "low";
    const curveTypeNeedsTemplate = assessmentSummary?.curveTypeNeedsTemplate ?? false;
    const curveTypeReasons: string[] = assessmentSummary?.curveTypeReasons
        ? [...assessmentSummary.curveTypeReasons]
        : [];
    const xAxisRole = assessmentSummary?.xAxisRole ?? null;
    const xAxisRoleSource = assessmentSummary?.xAxisRoleSource ?? null;
    const endRowIsEnd = typeof endRowRaw === "string" && endRowRaw.trim().toLowerCase() === "end";
    let endRow: number | null = endRowIsEnd ? null : Number(endRowRaw);
    if (!Number.isInteger(xCol) || xCol < 0) {
        throw new Error("Invalid config: xCol");
    }
    if (!Number.isInteger(startRow) || startRow < 0) {
        throw new Error("Invalid config: startRow");
    }
    if (!endRowIsEnd) {
        if (!Number.isInteger(endRow) || Number(endRow) < startRow) {
            throw new Error("Invalid config: endRow");
        }
    }
    else {
        const cache = await ensurePreviewCache(fileId, file);
        const rowCount = Math.max(0, Math.floor(Number(cache.rowCount) || 0));
        const lastRowIndex = rowCount - 1;
        if (lastRowIndex < startRow) {
            throw new Error(`${fileName}: X start row (${startRow + 1}) exceeds total parsed rows (${rowCount}).`);
        }
        endRow = lastRowIndex;
    }
    if (!yCols.length || yCols.some((c) => !Number.isInteger(c) || c < 0)) {
        throw new Error("Invalid config: yCols");
    }
    if (endRow === null) {
        throw new Error("Invalid config: endRow");
    }
    const expectedTotal = endRow - startRow + 1;
    if (groupSizeCell && typeof groupSizeCell === "object") {
        const groupSizeCellRecord = groupSizeCell as { readonly colIndex?: unknown; readonly rowIndex?: unknown };
        const cellRow = Number(groupSizeCellRecord.rowIndex);
        const cellCol = Number(groupSizeCellRecord.colIndex);
        if (!Number.isInteger(cellRow) || cellRow < 0) {
            throw new Error("Invalid config: groupSizeCell.rowIndex");
        }
        if (!Number.isInteger(cellCol) || cellCol < 0) {
            throw new Error("Invalid config: groupSizeCell.colIndex");
        }
        const cellRef = `${getExcelColumnLabel(cellCol)}${cellRow + 1}`;
        let rawPoints;
        try {
            rawPoints = await readCsvCellNumber(file, cellRow, cellCol);
        }
        catch (err: unknown) {
            const message = err instanceof Error ? err.message : "unknown error";
            throw new Error(`${fileName}: Unable to read points cell ${cellRef} (${message}).`);
        }
        const points = rawPoints !== null && Number.isInteger(rawPoints) ? rawPoints : null;
        if (points === null || points <= 0) {
            throw createLocalizedError("da_extractPointsCellPositiveInt", { cell: cellRef }, `${fileName}: Points cell ${cellRef} must contain a positive integer.`);
        }
        if (points > expectedTotal) {
            throw createLocalizedError("da_extractPointsCellTooLarge", { cell: cellRef, points, total: expectedTotal }, `${fileName}: Points from ${cellRef} (${points}) cannot be larger than the X range length (${expectedTotal}).`);
        }
        if (expectedTotal % points !== 0) {
            throw createLocalizedError("da_extractXNotDivisibleByPointsFromCell", { total: expectedTotal, points, cell: cellRef }, `${fileName}: X range has ${expectedTotal} points, which is not divisible by points=${points} (from ${cellRef}).`);
        }
        groupSize = points;
        groups = expectedTotal / points;
    }
    else {
        if (isAutoSegmentationMode) {
            const cache = await ensurePreviewCache(fileId, file);
            const seedEndRow = Math.min(Number(cache.rowCount) || 0, PREVIEW_RESULT_SEED_ROWS);
            const seedRows = seedEndRow > 0 ? await getPreviewRows(cache, 0, seedEndRow) : [];
            const metadataGrouping = resolveAutoGroupShape({
                dataStartRowIndex: startRow,
                pointColIndex: -1,
                rows: seedRows,
                totalRowCount: cache.rowCount,
                var2ColIndex: -1,
                xCol: -1,
            });
            if (metadataGrouping.groupSize !== null && metadataGrouping.groups !== null) {
                groupSize = metadataGrouping.groupSize;
                groups = metadataGrouping.groups;
            }
            else {
                const xValues = await readXValuesForAutoGroupShape({
                    cache,
                    endRow,
                    fileName,
                    startRow,
                    xCol,
                });
                const xGrouping = resolveAutoGroupShapeFromXValues({
                    dataStartRowIndex: startRow,
                    totalRowCount: endRow + 1,
                    xValues,
                });
                if (xGrouping.groupSize !== null && xGrouping.groups !== null) {
                    groupSize = xGrouping.groupSize;
                    groups = xGrouping.groups;
                }
                else {
                    groupSize = expectedTotal;
                    groups = 1;
                }
            }
        }
        else {
            if (Number.isInteger(segmentCount) && segmentCount > 0) {
                if (expectedTotal % segmentCount !== 0) {
                    throw createLocalizedError("da_extractXNotDivisibleBySegments", { total: expectedTotal, segments: segmentCount }, `${fileName}: X range has ${expectedTotal} points, which is not divisible by segments=${segmentCount}.`);
                }
                groups = segmentCount;
                groupSize = expectedTotal / segmentCount;
            }
            // Allow deferred grouping for End-row mode: resolve once file row count is known.
            if (!Number.isInteger(groupSize) || groupSize <= 0) {
                groupSize = expectedTotal;
                groups = 1;
            }
            else if (!Number.isInteger(groups) || groups <= 0) {
                if (expectedTotal % groupSize !== 0) {
                    throw createLocalizedError("da_extractXNotDivisibleByPoints", { total: expectedTotal, points: groupSize }, `${fileName}: X range has ${expectedTotal} points, which is not divisible by points=${groupSize}.`);
                }
                groups = expectedTotal / groupSize;
            }
            else if (expectedTotal !== groups * groupSize) {
                throw new Error(`Invalid config: X range (${expectedTotal}) != groups(${groups}) * points(${groupSize})`);
            }
        }
    }
    if (!Number.isInteger(groupSize) || groupSize <= 0) {
        throw new Error("Invalid config: groupSize");
    }
    if (!Number.isInteger(groups) || groups <= 0) {
        throw new Error("Invalid config: groups");
    }
    const formatLegendValue = (raw: unknown): string | null => {
        if (raw === null || raw === undefined)
            return null;
        if (typeof raw === "number") {
            return formatCompactNumericLabel(raw);
        }
        const text = String(raw).trim();
        if (!text)
            return null;
        const numericValue = parseNumberStrict(text);
        return numericValue === null ? text : formatCompactNumericLabel(numericValue);
    };
    const formatGeneratedLegendValue = (value: unknown): string | null => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue))
            return null;
        const normalized = Number(numericValue.toPrecision(12));
        return Number.isFinite(normalized) ? formatCompactNumericLabel(normalized) : null;
    };
    const tryReadPositiveIntegerCell = async (cell: unknown): Promise<number | null> => {
        if (!cell || typeof cell !== "object")
            return null;
        const record = cell as { readonly colIndex?: unknown; readonly rowIndex?: unknown };
        const cellRow = Number(record.rowIndex);
        const cellCol = Number(record.colIndex);
        if (!Number.isInteger(cellRow) || cellRow < 0)
            return null;
        if (!Number.isInteger(cellCol) || cellCol < 0)
            return null;
        try {
            const raw = await readCsvCellNumber(file, cellRow, cellCol);
            const value = raw !== null && Number.isInteger(raw) && raw > 0 ? raw : null;
            return value;
        }
        catch {
            // Optional legend config: ignore read errors.
            return null;
        }
    };
    const tryReadPositiveNumberCell = async (cell: unknown): Promise<number | null> => {
        if (!cell || typeof cell !== "object")
            return null;
        const record = cell as { readonly colIndex?: unknown; readonly rowIndex?: unknown };
        const cellRow = Number(record.rowIndex);
        const cellCol = Number(record.colIndex);
        if (!Number.isInteger(cellRow) || cellRow < 0)
            return null;
        if (!Number.isInteger(cellCol) || cellCol < 0)
            return null;
        try {
            const raw = await readCsvCellNumber(file, cellRow, cellCol);
            const value = raw !== null && Number.isFinite(raw) && raw > 0 ? raw : null;
            return value;
        }
        catch {
            // Optional legend config: ignore read errors.
            return null;
        }
    };
    const normalizePositiveInteger = (raw: unknown): number | null => {
        if (raw === null || raw === undefined || raw === "")
            return null;
        const num = Number(raw);
        if (!Number.isInteger(num) || num <= 0)
            return null;
        return num;
    };
    const normalizePositiveNumber = (raw: unknown): number | null => {
        if (raw === null || raw === undefined || raw === "")
            return null;
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0)
            return null;
        return num;
    };
    const resolveLegendLayout = (desiredCount: number | null) => {
        const yCount = yCols.length;
        const gCount = groups;
        const preferredTarget = yLegendTargetRaw === "yColumn"
            ? "yCol"
            : yLegendTargetRaw === "group"
                ? "group"
                : "auto";
        let mode: "yCol" | "group" | null = null;
        let count: number | null = desiredCount;
        if (preferredTarget === "yCol") {
            mode = "yCol";
            if (!(Number.isInteger(count) && Number(count) > 0))
                count = yCount;
        }
        else if (preferredTarget === "group") {
            mode = "group";
            if (!(Number.isInteger(count) && Number(count) > 0))
                count = gCount;
        }
        else if (Number.isInteger(count) && Number(count) > 0) {
            if (count === yCount && count !== gCount)
                mode = "yCol";
            else if (count === gCount && count !== yCount)
                mode = "group";
            else if (yCount === 1 && gCount > 1)
                mode = "group";
            else if (gCount === 1 && yCount > 1)
                mode = "yCol";
            else
                mode = yCount >= gCount ? "yCol" : "group";
        }
        else if (gCount === 1) {
            mode = "yCol";
            count = yCount;
        }
        else if (yCount === 1) {
            mode = "group";
            count = gCount;
        }
        else {
            mode = "yCol";
            count = yCount;
        }
        const maxCount = mode === "group" ? gCount : yCount;
        const finalCount = Number.isInteger(count) && Number(count) > 0
            ? Math.min(Number(count), maxCount)
            : 0;
        return { mode, finalCount };
    };
    const xFullByGroup = Array.from({ length: groups }, () => new Float64Array(groupSize));
    const yFullByGroup = Array.from({ length: groups }, () => yCols.map(() => new Float64Array(groupSize)));
    // Optional: map Y Data points to curve legends (best-effort).
    // Supports two common layouts:
    // - "yCol": Y Data points are laid out horizontally (same row, col step) and map to Y columns.
    // - "group": Y Data points are laid out vertically (same col, row step) and map to groups.
    let yLegendMode: "yCol" | "group" | null = null;
    let yLegendLabels: Array<string | null> | null = null;
    let yLegendStartRow: number | null = null;
    let yLegendStartCol: number | null = null;
    let yLegendStep: number | null = null;
    let yLegendGenerateStep: number | null = null;
    let yLegendRowToIndex: Map<number, number> | null = null;
    let yLegendRowCaptured = false;
    if (yLegendStartCell && typeof yLegendStartCell === "object") {
        const yLegendStartCellRecord = yLegendStartCell as { readonly colIndex?: unknown; readonly rowIndex?: unknown };
        const startLegendRow = Number(yLegendStartCellRecord.rowIndex);
        const startLegendCol = Number(yLegendStartCellRecord.colIndex);
        if (Number.isInteger(startLegendRow) &&
            startLegendRow >= 0 &&
            Number.isInteger(startLegendCol) &&
            startLegendCol >= 0) {
            const countFromCell = await tryReadPositiveIntegerCell(yLegendCountCell);
            const stepFromCell = await tryReadPositiveNumberCell(yLegendStepCell);
            const countFromRaw = normalizePositiveInteger(yLegendCountRaw);
            const stepFromRaw = normalizePositiveNumber(yLegendStepRaw);
            const desiredCount = countFromCell ?? countFromRaw;
            const desiredStep = stepFromCell ?? stepFromRaw;
            const { mode, finalCount } = resolveLegendLayout(desiredCount);
            if (finalCount > 0) {
                yLegendMode = mode;
                yLegendLabels = new Array(finalCount).fill(null);
                yLegendStartRow = startLegendRow;
                yLegendStartCol = startLegendCol;
                const defaultStep = mode === "group" ? groupSize : 1;
                const desiredStepValue = Number(desiredStep);
                yLegendGenerateStep =
                    Number.isFinite(desiredStepValue) &&
                        desiredStepValue > 0 &&
                        !Number.isInteger(desiredStepValue)
                        ? desiredStepValue
                        : null;
                yLegendStep =
                    Number.isInteger(desiredStepValue) && desiredStepValue > 0
                        ? desiredStepValue
                        : defaultStep;
                if (mode === "group" && yLegendGenerateStep === null) {
                    yLegendRowToIndex = new Map();
                    const stepValue = yLegendStep ?? defaultStep;
                    for (let i = 0; i < finalCount; i++) {
                        yLegendRowToIndex.set(yLegendStartRow + stepValue * i, i);
                    }
                }
            }
        }
    }
    else if (yLegendStartValueRaw !== null &&
        yLegendStartValueRaw !== undefined &&
        String(yLegendStartValueRaw).trim()) {
        const countFromCell = await tryReadPositiveIntegerCell(yLegendCountCell);
        const stepFromCell = await tryReadPositiveNumberCell(yLegendStepCell);
        const countFromRaw = normalizePositiveInteger(yLegendCountRaw);
        const stepFromRaw = normalizePositiveNumber(yLegendStepRaw);
        const desiredCount = countFromCell ?? countFromRaw;
        const desiredStep = stepFromCell ?? stepFromRaw;
        const { mode, finalCount } = resolveLegendLayout(desiredCount);
        const startValue = parseNumberStrict(yLegendStartValueRaw);
        const desiredStepValue = Number(desiredStep);
        const stepValue = Number.isFinite(desiredStepValue) && desiredStepValue > 0 ? desiredStepValue : 1;
        if (finalCount > 0 && startValue !== null) {
            yLegendMode = mode;
            yLegendLabels = new Array(finalCount).fill(null);
            for (let i = 0; i < finalCount; i++) {
                const value = startValue + stepValue * i;
                const label = formatGeneratedLegendValue(value);
                if (label !== null)
                    yLegendLabels[i] = label;
            }
        }
    }
    let seenRowsInRange = 0;
    let currentRowIndex = -1;
    const parseStartMs = getPerfNow();
    await new Promise<void>((resolve, reject) => {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            step: (results: Papa.ParseStepResult<CsvRow>, parser: Papa.Parser) => {
                currentRowIndex += 1;
                const row = Array.isArray(results?.data) ? results.data : [];
                // Capture legend labels before we potentially early-return on X range checks.
                if (yLegendMode === "yCol") {
                    if (!yLegendRowCaptured && currentRowIndex === yLegendStartRow) {
                        if (yLegendGenerateStep !== null && yLegendStartCol !== null) {
                            const startValue = parseNumberStrict(row[yLegendStartCol]);
                            if (startValue !== null) {
                                const legendLabels = yLegendLabels;
                                if (legendLabels) {
                                    for (let i = 0; i < legendLabels.length; i++) {
                                        const value = startValue + yLegendGenerateStep * i;
                                        const label = formatGeneratedLegendValue(value);
                                        if (label !== null)
                                            legendLabels[i] = label;
                                    }
                                }
                            }
                        }
                        else {
                            const legendLabels = yLegendLabels;
                            if (legendLabels && yLegendStartCol !== null && yLegendStep !== null) {
                                for (let i = 0; i < legendLabels.length; i++) {
                                    const col = yLegendStartCol + yLegendStep * i;
                                    const label = formatLegendValue(row[col]);
                                    if (label !== null)
                                        legendLabels[i] = label;
                                }
                            }
                        }
                        yLegendRowCaptured = true;
                    }
                }
                else if (yLegendMode === "group") {
                    if (yLegendGenerateStep !== null && yLegendStartCol !== null) {
                        if (!yLegendRowCaptured && currentRowIndex === yLegendStartRow) {
                            const startValue = parseNumberStrict(row[yLegendStartCol]);
                            if (startValue !== null) {
                                const legendLabels = yLegendLabels;
                                if (legendLabels) {
                                    for (let i = 0; i < legendLabels.length; i++) {
                                        const value = startValue + yLegendGenerateStep * i;
                                        const label = formatGeneratedLegendValue(value);
                                        if (label !== null)
                                            legendLabels[i] = label;
                                    }
                                }
                            }
                            yLegendRowCaptured = true;
                        }
                    }
                    else if (yLegendRowToIndex && yLegendRowToIndex.size > 0) {
                        const idx = yLegendRowToIndex.get(currentRowIndex);
                        if (idx !== undefined && yLegendStartCol !== null) {
                            const label = formatLegendValue(row[yLegendStartCol]);
                            if (label !== null && yLegendLabels)
                                yLegendLabels[idx] = label;
                            yLegendRowToIndex.delete(currentRowIndex);
                        }
                    }
                }
                if (currentRowIndex < startRow)
                    return;
                if (currentRowIndex > endRow) {
                    parser.abort();
                    return;
                }
                const localIndex = currentRowIndex - startRow;
                const groupIndex = Math.floor(localIndex / groupSize);
                const indexInGroup = localIndex % groupSize;
                const xRaw = row[xCol];
                const xVal = parseNumberStrict(xRaw);
                if (xVal === null) {
                    const cellRef = `${getExcelColumnLabel(xCol)}${currentRowIndex + 1}`;
                    reject(new Error(`${fileName}: Invalid X at ${cellRef} (${JSON.stringify(xRaw ?? "")}).`));
                    parser.abort();
                    return;
                }
                xFullByGroup[groupIndex][indexInGroup] = xVal;
                for (let yi = 0; yi < yCols.length; yi++) {
                    const yCol = yCols[yi];
                    const yRaw = row[yCol];
                    const yVal = parseNumberStrict(yRaw);
                    if (yVal === null) {
                        const cellRef = `${getExcelColumnLabel(yCol)}${currentRowIndex + 1}`;
                        reject(new Error(`${fileName}: Invalid Y at ${cellRef} (${JSON.stringify(yRaw ?? "")}).`));
                        parser.abort();
                        return;
                    }
                    yFullByGroup[groupIndex][yi][indexInGroup] = yVal;
                }
                seenRowsInRange += 1;
            },
            complete: () => resolve(),
            error: (err: Error) => reject(err),
        });
    });
    logPerf("worker:parse-csv", {
        durationMs: getPerfNow() - parseStartMs,
        expectedRows: expectedTotal,
        fileId,
        fileName,
        groups,
        yColumnCount: yCols.length,
    }, { force: shouldLogPerf });
    if (seenRowsInRange !== expectedTotal) {
        throw new Error(`${fileName}: X end row (${endRow + 1}) exceeds total parsed rows (${currentRowIndex + 1}).`);
    }
    yLegendLabels = normalizeNearZeroLegendLabels(yLegendLabels);
    // Finalize applicability/curve labels.
    // File-name mapping now serves as template applicability gating only.
    if (useFileNameMapping) {
        if (fileNameVgKeywords.length === 0 || fileNameVdKeywords.length === 0) {
            throw new Error(`${fileName}: Invalid template config: both file-name prefix groups are required.`);
        }
        const matchedVg = matchFileNameAgainstPatternTokens(fileName, fileNameVgKeywords, {
            separators: fileNameFieldSeparators,
        });
        const matchedVd = matchFileNameAgainstPatternTokens(fileName, fileNameVdKeywords, {
            separators: fileNameFieldSeparators,
        });
        if (!matchedVg && !matchedVd) {
            throw new Error(`${fileName}: File name does not match configured template prefixes.`);
        }
    }
    const legendVarToken = var2Token;
    let effectiveBottomTitle = bottomTitle;
    let effectiveLegendPrefix = legendPrefix;
    const maxPointsNumber = Number(maxPoints);
    const targetPoints = Math.min(groupSize, Math.max(2, Number.isFinite(maxPointsNumber) ? maxPointsNumber : DEFAULT_MAX_POINTS));
    const sampleIdx = buildUniformSampleIndices(groupSize, targetPoints);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const xGroups: Float64Array[] = [];
    const series: ProcessedWorkerSeries[] = [];
    for (let g = 0; g < groups; g++) {
        const xFull = xFullByGroup[g];
        const xDown = new Float64Array(targetPoints);
        if (!sampleIdx) {
            xDown.set(xFull);
        }
        else {
            for (let i = 0; i < targetPoints; i++) {
                xDown[i] = xFull[sampleIdx[i]];
            }
        }
        for (let i = 0; i < xDown.length; i++) {
            const xVal = xDown[i];
            if (Number.isFinite(xVal)) {
                if (xVal < minX)
                    minX = xVal;
                if (xVal > maxX)
                    maxX = xVal;
            }
        }
        xGroups.push(xDown);
        for (let yi = 0; yi < yCols.length; yi++) {
            const yFull = yFullByGroup[g][yi];
            const yDown = new Float64Array(targetPoints);
            if (!sampleIdx) {
                yDown.set(yFull);
            }
            else {
                for (let i = 0; i < targetPoints; i++) {
                    yDown[i] = yFull[sampleIdx[i]];
                }
            }
            for (let i = 0; i < yDown.length; i++) {
                const yVal = yDown[i];
                if (Number.isFinite(yVal)) {
                    if (yVal < minY)
                        minY = yVal;
                    if (yVal > maxY)
                        maxY = yVal;
                }
            }
            const yCol = yCols[yi];
            const yLabel = getExcelColumnLabel(yCol);
            const legendLabel = yLegendMode === "yCol"
                ? (yLegendLabels?.[yi] ?? null)
                : yLegendMode === "group"
                    ? (yLegendLabels?.[g] ?? null)
                    : null;
            const legendValue = typeof legendLabel === "string" ? parseNumberStrict(legendLabel) : null;
            const seriesName = (() => {
                if (!legendLabel)
                    return `${yLabel} #${g + 1}`;
                // Format: "Var2=Value" if Var2 is present, else just Value
                // Use legendPrefix directly (it is the resolved string from Var2)
                const prefix = effectiveLegendPrefix ? `${effectiveLegendPrefix}=` : "";
                const labelValue = legendLabel;
                if (yLegendMode === "yCol") {
                    return groups > 1
                        ? `${prefix}${labelValue} #${g + 1}`
                        : `${prefix}${labelValue}`;
                }
                // yLegendMode === "group"
                return yCols.length > 1
                    ? `${yLabel} @ ${prefix}${labelValue}`
                    : `${prefix}${labelValue}`;
            })();
            series.push({
                id: `${fileId}_${yCol}_${g}`,
                name: seriesName,
                fileId,
                groupIndex: g,
                yCol,
                y: yDown,
                legendLabel,
                legendValue,
            });
        }
    }
    const [x0, x1] = padDomain(Number.isFinite(minX) ? minX : 0, Number.isFinite(maxX) ? maxX : 1);
    const [y0, y1] = padDomain(Number.isFinite(minY) ? minY : 0, Number.isFinite(maxY) ? maxY : 1);
    const domain = { x: [x0, x1], y: [y0, y1] };
    // Use Var1 as X Label, fallback to column label
    // Use bottomTitle directly (resolved string from Var1)
    const xLabel = appendAxisUnit(effectiveBottomTitle || getExcelColumnLabel(xCol), xUnitRaw);
    const yLabel = appendAxisUnit(leftTitle || "", yUnitRaw);
    const supportsSs = xAxisRole === "vg";
    const processed = {
        fileId,
        fileName,
        curveFilterKey: normalizedCurveFilterKey || null,
        curveFilterField: normalizedCurveFilterField || null,
        legend: yLegendMode
            ? {
                mode: yLegendMode,
                labels: yLegendLabels,
                prefix: effectiveLegendPrefix || null,
                varToken: legendVarToken || null,
            }
            : null,
        curveType,
        curveTypeConfidence,
        curveTypeNeedsTemplate,
        curveTypeReasons,
        xAxisRole,
        xAxisRoleSource,
        supportsSs,
        xLabel, // New field
        yLabel,
        x: {
            col: xCol,
            colLabel: getExcelColumnLabel(xCol),
            startRow: startRow + 1,
            endRow: endRow + 1,
            points: groupSize,
            groups,
            sampledPoints: targetPoints,
        },
        xUnit: String(xUnitRaw ?? "").trim(),
        yUnit: yUnitRaw,
        y: {
            columns: yCols,
            columnLabels: yCols.map(getExcelColumnLabel),
        },
        xGroups,
        series,
        domain,
    };
    finishProcessPerf({
        ...summarizeProcessedFile(processed),
        expectedRows: expectedTotal,
        yColumnCount: yCols.length,
    });
    return processed;
};

const buildBlockProcessConfig = (
    config: Record<string, unknown>,
    block: AutoBlockConfig,
): Record<string, unknown> => {
    const nextConfig: Record<string, unknown> = {
        ...config,
        bottomTitle: block?.bottomTitle ?? config?.bottomTitle,
        xCol: block?.xCol,
        yCols: Array.isArray(block?.yCols) ? block.yCols : [],
        yLegendStartCell: block?.legendStartCell ?? null,
        yLegendCount:
            block?.legendTarget === "yColumn" && Array.isArray(block?.yCols)
                ? block.yCols.length
                : config?.yLegendCount,
        yLegendStep: block?.legendStep ?? config?.yLegendStep,
        yLegendTarget: block?.legendTarget ?? config?.yLegendTarget,
    };
    delete nextConfig.blocks;
    return nextConfig;
};

const processAutoConfiguredFile = async (
    file: File,
    fileId: unknown,
    fileName: unknown,
    config: Record<string, unknown>,
    options: ProcessFileOptions,
) => {
    const blocks = Array.isArray(config?.blocks)
        ? config.blocks.filter((block: unknown): block is AutoBlockConfig => {
              if (!block || typeof block !== "object") {
                  return false;
              }
              const blockConfig = block as AutoBlockConfig;
              return Number.isInteger(Number(blockConfig.xCol)) &&
                  Array.isArray(blockConfig.yCols) &&
                  blockConfig.yCols.length > 0;
          })
        : [];
    if (blocks.length <= 1) {
        return await processFile(file, fileId, fileName, config, options);
    }

    const processedBlocks: Array<{
        readonly block: AutoBlockConfig;
        readonly blockIndex: number;
        readonly processed: ProcessedWorkerFile;
    }> = [];
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
        const blockConfig = buildBlockProcessConfig(config, blocks[blockIndex]);
        const blockProcessed = await processFile(
            file,
            fileId,
            fileName,
            blockConfig,
            options,
        );
        processedBlocks.push({ block: blocks[blockIndex], blockIndex, processed: blockProcessed });
    }

    const firstProcessed = processedBlocks[0]?.processed;
    if (!firstProcessed) {
        return await processFile(file, fileId, fileName, config, options);
    }

    const xGroups: Array<readonly number[] | Float64Array> = [];
    const series: ProcessedWorkerSeries[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const yColumns: unknown[] = [];
    const yColumnLabels: unknown[] = [];

    for (const entry of processedBlocks) {
        const groupOffset = xGroups.length;
        const blockProcessed = entry.processed;
        for (const xGroup of blockProcessed.xGroups ?? []) {
            xGroups.push(xGroup);
            for (const xVal of xGroup) {
                if (!Number.isFinite(xVal)) continue;
                if (xVal < minX) minX = xVal;
                if (xVal > maxX) maxX = xVal;
            }
        }
        for (const yCol of blockProcessed.y?.columns ?? []) {
            yColumns.push(yCol);
        }
        for (const label of blockProcessed.y?.columnLabels ?? []) {
            yColumnLabels.push(label);
        }
        for (const item of blockProcessed.series ?? []) {
            for (const yVal of item.y ?? []) {
                if (typeof yVal !== "number" || !Number.isFinite(yVal)) continue;
                if (yVal < minY) minY = yVal;
                if (yVal > maxY) maxY = yVal;
            }
            series.push({
                ...item,
                blockIndex: entry.blockIndex,
                id: `${item.id}_block${entry.blockIndex}`,
                groupIndex: Number(item.groupIndex) + groupOffset,
                name:
                    processedBlocks.length > 1 && item.name
                        ? `${item.name} [block ${entry.blockIndex + 1}]`
                        : item.name,
            });
        }
    }

    const [x0, x1] = padDomain(Number.isFinite(minX) ? minX : 0, Number.isFinite(maxX) ? maxX : 1);
    const [y0, y1] = padDomain(Number.isFinite(minY) ? minY : 0, Number.isFinite(maxY) ? maxY : 1);
    const processed = {
        ...firstProcessed,
        autoBlocks: blocks.map((block) => ({
            endCol: block.endCol ?? null,
            startCol: block.startCol ?? null,
            xCol: block.xCol,
            yCols: block.yCols,
        })),
        domain: { x: [x0, x1], y: [y0, y1] },
        legend: null,
        series,
        xGroups,
        y: {
            columns: yColumns,
            columnLabels: yColumnLabels,
        },
    };
    return processed;
};
workerScope.onmessage = async (event: MessageEvent<{
    readonly payload?: Record<string, unknown>;
    readonly type?: string;
}>) => {
    const { type, payload } = event.data ?? {};
    try {
        if (type === "preview") {
            // Backwards-compatible: acts as "previewInit" and returns preview metadata.
            const requestId = payload?.requestId ?? null;
            const file = payload?.file instanceof File ? payload.file : null;
            const fileId = payload?.fileId ?? null;
            const maxCacheRowsRaw = payload?.maxPreviewRows;
            if (!file)
                throw new Error("Missing file for preview.");
            const cache = await ensurePreviewCache(fileId, file, {
                // Keep using maxPreviewRows as "cacheRows" for compatibility; 0/null => all rows.
                maxCacheRows: maxCacheRowsRaw,
            });
            const seedEndRow = Math.min(cache.rowCount, PREVIEW_RESULT_SEED_ROWS);
            const seedRows = seedEndRow > 0 ? await getPreviewRows(cache, 0, seedEndRow) : [];
            workerScope.postMessage({
                type: "previewResult",
                payload: {
                    requestId,
                    fileId,
                    fileName: cache.fileName,
                    rowCount: cache.rowCount,
                    columnCount: cache.columnCount,
                    maxCellLengths: cache.maxCellLengths,
                    seedRows,
                    seedStartRow: 0,
                },
            });
            return;
        }
        if (type === "previewRows") {
            const requestId = payload?.requestId ?? null;
            const fileId = String(payload?.fileId ?? "");
            const startRowRaw = payload?.startRow;
            const endRowRaw = payload?.endRow;
            const cache = previewCacheByFileId.get(fileId);
            if (!cache)
                throw new Error("Preview cache not ready. Please init first.");
            const startRow = Math.max(0, Math.floor(Number(startRowRaw) || 0));
            const endRowNumber = Number(endRowRaw);
            const endRow = Math.max(startRow, Math.min(cache.rowCount, Math.floor(Number.isFinite(endRowNumber) && endRowNumber > 0
                ? endRowNumber
                : startRow + PREVIEW_ROW_CACHE_CHUNK_DEFAULT)));
            const rows = await getPreviewRows(cache, startRow, endRow);
            workerScope.postMessage({
                type: "previewRowsResult",
                payload: {
                    requestId,
                    fileId,
                    startRow,
                    rows,
                },
            });
            return;
        }
        if (type === "previewDispose") {
            const fileId = String(payload?.fileId ?? "");
            if (fileId)
                previewCacheByFileId.delete(fileId);
            workerScope.postMessage({
                type: "previewDisposeResult",
                payload: { fileId },
            });
            return;
        }
        if (type === "processFileAuto") {
            const shouldLogPerf = Boolean(payload?.perfEnabled) || isPerfEnabled();
            const finishAutoPerf = startPerf("worker:auto-config", {
                fileId: payload?.fileId ?? null,
                fileName: payload?.fileName ?? (payload?.file instanceof File ? payload.file.name : null),
            }, { force: shouldLogPerf });
            const jobId = payload?.jobId ?? null;
            const file = payload?.file instanceof File ? payload.file : null;
            const fileId = payload?.fileId ?? null;
            const fileName = String(payload?.fileName ?? file?.name ?? "Unknown file");
            const maxPointsRaw = Number(payload?.maxPoints);
            const maxPoints = Number.isFinite(maxPointsRaw)
                ? maxPointsRaw
                : DEFAULT_MAX_POINTS;
            if (!file)
                throw new Error("Missing file for processing.");
            if (!fileId)
                throw new Error("Missing fileId for processing.");
            const previewCache = await ensurePreviewCache(fileId, file, {
                maxCacheRows: AUTO_EXTRACTION_PREVIEW_ROWS,
            });
            const previewRowCount = Math.min(
                Number(previewCache.rowCount) || 0,
                AUTO_EXTRACTION_PREVIEW_ROWS,
            );
            const previewRows = previewRowCount > 0
                ? await getPreviewRows(previewCache, 0, previewRowCount)
                : [];
            const assessment = normalizeTemplateProcessingAssessment(payload?.assessment);
            if (!assessment) {
                throw new Error(`${fileName}: Auto extraction is waiting for assessment.`);
            }
            const autoExtraction = inferAutoExtraction({
                assessment,
                fileName: String(fileName),
                rows: previewRows,
                totalRowCount: previewCache.rowCount,
            });
            if (!autoExtraction.ok) {
                throw new Error(autoExtraction.message);
            }
            finishAutoPerf({
                rowCount: previewCache.rowCount,
                previewRows: previewRows.length,
            });
            const processed = await processAutoConfiguredFile(
                file,
                fileId,
                fileName,
                buildAutoWorkerConfig(autoExtraction.plan),
                {
                    assessment,
                    curveFilterKey: payload?.curveFilterKey ?? null,
                    curveFilterField: payload?.curveFilterField ?? null,
                    maxPoints,
                    perfEnabled: shouldLogPerf,
                },
            );
            const transfer = collectProcessedTransferables(processed);
            workerScope.postMessage({ type: "processResult", payload: { jobId, processed } }, transfer);
            return;
        }
        if (type === "processFile") {
            const shouldLogPerf = Boolean(payload?.perfEnabled) || isPerfEnabled();
            const jobId = payload?.jobId ?? null;
            const file = payload?.file instanceof File ? payload.file : null;
            const fileId = payload?.fileId ?? null;
            const fileName = String(payload?.fileName ?? file?.name ?? "Unknown file");
            const config = payload?.config && typeof payload.config === "object"
                ? payload.config as Record<string, unknown>
                : {};
            const maxPointsRaw = Number(payload?.maxPoints);
            const maxPoints = Number.isFinite(maxPointsRaw)
                ? maxPointsRaw
                : DEFAULT_MAX_POINTS;
            if (!file)
                throw new Error("Missing file for processing.");
            if (!fileId)
                throw new Error("Missing fileId for processing.");
            const processed = await processFile(file, fileId, fileName, config, {
                assessment: payload?.assessment ?? null,
                curveFilterKey: payload?.curveFilterKey ?? null,
                curveFilterField: payload?.curveFilterField ?? null,
                maxPoints,
                perfEnabled: shouldLogPerf,
            });
            const transfer = collectProcessedTransferables(processed);
            workerScope.postMessage({ type: "processResult", payload: { jobId, processed } }, transfer);
            return;
        }
        throw new Error(`Unknown worker message type: ${String(type)}`);
    }
    catch (err: unknown) {
        const errMeta = err as {
            messageKey?: unknown;
            messageParams?: unknown;
        };
        workerScope.postMessage({
            type: "workerError",
            payload: {
                requestId: payload?.requestId ?? null,
                jobId: payload?.jobId ?? null,
                fileId: payload?.fileId ?? null,
                fileName: payload?.fileName ?? (payload?.file instanceof File ? payload.file.name : null),
                message: err instanceof Error ? err.message : String(err),
                messageKey: typeof errMeta?.messageKey === "string"
                    ? errMeta.messageKey
                    : null,
                messageParams: errMeta?.messageParams &&
                    typeof errMeta.messageParams === "object"
                    ? errMeta.messageParams
                    : null,
            },
        });
    }
};
