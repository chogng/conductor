import path from "node:path";

const DEFAULT_MAX_POINTS = 600;
const PREPARE_BATCH_SIZE = 64;

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeRows = (value) =>
  Array.isArray(value)
    ? value.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? "")) : [])
    : [];

const normalizePositiveInteger = (value) => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
};

const normalizeNonNegativeInteger = (value) => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
};

const normalizeText = (value) => String(value ?? "").trim();

const getColumnCount = (rows) =>
  rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);

const parseNumberStrict = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const isNumericCell = (value) => parseNumberStrict(value) !== null;

const getRowNumericCount = (row) =>
  Array.isArray(row) ? row.filter(isNumericCell).length : 0;

const getHeaderRowIndex = (rows) => {
  for (let index = 0; index < rows.length - 1; index += 1) {
    const row = rows[index] ?? [];
    const next = rows[index + 1] ?? [];
    const nonEmpty = row.filter(cell => normalizeText(cell)).length;
    if (nonEmpty >= 2 && getRowNumericCount(next) >= 2) {
      return index;
    }
  }
  return 0;
};

const getDataStartRow = (rows, headerRowIndex) => {
  for (let index = Math.max(0, headerRowIndex + 1); index < rows.length; index += 1) {
    if (getRowNumericCount(rows[index] ?? []) >= 2) {
      return index;
    }
  }
  return rows.findIndex(row => getRowNumericCount(row) >= 2);
};

const getNumericColumns = (rows, dataStartRow, columnCount) => {
  const result = [];
  const sampleRows = rows.slice(Math.max(0, dataStartRow), Math.max(0, dataStartRow) + 64);
  for (let col = 0; col < columnCount; col += 1) {
    const numericCount = sampleRows.reduce(
      (count, row) => count + (isNumericCell(row?.[col]) ? 1 : 0),
      0,
    );
    if (numericCount >= Math.min(2, sampleRows.length || 2)) {
      result.push(col);
    }
  }
  return result;
};

const headerAt = (headers, col) => normalizeText(headers[col]).toLowerCase();

const headerContains = (headers, col, patterns) => {
  const text = headerAt(headers, col);
  return patterns.some(pattern => text.includes(pattern));
};

const resolveXColumn = ({ headers, numericColumns, tableModelSeed }) => {
  const xAxisRole = normalizeText(tableModelSeed?.xAxisRole).toLowerCase();
  if (xAxisRole === "vg") {
    const match = numericColumns.find(col => headerContains(headers, col, ["vg", "gate"]));
    if (match !== undefined) return match;
  }
  if (xAxisRole === "vd") {
    const match = numericColumns.find(col => headerContains(headers, col, ["vd", "drain"]));
    if (match !== undefined) return match;
  }
  const semanticMatch = numericColumns.find(col =>
    headerContains(headers, col, ["time", "freq", "frequency", "voltage", "vg", "vd"])
  );
  return semanticMatch ?? numericColumns[0];
};

const resolveYColumns = ({ headers, numericColumns, xCol }) => {
  const semantic = numericColumns.filter(col =>
    col !== xCol &&
    headerContains(headers, col, [
      "id",
      "ig",
      "current",
      "cap",
      "cp",
      "cs",
      "conduct",
      "y",
    ])
  );
  if (semantic.length) {
    return semantic;
  }
  return numericColumns.filter(col => col !== xCol);
};

const normalizeCurveType = (tableModelSeed) => {
  const text = normalizeText(
    tableModelSeed?.curveType ??
      tableModelSeed?.curveTypeLabel ??
      tableModelSeed?.curveFamily,
  ).toLowerCase();
  if (text.includes("transfer")) return "transfer";
  if (text.includes("output")) return "output";
  if (text.includes("cv")) return "cv";
  if (text.includes("cf")) return "cf";
  if (text.includes("pv")) return "pv";
  return undefined;
};

const getDefaultBottomTitle = (tableModelSeed, headers, xCol) => {
  const header = normalizeText(headers[xCol]);
  if (header) return header;
  if (normalizeText(tableModelSeed?.xAxisRole).toLowerCase() === "vg") return "Vg";
  if (normalizeText(tableModelSeed?.xAxisRole).toLowerCase() === "vd") return "Vd";
  const curveType = normalizeCurveType(tableModelSeed);
  if (curveType === "cf") return "Frequency";
  if (curveType === "cv" || curveType === "pv") return "Voltage";
  return "X";
};

const getDefaultLeftTitle = (tableModelSeed, headers, yCols) => {
  const firstYHeader = normalizeText(headers[yCols[0]]);
  if (firstYHeader) return firstYHeader;
  const curveType = normalizeCurveType(tableModelSeed);
  if (curveType === "cv" || curveType === "cf") return "Capacitance";
  if (curveType === "pv" || curveType === "transfer" || curveType === "output") return "Id";
  return "Y";
};

const getDefaultXUnit = (tableModelSeed) =>
  normalizeCurveType(tableModelSeed) === "cf" ? "Hz" : "V";

const getDefaultYUnit = (tableModelSeed) => {
  const curveType = normalizeCurveType(tableModelSeed);
  return curveType === "cf" || curveType === "cv" ? "F" : "A";
};

const readPreparedProcessConfig = (prepareResult) => {
  for (const key of ["processConfig", "config", "reviewedProcessConfig"]) {
    if (isObject(prepareResult?.[key])) {
      return prepareResult[key];
    }
  }
  return null;
};

const createProcessConfigFromPreview = (prepareResult) => {
  const rows = normalizeRows(prepareResult?.previewRows);
  if (!prepareResult?.ok || !rows.length) {
    return null;
  }

  const rowCount = normalizePositiveInteger(prepareResult.rowCount) ?? rows.length;
  const columnCount = normalizePositiveInteger(prepareResult.columnCount) ?? getColumnCount(rows);
  const headerRowIndex = getHeaderRowIndex(rows);
  const dataStartRow = getDataStartRow(rows, headerRowIndex);
  if (dataStartRow < 0) {
    return null;
  }

  const numericColumns = getNumericColumns(rows, dataStartRow, columnCount);
  if (numericColumns.length < 2) {
    return null;
  }

  const headers = rows[headerRowIndex] ?? [];
  const tableModelSeed = isObject(prepareResult.tableModelSeed)
    ? prepareResult.tableModelSeed
    : {};
  const xCol = resolveXColumn({ headers, numericColumns, tableModelSeed });
  const yCols = resolveYColumns({ headers, numericColumns, xCol });
  if (xCol === undefined || !yCols.length) {
    return null;
  }

  const endRow = Math.max(dataStartRow, rowCount - 1);
  return {
    autoCurveType: normalizeCurveType(tableModelSeed),
    bottomTitle: getDefaultBottomTitle(tableModelSeed, headers, xCol),
    endRow,
    leftTitle: getDefaultLeftTitle(tableModelSeed, headers, yCols),
    startRow: dataStartRow,
    xCol,
    xSegmentationMode: "auto",
    xUnit: getDefaultXUnit(tableModelSeed),
    yCols,
    yLegendTarget: yCols.length > 1 ? "yColumn" : "auto",
    yUnit: getDefaultYUnit(tableModelSeed),
  };
};

const createProcessConfigFromPrepareResult = (prepareResult) =>
  readPreparedProcessConfig(prepareResult) ?? createProcessConfigFromPreview(prepareResult);

export const createPrepareImportBatchRequests = (
  files,
  {
    batchSize = PREPARE_BATCH_SIZE,
    idStart = 1,
  } = {},
) => {
  const requests = [];
  for (let index = 0; index < files.length; index += batchSize) {
    const chunk = files.slice(index, index + batchSize);
    requests.push({
      command: "prepareImportBatch",
      entries: chunk.map(filePath => ({
        fileName: path.basename(filePath),
        path: filePath,
      })),
      id: idStart + requests.length,
    });
  }
  return requests;
};

export const collectPrepareResults = (prepareResponses) => {
  const results = [];
  for (const response of prepareResponses) {
    if (response?.ok && Array.isArray(response?.result?.results)) {
      results.push(...response.result.results);
    } else if (response?.ok && isObject(response?.result)) {
      results.push(response.result);
    } else {
      results.push({
        ok: false,
        message: response?.error?.message ?? "prepareImportBatch failed",
      });
    }
  }
  return results;
};

export const createProcessRequestFromPrepareResult = ({
  calculationCachePath,
  fileIdPrefix,
  filePath,
  index,
  maxPoints = DEFAULT_MAX_POINTS,
  prepareResult,
}) => {
  const fileId = `${fileIdPrefix}-${index}`;
  const config = createProcessConfigFromPrepareResult(prepareResult);
  return {
    command: "processFile",
    config,
    ...(calculationCachePath ? { calculationCachePath } : {}),
    fileId,
    fileName: normalizeText(prepareResult?.fileName) || path.basename(filePath),
    id: index + 1,
    maxPoints,
    path: filePath,
  };
};

export const createProcessRequestsFromPrepareResponses = ({
  calculationCachePaths,
  fileIdPrefix,
  files,
  maxPoints = DEFAULT_MAX_POINTS,
  prepareResponses,
}) => {
  const prepareResults = collectPrepareResults(prepareResponses);
  return files.map((filePath, index) =>
    createProcessRequestFromPrepareResult({
      calculationCachePath: calculationCachePaths?.[index],
      fileIdPrefix,
      filePath,
      index,
      maxPoints,
      prepareResult: prepareResults[index],
    })
  );
};
