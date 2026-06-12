/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

type TablePreviewRequest = {
  readonly file?: File;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly maxSeedRows?: number;
  readonly requestId?: number;
  readonly sheetId?: string | null;
  readonly sheetName?: string | null;
  readonly sourceKey?: string;
};

type TableRowsRequest = {
  readonly endRow?: number;
  readonly fileId?: string;
  readonly requestId?: number;
  readonly sourceKey?: string;
  readonly startRow?: number;
};

type WorkerRequest =
  | { readonly type: "tablePreview"; readonly payload?: TablePreviewRequest }
  | { readonly type: "tableRows"; readonly payload?: TableRowsRequest };

const rowsBySourceKey = new Map<string, unknown[][]>();

const toInteger = (value: unknown, fallback: number): number => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getSourceKey = (payload: {
  readonly fileId?: string;
  readonly sourceKey?: string;
}): string => {
  const sourceKey = String(payload.sourceKey ?? "").trim();
  if (sourceKey) {
    return sourceKey;
  }

  return String(payload.fileId ?? "").trim();
};

const normalizeRows = (rows: unknown[]): unknown[][] =>
  rows.map(row => Array.isArray(row) ? row : [row]);

const getMaxCellLengths = (rows: readonly unknown[][]): number[] => {
  const lengths: number[] = [];
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const length = String(row[index] ?? "").length;
      lengths[index] = Math.max(lengths[index] ?? 0, length);
    }
  }

  return lengths;
};

const postError = (requestId: number, error: unknown): void => {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Failed to parse preview rows.";

  self.postMessage({
    type: "workerError",
    payload: {
      requestId,
      message,
    },
  });
};

const handleTablePreview = async (payload: TablePreviewRequest = {}): Promise<void> => {
  const requestId = toInteger(payload.requestId, 0);
  try {
    const sourceKey = getSourceKey(payload);
    const file = payload.file;
    if (!sourceKey || !(file instanceof File)) {
      throw new Error("Preview file is unavailable.");
    }

    const text = await file.text();
    const parsed = Papa.parse<unknown[]>(text, {
      skipEmptyLines: false,
    });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      throw new Error(parsed.errors[0].message);
    }

    const rows = normalizeRows(parsed.data);
    const maxSeedRows = Math.max(0, toInteger(payload.maxSeedRows, rows.length));
    const seedRows = rows.slice(0, maxSeedRows);
    const maxCellLengths = getMaxCellLengths(rows);
    rowsBySourceKey.set(sourceKey, rows);

    self.postMessage({
      type: "tablePreviewResult",
      payload: {
        requestId,
        fileId: String(payload.fileId ?? sourceKey),
        fileName: String(payload.fileName ?? file.name ?? ""),
        sheetId: payload.sheetId ?? null,
        sheetName: payload.sheetName ?? null,
        sourceKey,
        rowCount: rows.length,
        columnCount: maxCellLengths.length,
        maxCellLengths,
        seedStartRow: 0,
        seedRows,
      },
    });
  } catch (error) {
    postError(requestId, error);
  }
};

const handleTableRows = (payload: TableRowsRequest = {}): void => {
  const requestId = toInteger(payload.requestId, 0);
  try {
    const sourceKey = getSourceKey(payload);
    const rows = rowsBySourceKey.get(sourceKey) ?? [];
    const startRow = Math.max(0, toInteger(payload.startRow, 0));
    const endRow = Math.max(startRow, toInteger(payload.endRow, startRow));

    self.postMessage({
      type: "tableRowsResult",
      payload: {
        requestId,
        fileId: String(payload.fileId ?? sourceKey),
        sourceKey,
        startRow,
        rows: rows.slice(startRow, endRow),
      },
    });
  } catch (error) {
    postError(requestId, error);
  }
};

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const message = event.data;
  if (message?.type === "tablePreview") {
    void handleTablePreview(message.payload);
    return;
  }

  if (message?.type === "tableRows") {
    handleTableRows(message.payload);
  }
};
