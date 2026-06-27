import path from "node:path";
import { builtinRecipes } from "../../src/cs/workbench/services/recipe/common/builtinRecipes.generated.ts";
import { createRecipeSnapshot } from "../../src/cs/workbench/services/recipe/common/recipeCodec.ts";
import { deriveRecipeTableReviewCandidates } from "../../src/cs/workbench/services/review/common/reviewCandidate.ts";
import { scoreTableReviewCandidates } from "../../src/cs/workbench/services/review/common/reviewScoring.ts";
import {
  createColumnProfiles,
  createMeasurementColumnProfile,
} from "../../src/cs/workbench/services/tableModel/common/columnProfile.ts";
import {
  createTableModelReasonDiagnosticCodes,
  createTableModelReasonDiagnostics,
} from "../../src/cs/workbench/services/tableModel/common/diagnostics.ts";
import {
  detectLayoutCandidates,
} from "../../src/cs/workbench/services/tableModel/common/layoutCandidate.ts";
import {
  createMeasurementBlockId,
  detectMeasurementBlocks,
} from "../../src/cs/workbench/services/tableModel/common/blockDetector.ts";
import {
  detectRawTableStructure,
} from "../../src/cs/workbench/services/tableModel/common/rawTableStructure.ts";
import {
  createColumnSemanticCandidates,
} from "../../src/cs/workbench/services/tableModel/common/semanticCandidate.ts";

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

const normalizeCurveType = (prepareSeed) => {
  const text = String(prepareSeed?.curveType ?? prepareSeed?.curveFamily ?? "")
    .trim()
    .toLowerCase();
  if (text.includes("transfer")) return "transfer";
  if (text.includes("output")) return "output";
  if (text.includes("cv")) return "cv";
  if (text.includes("cf")) return "cf";
  if (text.includes("pv")) return "pv";
  return undefined;
};

const normalizeMeasurementFamily = (prepareSeed) => {
  const family = String(prepareSeed?.curveFamily ?? "").trim().toLowerCase();
  if (family === "iv" || family === "cv" || family === "cf" || family === "pv" || family === "it") {
    return family;
  }

  const curveType = normalizeCurveType(prepareSeed);
  if (curveType === "transfer" || curveType === "output") return "iv";
  if (curveType === "cv" || curveType === "cf" || curveType === "pv") return curveType;
  return "unknown";
};

const normalizeIvMode = (prepareSeed) => {
  const explicit = String(prepareSeed?.ivMode ?? "").trim().toLowerCase();
  if (explicit === "transfer" || explicit === "output") return explicit;

  const curveType = normalizeCurveType(prepareSeed);
  return curveType === "transfer" || curveType === "output" ? curveType : "unknown";
};

const normalizeCurveTypeConfidence = (value) => {
  const confidence = String(value ?? "").trim().toLowerCase();
  return confidence === "high" || confidence === "medium" || confidence === "low"
    ? confidence
    : "low";
};

const normalizeAxisRole = (value) => {
  const role = String(value ?? "").trim().toLowerCase();
  return role === "vg" || role === "vd" ? role : null;
};

const normalizeAxisRoleSource = (value) => {
  const source = String(value ?? "").trim();
  return (
    source === "filename" ||
    source === "hint" ||
    source === "label" ||
    source === "metadata" ||
    source === "schemaProfile" ||
    source === "shape"
  )
    ? source
    : null;
};

const createTableModelSeedFromPrepareSeed = (prepareSeed) => {
  const curveFamily = normalizeMeasurementFamily(prepareSeed);
  const curveType = String(
    prepareSeed?.curveType ??
      prepareSeed?.curveTypeLabel ??
      prepareSeed?.curveFamily ??
      "",
  ).trim() || null;
  const curveTypeReasons = Array.isArray(prepareSeed?.curveTypeReasons)
    ? prepareSeed.curveTypeReasons.map(reason => String(reason ?? "")).filter(Boolean)
    : Array.isArray(prepareSeed?.reasons)
      ? prepareSeed.reasons.map(reason => String(reason ?? "")).filter(Boolean)
      : [];

  return {
    curveFamily,
    curveType,
    curveTypeConfidence: normalizeCurveTypeConfidence(
      prepareSeed?.curveTypeConfidence ?? prepareSeed?.confidence,
    ),
    curveTypeNeedsReview: Boolean(prepareSeed?.curveTypeNeedsReview ?? prepareSeed?.needsReview),
    curveTypeReasons,
    ivMode: curveFamily === "iv" ? normalizeIvMode(prepareSeed) : null,
    xAxisRole: normalizeAxisRole(prepareSeed?.xAxisRole),
    xAxisRoleSource: normalizeAxisRoleSource(prepareSeed?.xAxisRoleSource),
  };
};

const getTableModelConfidenceScore = (tableModelSeed) => {
  switch (tableModelSeed.curveTypeConfidence) {
    case "high":
      return 0.9;
    case "medium":
      return 0.6;
    case "low":
    default:
      return 0.3;
  }
};

const createTableModelRecordFromPrepareSeed = ({
  columnCount,
  fileId,
  fileName,
  rawTableId,
  rowCount,
  rows,
  tableModelSeed: prepareSeed,
}) => {
  const tableModelSeed = createTableModelSeedFromPrepareSeed(prepareSeed);
  const diagnosticCodes = createTableModelReasonDiagnosticCodes(tableModelSeed.curveTypeReasons);
  const structure = detectRawTableStructure(rows);
  const columnProfiles = createColumnProfiles({
    rows,
    structure,
  });
  const layoutCandidates = detectLayoutCandidates({
    columnProfiles,
    structure,
  });
  const semanticCandidates = createColumnSemanticCandidates({
    columnProfiles,
    tableModelSeed,
  });
  const columnProfile = createMeasurementColumnProfile({
    columnProfiles,
    rows,
    semanticCandidates,
    structure,
    tableModelSeed,
  });
  const blocks = detectMeasurementBlocks({
    columnCount,
    columnProfile,
    diagnosticCodes,
    fileId,
    fileName,
    rawTableId,
    rowCount,
    structure,
    tableModelConfidence: getTableModelConfidenceScore(tableModelSeed),
    tableModelSeed,
  });

  return {
    structure,
    columnProfiles,
    layoutCandidates,
    semanticCandidates,
    groups: [],
    blocks,
    diagnostics: createTableModelReasonDiagnostics({
      reasons: tableModelSeed.curveTypeReasons,
      relatedBlockId: blocks[0]?.id ?? createMeasurementBlockId(rawTableId, 0),
    }),
  };
};

const createReviewContextFromTableModelRecord = ({
  columnCount,
  fileId,
  fileName,
  rawTableId,
  record,
  rowCount,
}) => {
  const evidenceFingerprint = [
    record.structure?.fingerprint ?? "",
    fileName,
    rowCount,
    columnCount,
    record.blocks.map(block => `${block.family}:${block.ivMode ?? block.itMode ?? ""}`).join("|"),
  ].join("\u0000");

  return {
    evidenceFingerprint,
    evidence: {
      structure: record.structure,
      columnProfiles: record.columnProfiles,
      layoutCandidates: record.layoutCandidates,
      semanticCandidates: record.semanticCandidates,
      groups: record.groups,
      blocks: record.blocks,
      diagnostics: record.diagnostics,
      sourceMetadata: {
        fileId,
        rawTableId,
        fileName,
        sourceRawTableVersion: 1,
        rowCount,
        columnCount,
      },
    },
  };
};

const getDefaultBottomTitle = (prepareSeed) => {
  if (prepareSeed?.xAxisRole === "vg") return "Vg";
  if (prepareSeed?.xAxisRole === "vd") return "Vd";
  const curveFamily = String(prepareSeed?.curveFamily ?? "").toLowerCase();
  if (curveFamily === "cf") return "Frequency";
  if (curveFamily === "cv" || curveFamily === "pv") return "Voltage";
  return "X";
};

const getDefaultLeftTitle = (prepareSeed) => {
  const curveFamily = String(prepareSeed?.curveFamily ?? "").toLowerCase();
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

const createBlockProcessConfig = (block, prepareSeed, { extendToEnd = false } = {}) => {
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
    autoCurveType: normalizeCurveType(prepareSeed),
    bottomTitle: block?.titles?.bottom || getDefaultBottomTitle(prepareSeed),
    endRow,
    leftTitle: block?.titles?.left || getDefaultLeftTitle(prepareSeed),
    legendPrefix: block?.legend?.prefix ?? "",
    startRow,
    xCol,
    xUnit: block?.x?.unit || (String(prepareSeed?.curveFamily ?? "").toLowerCase() === "cf" ? "Hz" : "V"),
    yCols,
    yLegendCount: legendTarget === "yColumn" ? yCols.length : undefined,
    yLegendTarget: legendTarget,
    yUnit: block?.y?.unit || (String(prepareSeed?.curveFamily ?? "").toLowerCase() === "cf" || String(prepareSeed?.curveFamily ?? "").toLowerCase() === "cv" ? "F" : "A"),
    ...getSegmentationFields(block?.segmentation, startRow, endRow),
  };
};

const createRustProcessConfigFromTemplate = (template, prepareSeed, { rowCount } = {}) => {
  const templateBlocks = Array.isArray(template?.blocks) ? template.blocks : [];
  const firstEndRow = getRowRangeEnd(templateBlocks[0]?.rowRange?.endRow);
  const shouldExtendSingleBlockToEnd =
    templateBlocks.length === 1 &&
    typeof firstEndRow === "number" &&
    normalizePositiveInteger(rowCount) !== undefined &&
    firstEndRow < rowCount - 1;
  const blocks = Array.isArray(template?.blocks)
    ? template.blocks
        .map(block => createBlockProcessConfig(block, prepareSeed, {
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

const createReviewedTemplateSnapshotFromCandidateInterpretation = (interpretation) => ({
  schemaVersion: 1,
  name: interpretation.name,
  version: interpretation.version,
  blocks: interpretation.blocks,
  stopOnError: interpretation.stopOnError,
  ...(interpretation.applicability ? { applicability: interpretation.applicability } : {}),
});

const createReviewAcceptedTemplateFromCandidates = ({ candidates, context }) => {
  const reviews = scoreTableReviewCandidates({
    candidates,
    context,
  });
  const readyCandidate = candidates.find(candidate =>
    reviews.some(review =>
      review.candidateId === candidate.id &&
      review.status === "ready"
    )
  );
  return readyCandidate
    ? createReviewedTemplateSnapshotFromCandidateInterpretation(readyCandidate.interpretation)
    : null;
};

const createProcessConfigFromReviewCandidate = ({ filePath, fileId, prepareResult }) => {
  const prepareSeed = readPrepareResultTableModelSeed(prepareResult);
  if (!prepareResult?.ok || !prepareSeed) {
    return null;
  }

  const rows = normalizeRows(prepareResult.previewRows);
  const fileName = String(prepareResult.fileName || path.basename(filePath));
  const columnCount = normalizePositiveInteger(prepareResult.columnCount) ?? getColumnCount(rows);
  const rowCount = normalizePositiveInteger(prepareResult.rowCount) ?? rows.length;
  const rawTableId = `${fileId}:table`;
  const record = createTableModelRecordFromPrepareSeed({
    columnCount,
    fileId,
    fileName,
    rawTableId,
    rowCount,
    rows,
    tableModelSeed: prepareSeed,
  });
  const context = createReviewContextFromTableModelRecord({
    columnCount,
    fileId,
    fileName,
    rawTableId,
    rowCount,
    record,
  });
  const candidates = deriveRecipeTableReviewCandidates({ context, recipeSnapshot });
  const reviewAcceptedTemplate = createReviewAcceptedTemplateFromCandidates({ candidates, context });
  return reviewAcceptedTemplate
    ? createRustProcessConfigFromTemplate(reviewAcceptedTemplate, prepareSeed, { rowCount })
    : null;
};

const readPrepareResultTableModelSeed = (prepareResult) => {
  const seed = prepareResult?.tableModelSeed;
  return isObject(seed) ? seed : null;
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
    config = createProcessConfigFromReviewCandidate({ fileId, filePath, prepareResult });
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
