import Papa from "papaparse";
import { normalizeDeviceAnalysisYUnit } from "../analysis/lib/deviceAnalysisUnits";

const DEFAULT_MAX_POINTS = 600;
const PREVIEW_ROW_CACHE_CHUNK_DEFAULT = 200;
const PREVIEW_INDEX_STRIDE_ROWS_DEFAULT = 2000;
const PREVIEW_MAX_CACHED_CHUNKS_PER_FILE = 30;
const PREVIEW_RESULT_SEED_ROWS = PREVIEW_ROW_CACHE_CHUNK_DEFAULT * 2;
type LocalizedError = Error & {
    messageKey?: string | null;
    messageParams?: Record<string, unknown> | null;
};
const workerScope = self as any;
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
const previewCacheByFileId = new Map();
const getExcelColumnLabel = (index: any) => {
    let label = "";
    let i = index;
    while (i >= 0) {
        label = String.fromCharCode(65 + (i % 26)) + label;
        i = Math.floor(i / 26) - 1;
    }
    return label;
};
const parseNumberStrict = (raw: any): number | null => {
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
const createLocalizedError = (messageKey: any, messageParams: any, fallbackMessage: any): LocalizedError => {
    const err = new Error(fallbackMessage || String(messageKey || "Unknown error")) as LocalizedError;
    err.messageKey = typeof messageKey === "string" ? messageKey : null;
    err.messageParams =
        messageParams && typeof messageParams === "object" ? messageParams : null;
    return err;
};
const padDomain = (min: any, max: any) => {
    if (!Number.isFinite(min) || !Number.isFinite(max))
        return [0, 1];
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (lo === hi) {
        const pad = lo === 0 ? 1 : Math.abs(lo) * 0.05;
        return [lo - pad, hi + pad];
    }
    const span = hi - lo;
    const pad = span * 0.05;
    return [lo - pad, hi + pad];
};
function touchChunk(cache: any, chunkStart: any) {
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
function setChunk(cache: any, chunkStart: any, rows: any) {
    cache.chunkCache.set(chunkStart, rows);
    touchChunk(cache, chunkStart);
}
function findBaseCursor(cache: any, targetRow: any) {
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
function insertRowStartCursor(cache: any, rowIndexRaw: any, cursorRaw: any) {
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
const readCsvCellNumber = async (file: any, rowIndex: any, colIndex: any): Promise<number | null> => {
    const targetRow = Number(rowIndex);
    const targetCol = Number(colIndex);
    if (!Number.isInteger(targetRow) || targetRow < 0) {
        throw new Error("Invalid cell row index");
    }
    if (!Number.isInteger(targetCol) || targetCol < 0) {
        throw new Error("Invalid cell column index");
    }
    return await new Promise<number | null>((resolve: any, reject: any) => {
        let currentRowIndex = -1;
        let done = false;
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            step: (results: any, parser: any) => {
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
            error: (err: any) => {
                if (done)
                    return;
                done = true;
                reject(err);
            },
        });
    });
};
const buildUniformSampleIndices = (length: any, target: any) => {
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
const buildPreviewMetadataAndIndex = async (file: any, { indexStrideRows = PREVIEW_INDEX_STRIDE_ROWS_DEFAULT, warmCacheRows = PREVIEW_ROW_CACHE_CHUNK_DEFAULT * 4, }: any = {}) => {
    const stride = Math.max(200, Math.floor(Number(indexStrideRows) || 0));
    const warmRows = Math.max(0, Math.floor(Number(warmCacheRows) || 0));
    let rowCount = 0;
    let columnCount = 0;
    let maxCellLengths: number[] = [];
    const rowStartCursors = [{ rowIndex: 0, cursor: 0 }];
    const chunkCache = new Map();
    await new Promise((resolve: any, reject: any) => {
        let done = false;
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            step: (results: any) => {
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
            error: (err: any) => {
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
    const chunkLru = Array.from(chunkCache.keys()).sort((a: any, b: any) => a - b);
    return {
        rowCount,
        columnCount,
        maxCellLengths,
        rowStartCursors,
        chunkCache,
        chunkLru,
    };
};
const ensurePreviewCache = async (fileId: any, file: any, { indexStrideRows, maxCacheRows }: any = {}) => {
    if (!fileId)
        throw new Error("Missing fileId for preview cache.");
    if (!file)
        throw new Error("Missing file for preview cache.");
    const existing = previewCacheByFileId.get(fileId);
    if (existing &&
        existing.fileName === file.name &&
        existing.fileSize === file.size &&
        existing.lastModified === file.lastModified) {
        return existing;
    }
    // Backwards-compat: callers historically used maxCacheRows=0 to mean "cache everything".
    // We now keep only a small warm cache, and rely on a sparse row index for fast random access.
    const warmCacheRows = Number.isFinite(maxCacheRows) && maxCacheRows > 0
        ? Math.min(5000, Math.floor(maxCacheRows))
        : PREVIEW_ROW_CACHE_CHUNK_DEFAULT * 4;
    const meta = await buildPreviewMetadataAndIndex(file, {
        indexStrideRows: Number.isFinite(indexStrideRows) && indexStrideRows > 0
            ? indexStrideRows
            : PREVIEW_INDEX_STRIDE_ROWS_DEFAULT,
        warmCacheRows,
    });
    const stride = Number.isFinite(indexStrideRows) && indexStrideRows > 0
        ? Math.max(200, Math.floor(indexStrideRows))
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
    previewCacheByFileId.set(fileId, next);
    return next;
};
function enqueueParse(cache: any, task: any) {
    const next = cache.parseQueue.then(task, task);
    cache.parseQueue = next.then(() => undefined, () => undefined);
    return next;
}
async function parsePreviewRowsRange(cache: any, startRow: any, endRow: any) {
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
    return await new Promise((resolve: any, reject: any) => {
        let currentRowIndex = baseRowIndex;
        let collected = 0;
        const rows: any[] = [];
        let done = false;
        Papa.parse(blob, {
            header: false,
            skipEmptyLines: true,
            step: (results: any, parser: any) => {
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
            error: (err: any) => {
                if (done)
                    return;
                done = true;
                reject(err);
            },
        });
    });
}
async function ensureChunk(cache: any, chunkStart: any, chunkEnd: any) {
    const start = Math.max(0, Math.floor(Number(chunkStart) || 0));
    if (cache.chunkCache.has(start)) {
        touchChunk(cache, start);
        return cache.chunkCache.get(start);
    }
    if (cache.inflightChunks.has(start)) {
        return await cache.inflightChunks.get(start);
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
async function getPreviewRows(cache: any, startRow: any, endRow: any) {
    const total = Math.max(0, Math.floor(Number(cache.rowCount) || 0));
    const start = Math.max(0, Math.min(total, Math.floor(Number(startRow) || 0)));
    const end = Math.max(start, Math.min(total, Math.floor(Number(endRow) || start)));
    if (end <= start)
        return [];
    const chunkSize = PREVIEW_ROW_CACHE_CHUNK_DEFAULT;
    let cursor = Math.floor(start / chunkSize) * chunkSize;
    const rows: any[] = [];
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
const processFile = async (file: any, fileId: any, fileName: any, config: any, { maxPoints }: any) => {
    const xCol = Number(config?.xCol);
    const startRow = Number(config?.startRow);
    const endRowRaw = config?.endRow;
    let groupSize = Number(config?.groupSize);
    let groups = Number(config?.groups);
    const yCols = Array.isArray(config?.yCols) ? config.yCols.map(Number) : [];
    const groupSizeCell = config?.groupSizeCell ?? null;
    const yLegendStartCell = config?.yLegendStartCell ?? null;
    const yLegendStartValueRaw = config?.yLegendStartValue ?? null;
    const yLegendCountCell = config?.yLegendCountCell ?? null;
    const yLegendStepCell = config?.yLegendStepCell ?? null;
    const yLegendCountRaw = config?.yLegendCount ?? null;
    const yLegendStepRaw = config?.yLegendStep ?? null;
    /* New helper to read specific cell as string */
    const readCsvCellString = async (file: any, rowIndex: any, colIndex: any): Promise<string> => {
        const targetRow = Number(rowIndex);
        const targetCol = Number(colIndex);
        if (!Number.isInteger(targetRow) || targetRow < 0)
            throw new Error("Invalid cell row index");
        if (!Number.isInteger(targetCol) || targetCol < 0)
            throw new Error("Invalid cell column index");
        return await new Promise<string>((resolve: any, reject: any) => {
            let currentRowIndex = -1;
            let done = false;
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                step: (results: any, parser: any) => {
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
                error: (err: any) => {
                    if (done)
                        return;
                    done = true;
                    reject(err);
                },
            });
        });
    };
    /* Helper to resolve keyword from config (literal or cell ref) */
    const resolveKeyword = async (input: any) => {
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
    const yUnitRaw = normalizeDeviceAnalysisYUnit(config?.yUnit, "");
    const fileNameVgKeywordsRaw = config?.fileNameVgKeywords;
    const fileNameVdKeywordsRaw = config?.fileNameVdKeywords;
    const appendAxisUnit = (labelRaw: any, unitRaw: any) => {
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
    const splitKeywordList = (raw: any) => String(raw ?? "")
        .split(/[,;\n]+/)
        .map((token: any) => token.trim())
        .filter(Boolean);
    const fileNameVgKeywords = splitKeywordList(fileNameVgKeywordsRaw).map((t: any) => t.toLowerCase());
    const fileNameVdKeywords = splitKeywordList(fileNameVdKeywordsRaw).map((t: any) => t.toLowerCase());
    const useFileNameMapping = fileNameVgKeywords.length > 0 || fileNameVdKeywords.length > 0;
    // Resolve potentially dynamic keywords
    const bottomTitle = await resolveKeyword(bottomTitleRaw);
    const leftTitle = await resolveKeyword(leftTitleRaw);
    const legendPrefix = await resolveKeyword(legendPrefixRaw);
    const detectVarToken = (raw: any) => {
        const text = String(raw ?? "").trim().toLowerCase();
        if (!text)
            return null;
        const hasVg = /(^|[^a-z0-9])v[_-]?g(s|[^a-z0-9]|$)/.test(text);
        const hasVd = /(^|[^a-z0-9])v[_-]?d(s|[^a-z0-9]|$)/.test(text);
        if (hasVg && !hasVd)
            return "vg";
        if (hasVd && !hasVg)
            return "vd";
        return null;
    };
    // Deterministic curve tagging:
    // - file-name mode: use file-name keywords only
    // - var mode: use Var1 token only (Var2 is display-only)
    const var1Token = detectVarToken(bottomTitle);
    const var2Token = detectVarToken(legendPrefix);
    let curveType = null;
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
    if (!yCols.length || yCols.some((c: any) => !Number.isInteger(c) || c < 0)) {
        throw new Error("Invalid config: yCols");
    }
    if (endRow === null) {
        throw new Error("Invalid config: endRow");
    }
    const expectedTotal = endRow - startRow + 1;
    if (groupSizeCell && typeof groupSizeCell === "object") {
        const cellRow = Number(groupSizeCell?.rowIndex);
        const cellCol = Number(groupSizeCell?.colIndex);
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
        catch (err: any) {
            throw new Error(`${fileName}: Unable to read points cell ${cellRef} (${err?.message || "unknown error"}).`);
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
    if (!Number.isInteger(groupSize) || groupSize <= 0) {
        throw new Error("Invalid config: groupSize");
    }
    if (!Number.isInteger(groups) || groups <= 0) {
        throw new Error("Invalid config: groups");
    }
    const formatLegendValue = (raw: any) => {
        if (raw === null || raw === undefined)
            return null;
        if (typeof raw === "number") {
            return Number.isFinite(raw) ? String(raw) : null;
        }
        const text = String(raw).trim();
        return text ? text : null;
    };
    const formatGeneratedLegendValue = (value: any) => {
        if (!Number.isFinite(value))
            return null;
        const normalized = Number(value.toPrecision(12));
        return Number.isFinite(normalized) ? String(normalized) : null;
    };
    const tryReadPositiveIntegerCell = async (cell: any): Promise<number | null> => {
        if (!cell || typeof cell !== "object")
            return null;
        const cellRow = Number(cell?.rowIndex);
        const cellCol = Number(cell?.colIndex);
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
    const tryReadPositiveNumberCell = async (cell: any): Promise<number | null> => {
        if (!cell || typeof cell !== "object")
            return null;
        const cellRow = Number(cell?.rowIndex);
        const cellCol = Number(cell?.colIndex);
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
    const normalizePositiveInteger = (raw: any): number | null => {
        if (raw === null || raw === undefined || raw === "")
            return null;
        const num = Number(raw);
        if (!Number.isInteger(num) || num <= 0)
            return null;
        return num;
    };
    const normalizePositiveNumber = (raw: any): number | null => {
        if (raw === null || raw === undefined || raw === "")
            return null;
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0)
            return null;
        return num;
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
        const startLegendRow = Number(yLegendStartCell?.rowIndex);
        const startLegendCol = Number(yLegendStartCell?.colIndex);
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
            const yCount = yCols.length;
            const gCount = groups;
            let mode: "yCol" | "group" | null = null;
            let count: number | null = desiredCount;
            if (Number.isInteger(count) && Number(count) > 0) {
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
            else {
                if (gCount === 1) {
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
            }
            const maxCount = mode === "group" ? gCount : yCount;
            const finalCount = Number.isInteger(count) && Number(count) > 0
                ? Math.min(Number(count), maxCount)
                : 0;
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
        const yCount = yCols.length;
        const gCount = groups;
            let mode: "yCol" | "group" | null = null;
            let count: number | null = desiredCount;
        if (Number.isInteger(count) && Number(count) > 0) {
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
        else {
            if (gCount === 1) {
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
        }
        const maxCount = mode === "group" ? gCount : yCount;
        const finalCount = Number.isInteger(count) && Number(count) > 0
            ? Math.min(Number(count), maxCount)
            : 0;
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
    await new Promise((resolve: any, reject: any) => {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            step: (results: any, parser: any) => {
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
            error: (err: any) => reject(err),
        });
    });
    if (seenRowsInRange !== expectedTotal) {
        throw new Error(`${fileName}: X end row (${endRow + 1}) exceeds total parsed rows (${currentRowIndex + 1}).`);
    }
    // Finalize curveType and labels.
    // Modes:
    // - file-name mapping: ONLY use user-provided keywords (exclusive)
    // - var mode: use Var1 only (Var2 does not affect curveType)
    if (useFileNameMapping) {
        if (fileNameVgKeywords.length === 0 || fileNameVdKeywords.length === 0) {
            throw new Error(`${fileName}: Invalid template config: file-name keywords must be provided for both Vg and Vd.`);
        }
        const lowerName = String(fileName ?? "").toLowerCase();
        const vgHits = fileNameVgKeywords.filter((token: any) => token && lowerName.includes(token));
        const vdHits = fileNameVdKeywords.filter((token: any) => token && lowerName.includes(token));
        if (vgHits.length > 0 && vdHits.length === 0) {
            curveType = "vg";
        }
        else if (vdHits.length > 0 && vgHits.length === 0) {
            curveType = "vd";
        }
        else if (vgHits.length > 0 && vdHits.length > 0) {
            throw new Error(`${fileName}: File-name tagging is ambiguous (matches both Vg and Vd). Vg hits: ${vgHits.join(", ")}; Vd hits: ${vdHits.join(", ")}.`);
        }
        else {
            throw new Error(`${fileName}: Unable to tag curve type from file name. Please add keywords for Vg/Vd in the template.`);
        }
    }
    else {
        curveType = var1Token ?? null;
    }
    const legendVarToken = var2Token;
    let effectiveBottomTitle = bottomTitle;
    let effectiveLegendPrefix = legendPrefix;
    const targetPoints = Math.min(groupSize, Math.max(2, Number.isFinite(maxPoints) ? maxPoints : DEFAULT_MAX_POINTS));
    const sampleIdx = buildUniformSampleIndices(groupSize, targetPoints);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const xGroups = [];
    const series = [];
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
    return {
        fileId,
        fileName,
        legend: yLegendMode
            ? {
                mode: yLegendMode,
                labels: yLegendLabels,
                prefix: effectiveLegendPrefix || null,
                varToken: legendVarToken || null,
            }
            : null,
        curveType,
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
        yUnit: yUnitRaw,
        y: {
            columns: yCols,
            columnLabels: yCols.map(getExcelColumnLabel),
        },
        xGroups,
        series,
        domain,
    };
};
workerScope.onmessage = async (event: any) => {
    const { type, payload } = event.data ?? {};
    try {
        if (type === "preview") {
            // Backwards-compatible: acts as "previewInit" and returns preview metadata.
            const requestId = payload?.requestId ?? null;
            const file = payload?.file ?? null;
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
            const fileId = payload?.fileId ?? null;
            const startRowRaw = payload?.startRow;
            const endRowRaw = payload?.endRow;
            const cache = previewCacheByFileId.get(fileId);
            if (!cache)
                throw new Error("Preview cache not ready. Please init first.");
            const startRow = Math.max(0, Math.floor(Number(startRowRaw) || 0));
            const endRow = Math.max(startRow, Math.min(cache.rowCount, Math.floor(Number.isFinite(endRowRaw) && endRowRaw > 0
                ? endRowRaw
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
            const fileId = payload?.fileId ?? null;
            if (fileId)
                previewCacheByFileId.delete(fileId);
            workerScope.postMessage({
                type: "previewDisposeResult",
                payload: { fileId },
            });
            return;
        }
        if (type === "processFile") {
            const jobId = payload?.jobId ?? null;
            const file = payload?.file ?? null;
            const fileId = payload?.fileId ?? null;
            const fileName = payload?.fileName ?? file?.name ?? "Unknown file";
            const config = payload?.config ?? {};
            const maxPoints = Number.isFinite(payload?.maxPoints)
                ? payload.maxPoints
                : DEFAULT_MAX_POINTS;
            if (!file)
                throw new Error("Missing file for processing.");
            if (!fileId)
                throw new Error("Missing fileId for processing.");
            const processed = await processFile(file, fileId, fileName, config, {
                maxPoints,
            });
            const transfer = [];
            for (const xArr of processed.xGroups)
                transfer.push(xArr.buffer);
            for (const s of processed.series)
                transfer.push(s.y.buffer);
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
                fileName: payload?.fileName ?? payload?.file?.name ?? null,
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
