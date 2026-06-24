import path from "node:path";
import { builtinRecipes } from "../../src/cs/workbench/services/recipe/common/builtinRecipes.generated.ts";
import { createRecipeSnapshot } from "../../src/cs/workbench/services/recipe/common/recipeCodec.ts";
import { createRawTableFactsRecordFromImportSeed } from "../../src/cs/workbench/services/tableFacts/common/tableFactsRecord.ts";
import { createRawTableFactsFromRecord } from "../../src/cs/workbench/services/tableFacts/common/tableFacts.ts";
import { deriveRecipeTemplateDrafts } from "../../src/cs/workbench/services/template/common/recipeTemplateMaterializer.ts";

const DEFAULT_MAX_POINTS = 600;
const PREPARE_BATCH_SIZE = 64;
const recipeSnapshot = createRecipeSnapshot(builtinRecipes, 1);

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizePositiveInteger = (value) => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
};

const normalizeNonNegativeInteger = (value) => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
};

const normalizeRows = (value) =>
  Array.isArray(value)
    ? value.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? "")) : [])
    : [];

const getColumnCount = (rows) =>
  rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);

const normalizeCurveType = (tableFactsSeed) => {
  const text = String(tableFactsSeed?.curveType ?? tableFactsSeed?.curveFamily ?? "")
    .trim()
    .toLowerCase();
  if (text.includes("transfer")) return "transfer";
  if (text.includes("output")) return "output";
  if (text.includes("cv")) return "cv";
  if (text.includes("cf")) return "cf";
  if (text.includes("pv")) return "pv";
  return undefined;
};

const getDefaultBottomTitle = (tableFactsSeed) => {
  if (tableFactsSeed?.xAxisRole === "vg") return "Vg";
  if (tableFactsSeed?.xAxisRole === "vd") return "Vd";
  const curveFamily = String(tableFactsSeed?.curveFamily ?? "").toLowerCase();
  if (curveFamily === "cf") return "Frequency";
  if (curveFamily === "cv" || curveFamily === "pv") return "Voltage";
  return "X";
};

const getDefaultLeftTitle = (tableFactsSeed) => {
  const curveFamily = String(tableFactsSeed?.curveFamily ?? "").toLowerCase();
  if (curveFamily === "cv" || curveFamily === "cf") return "Capacitance";
  if (curveFamily === "pv" || curveFamily === "iv") return "Id";
  return "Y";
};

const getRowRangeEnd = (value) =>
  value === "end" ? "end" : normalizeNonNegativeInteger(value);

const getSegmentationFields = (segmentation, startRow, endRow) => {
  if (segmentation?.kind === "fixedPoints") {
    const points = normalizePositiveInteger(segmentation.pointsPerGroup);
    const total = typeof endRow === "number" ? endRow - startRow + 1 : undefined;
    return {
      groupSize: points,
      groups: points && total && total % points === 0 ? total / points : undefined,
      xSegmentationMode: points ? "points" : "auto",
    };
  }

  if (segmentation?.kind === "fixedSegments") {
    const segmentCount = normalizePositiveInteger(segmentation.segmentCount);
    return {
      segmentCount,
      xSegmentationMode: segmentCount ? "segments" : "auto",
    };
  }

  return {
    xSegmentationMode: "auto",
  };
};

const createBlockProcessConfig = (block, tableFactsSeed, { extendToEnd = false } = {}) => {
  const xCol = normalizeNonNegativeInteger(block?.x?.ranges?.[0]?.column ?? block?.x?.columns?.[0]);
  const yCols = Array.isArray(block?.y?.columns)
    ? block.y.columns.map(normalizeNonNegativeInteger).filter(value => value !== undefined)
    : [];
  const startRow = normalizeNonNegativeInteger(block?.rowRange?.startRow) ?? 0;
  const endRow = extendToEnd ? "end" : getRowRangeEnd(block?.rowRange?.endRow) ?? "end";
  if (xCol === undefined || !yCols.length) {
    return null;
  }

  const legendTarget = block?.legend?.target === "group" || block?.legend?.target === "yColumn"
    ? block.legend.target
    : "auto";

  return {
    autoCurveType: normalizeCurveType(tableFactsSeed),
    bottomTitle: block?.titles?.bottom || getDefaultBottomTitle(tableFactsSeed),
    endRow,
    leftTitle: block?.titles?.left || getDefaultLeftTitle(tableFactsSeed),
    legendPrefix: block?.legend?.prefix ?? "",
    startRow,
    xCol,
    xUnit: block?.x?.unit || (String(tableFactsSeed?.curveFamily ?? "").toLowerCase() === "cf" ? "Hz" : "V"),
    yCols,
    yLegendCount: legendTarget === "yColumn" ? yCols.length : undefined,
    yLegendTarget: legendTarget,
    yUnit: block?.y?.unit || (String(tableFactsSeed?.curveFamily ?? "").toLowerCase() === "cf" || String(tableFactsSeed?.curveFamily ?? "").toLowerCase() === "cv" ? "F" : "A"),
    ...getSegmentationFields(block?.segmentation, startRow, endRow),
  };
};

const createRustProcessConfigFromTemplate = (template, tableFactsSeed, { rowCount } = {}) => {
  const templateBlocks = Array.isArray(template?.blocks) ? template.blocks : [];
  const firstEndRow = getRowRangeEnd(templateBlocks[0]?.rowRange?.endRow);
  const shouldExtendSingleBlockToEnd =
    templateBlocks.length === 1 &&
    typeof firstEndRow === "number" &&
    normalizePositiveInteger(rowCount) !== undefined &&
    firstEndRow < rowCount - 1;
  const blocks = Array.isArray(template?.blocks)
    ? template.blocks
        .map(block => createBlockProcessConfig(block, tableFactsSeed, {
          extendToEnd: shouldExtendSingleBlockToEnd,
        }))
        .filter(Boolean)
    : [];
  if (!blocks.length) {
    return null;
  }

  return {
    ...blocks[0],
    ...(blocks.length > 1 ? { blocks } : {}),
  };
};

const materializeProcessConfig = ({ filePath, fileId, prepareResult }) => {
  if (!prepareResult?.ok || !isObject(prepareResult.tableFactsSeed)) {
    return null;
  }

  const rows = normalizeRows(prepareResult.previewRows);
  const fileName = String(prepareResult.fileName || path.basename(filePath));
  const columnCount = normalizePositiveInteger(prepareResult.columnCount) ?? getColumnCount(rows);
  const rowCount = normalizePositiveInteger(prepareResult.rowCount) ?? rows.length;
  const rawTableId = `${fileId}:table`;
  const record = createRawTableFactsRecordFromImportSeed({
    columnCount,
    fileId,
    fileName,
    rawTableId,
    rowCount,
    rows,
    sourceRawTableVersion: 1,
    tableFactsSeed: prepareResult.tableFactsSeed,
  });
  const tableFacts = createRawTableFactsFromRecord(record, {
    columnCount,
    fileId,
    fileName,
    rawTableId,
    rowCount,
    sourceRawTableVersion: 1,
  });
  const draft = deriveRecipeTemplateDrafts({ tableFacts, recipeSnapshot })[0];
  return draft
    ? createRustProcessConfigFromTemplate(draft.template, prepareResult.tableFactsSeed, { rowCount })
    : null;
};

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
  let config = null;
  try {
    config = materializeProcessConfig({ fileId, filePath, prepareResult });
  } catch {
    config = null;
  }

  return {
    command: "processFile",
    config,
    ...(calculationCachePath ? { calculationCachePath } : {}),
    fileId,
    fileName: String(prepareResult?.fileName || path.basename(filePath)),
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
