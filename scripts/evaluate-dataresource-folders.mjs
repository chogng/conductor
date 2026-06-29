import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { prepareCompiledUnitTests, workspace } from "../test/unit/node/compiledUnitTestRunner.js";

const outRoot = path.join(workspace, "out", "test", "src");
const defaultRoots = [
  path.join(process.env.USERPROFILE ?? "C:\\Users\\lanxi", "Desktop", "293k"),
  path.join(process.env.USERPROFILE ?? "C:\\Users\\lanxi", "Desktop", "zc"),
];
const supportedExtensions = new Set([".csv", ".tsv", ".xls", ".xlsx"]);

await prepareCompiledUnitTests();

const [
  { Emitter },
  { Disposable },
  { URI },
  { DataResourceService },
  { readStructuredContentRows },
  { matchDataResourceRowMarker, matchDataResourceSemanticTitle, normalizeDataResourceSemanticText },
  { TableModel: TableContentModel },
  { createTableByteBuffer, createTableTextBuffer },
  { parseTableStructure },
  { readNativeXlsWorkbook },
  { deriveReviewResult },
] = await Promise.all([
  importCompiled("cs/base/common/event.js"),
  importCompiled("cs/base/common/lifecycle.js"),
  importCompiled("cs/base/common/uri.js"),
  importCompiled("cs/workbench/services/dataResource/browser/dataResourceService.js"),
  importCompiled("cs/workbench/services/dataResource/common/structuredContent.js"),
  importCompiled("cs/workbench/services/dataResource/common/semanticLibrary.js"),
  importCompiled("cs/workbench/services/table/common/model.js"),
  importCompiled("cs/workbench/services/table/common/tableReadBuffer.js"),
  importCompiled("cs/workbench/services/table/common/tableStructureParser.js"),
  importCompiled("cs/workbench/services/tableFile/electron-browser/nativeTableFileService.js"),
  importCompiled("cs/workbench/services/review/common/reviewDecision.js"),
]);

const unmatchedTitleCounts = new Map();
const parseErrorCounts = new Map();

async function main() {
  const roots = process.argv.slice(2).length ? process.argv.slice(2) : defaultRoots;
  const startedAt = new Date();
  const files = await collectFiles(roots);
  const outputDir = path.join(workspace, ".build", "dataresource-eval");
  await fs.mkdir(outputDir, { recursive: true });

  const results = [];
  let fileIndex = 0;
  for (const filePath of files) {
    fileIndex += 1;
    if (fileIndex === 1 || fileIndex % 25 === 0) {
      console.log(`[dataresource-eval] ${fileIndex}/${files.length} ${path.basename(filePath)}`);
    }
    const fileResults = await evaluateFile(filePath);
    results.push(...fileResults);
  }

  const summary = summarizeResults(results);
  const endedAt = new Date();
  const report = {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    roots,
    fileCount: files.length,
    sheetCount: results.length,
    summary,
    unmatchedTitleCandidates: [...unmatchedTitleCounts.entries()]
      .map(([text, count]) => ({ text, count }))
      .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text))
      .slice(0, 100),
    parseErrors: [...parseErrorCounts.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((left, right) => right.count - left.count || left.message.localeCompare(right.message)),
    results,
  };

  const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `evaluation-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `evaluation-${timestamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(markdownPath, createMarkdownReport(report), "utf8");

  console.log(`[dataresource-eval] wrote ${jsonPath}`);
  console.log(`[dataresource-eval] wrote ${markdownPath}`);
  console.log(`[dataresource-eval] summary ${JSON.stringify(summary)}`);
}

async function evaluateFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const format = extension.slice(1);
  const relativePath = path.relative(workspace, filePath);
  try {
    const bytes = new Uint8Array(await fs.readFile(filePath));
    const parsed = await parseTableStructure({
      buffer: format === "csv" || format === "tsv"
        ? createTableTextBuffer(new TextDecoder().decode(bytes), "utf8")
        : createTableByteBuffer(bytes),
      format,
      ...(format === "xls" ? { xlsReader: readNativeXlsWorkbook } : {}),
    });
    const sheets = parsed.sheets.length
      ? parsed.sheets
      : [{
          content: parsed.content,
          diagnostics: parsed.diagnostics,
          sheetId: "0",
          sheetName: null,
        }];
    const fileResults = [];
    for (const sheet of sheets) {
      if (!sheet.content) {
        fileResults.push(createParseOnlyResult({
          diagnostics: sheet.diagnostics.length ? sheet.diagnostics : parsed.diagnostics,
          filePath,
          format,
          relativePath,
          sheetId: sheet.sheetId,
          sheetName: sheet.sheetName,
          status: "missingContent",
        }));
        continue;
      }
      for (const title of collectUnmatchedTitleCandidates(sheet.content)) {
        unmatchedTitleCounts.set(title, (unmatchedTitleCounts.get(title) ?? 0) + 1);
      }
      fileResults.push(await evaluateContent({
        content: sheet.content,
        diagnostics: [...parsed.diagnostics, ...sheet.diagnostics],
        filePath,
        format,
        relativePath,
        sheetId: sheet.sheetId,
        sheetName: sheet.sheetName,
      }));
    }
    return fileResults;
  } catch (error) {
    const message = getErrorMessage(error);
    parseErrorCounts.set(message, (parseErrorCounts.get(message) ?? 0) + 1);
    return [{
      filePath,
      relativePath,
      format,
      sheetId: "0",
      sheetName: null,
      status: "parseError",
      decision: "parseError",
      confidence: null,
      relation: null,
      family: null,
      ivMode: null,
      rowCount: 0,
      columnCount: 0,
      xRangeCount: 0,
      xGroupCount: 0,
      dataBlockCount: 0,
      bindingCount: 0,
      diagnostics: [message],
      findings: [],
    }];
  }
}

async function evaluateContent({
  content,
  diagnostics,
  filePath,
  format,
  relativePath,
  sheetId,
  sheetName,
}) {
  const resource = URI.file(filePath);
  const tableModelService = new TestTableModelService(resource, content, diagnostics, sheetId, sheetName);
  const dataResourceService = new DataResourceService(tableModelService);
  try {
    const reference = await dataResourceService.resolveStructuredContent({ resource, sheetId });
    const resolution = reference.object;
    if (resolution.kind !== "ready") {
      reference.dispose();
      return createParseOnlyResult({
        diagnostics: [{ code: `dataResource.${resolution.kind}`, message: resolution.kind, severity: "fatal" }],
        filePath,
        format,
        relativePath,
        sheetId,
        sheetName,
        status: resolution.kind,
      });
    }
    const snapshot = resolution.snapshot;
    const structuredContent = snapshot.structuredContent;
    const review = deriveReviewResult({
      evidence: {
        sourceMetadata: {
          columnCount: snapshot.columnCount,
          fileName: snapshot.fileName,
          rowCount: snapshot.rowCount,
          sourceModelVersion: snapshot.sourceModelVersion,
          sourceUri: snapshot.sourceUri,
          sourceVersion: snapshot.sourceVersion,
        },
        structuredContent,
      },
      columnCount: snapshot.columnCount,
      fileName: snapshot.fileName,
      modelVersion: snapshot.sourceModelVersion,
      resource,
      rowCount: snapshot.rowCount,
      schemaProfileSnapshot: emptySchemaProfileSnapshot,
      sheetId,
      sourceVersion: snapshot.sourceVersion,
      userTemplateSnapshot: emptyUserTemplateSnapshot,
    });
    reference.dispose();

    const binding = structuredContent.bindingCandidates[0];
    const block = binding
      ? structuredContent.dataBlockCandidates.find(candidate => candidate.id === binding.dataBlockCandidateIds[0])
      : undefined;
    const measurement = review.reviewedTemplate?.template.measurement;
    return {
      filePath,
      relativePath,
      format,
      sheetId,
      sheetName,
      status: review.decision.kind,
      decision: review.decision.kind,
      confidence: review.reviews[0]?.confidence ?? null,
      relation: binding?.relation ?? null,
      family: measurement?.curveFamily ?? null,
      ivMode: measurement?.ivMode ?? null,
      rowCount: snapshot.rowCount,
      columnCount: snapshot.columnCount,
      xRangeCount: structuredContent.xRangeCandidates.length,
      xGroupCount: structuredContent.xGroupCandidates.length,
      dataBlockCount: structuredContent.dataBlockCandidates.length,
      bindingCount: structuredContent.bindingCandidates.length,
      xColumn: block?.xColumn ?? null,
      yColumns: block?.dependentColumns ?? [],
      columnDirection: block?.columnDirection ?? null,
      diagnostics: structuredContent.diagnostics.map(diagnostic => diagnostic.code),
      findings: review.reviews[0]?.findings.map(finding => finding.code) ?? [],
    };
  } finally {
    dataResourceService.dispose();
    tableModelService.dispose();
  }
}

function createParseOnlyResult({
  diagnostics,
  filePath,
  format,
  relativePath,
  sheetId,
  sheetName,
  status,
}) {
  return {
    filePath,
    relativePath,
    format,
    sheetId,
    sheetName,
    status,
    decision: status,
    confidence: null,
    relation: null,
    family: null,
    ivMode: null,
    rowCount: 0,
    columnCount: 0,
    xRangeCount: 0,
    xGroupCount: 0,
    dataBlockCount: 0,
    bindingCount: 0,
    diagnostics: diagnostics.map(diagnostic => diagnostic.code ?? diagnostic.message ?? String(diagnostic)),
    findings: [],
  };
}

function collectUnmatchedTitleCandidates(content) {
  const rows = readStructuredContentRows(content);
  const result = [];
  const columnCount = Math.min(content.columnCount, 80);
  for (let column = 0; column < columnCount; column += 1) {
    const run = findFirstNumericRun(rows, column);
    if (!run || run.startRow <= 0) {
      continue;
    }
    const titleRow = rows[run.startRow - 1] ?? [];
    const marker = matchDataResourceRowMarker(titleRow[0]);
    const title = normalizeText(titleRow[column]);
    if (!title || parseFiniteNumber(title) !== null) {
      continue;
    }
    if (marker === "dataRow") {
      continue;
    }
    if (matchDataResourceSemanticTitle(title)) {
      continue;
    }
    const normalized = normalizeDataResourceSemanticText(title);
    if (!normalized || normalized.length <= 1) {
      continue;
    }
    result.push(title);
  }
  return result;
}

function findFirstNumericRun(rows, column) {
  let startRow = null;
  let count = 0;
  for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
    const value = rowIndex < rows.length ? parseFiniteNumber(rows[rowIndex]?.[column]) : null;
    if (value !== null) {
      startRow ??= rowIndex;
      count += 1;
      continue;
    }
    if (startRow !== null && count >= 2) {
      return { startRow, endRow: rowIndex - 1 };
    }
    startRow = null;
    count = 0;
  }
  return null;
}

class TestTableModelService extends Disposable {
  _serviceBrand = undefined;
  onDidChangeModelEmitter = this._register(new Emitter());
  onDidChangeModel = this.onDidChangeModelEmitter.event;
  model;

  constructor(resource, content, diagnostics, sheetId, sheetName) {
    super();
    this.resource = resource;
    this.content = content;
    this.diagnostics = diagnostics;
    this.sheetId = sheetId;
    this.sheetName = sheetName;
    this.model = this._register(new TableContentModel(resource));
  }

  canHandleResource(resource) {
    return resource.toString() === this.resource.toString();
  }

  async createModelReference(resource) {
    if (!this.canHandleResource(resource)) {
      throw new Error(`Unsupported table resource: ${resource.toString()}`);
    }
    await this.resolveModel();
    return {
      object: this.model,
      dispose: () => undefined,
    };
  }

  get(resource) {
    return resource && this.canHandleResource(resource) ? this.model : undefined;
  }

  registerContentProvider(provider) {
    return {
      dispose: () => provider.dispose(),
    };
  }

  resolve(resource) {
    if (this.canHandleResource(resource)) {
      void this.resolveModel();
    }
  }

  async resolveModel() {
    if (this.model.getSnapshot().loadState.state === "ready") {
      return;
    }
    await this.model.resolve({
      resolveContent: async () => ({
        content: this.content,
        defaultSheetId: this.sheetId,
        diagnostics: this.diagnostics,
        format: "csv",
        resource: this.resource,
        sheets: [{
          content: this.content,
          diagnostics: this.diagnostics,
          sheetId: this.sheetId,
          sheetName: this.sheetName,
        }],
        sourceVersion: 1,
      }),
    });
    this.onDidChangeModelEmitter.fire(this.model);
  }
}

async function collectFiles(inputRoots) {
  const result = [];
  for (const input of inputRoots) {
    const absolute = path.resolve(input);
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      await visitDirectory(absolute, result);
      continue;
    }
    if (stat.isFile() && supportedExtensions.has(path.extname(absolute).toLowerCase())) {
      result.push(absolute);
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

async function visitDirectory(directory, result) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visitDirectory(entryPath, result);
      continue;
    }
    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      result.push(entryPath);
    }
  }
}

function summarizeResults(rows) {
  const byStatus = countBy(rows, row => row.status);
  const byFormat = countBy(rows, row => row.format);
  const byFamily = countBy(rows.filter(row => row.family), row => row.family);
  const byRelation = countBy(rows.filter(row => row.relation), row => row.relation);
  const ready = byStatus.ready ?? 0;
  const needsManualAdjustment = byStatus.needsManualAdjustment ?? 0;
  const invalid = byStatus.invalid ?? 0;
  const parseError = byStatus.parseError ?? 0;
  return {
    byFamily,
    byFormat,
    byRelation,
    byStatus,
    invalid,
    needsManualAdjustment,
    parseError,
    ready,
    readyRate: rows.length ? ready / rows.length : 0,
    reviewedRate: rows.length ? (ready + needsManualAdjustment) / rows.length : 0,
    total: rows.length,
  };
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = String(keyFn(row) ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function createMarkdownReport(report) {
  const lines = [];
  lines.push("# DataResource External Sample Evaluation");
  lines.push("");
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Ended: ${report.endedAt}`);
  lines.push(`- Files: ${report.fileCount}`);
  lines.push(`- Sheets: ${report.sheetCount}`);
  lines.push(`- Ready: ${report.summary.ready}`);
  lines.push(`- Needs manual adjustment: ${report.summary.needsManualAdjustment}`);
  lines.push(`- Invalid: ${report.summary.invalid}`);
  lines.push(`- Parse errors: ${report.summary.parseError}`);
  lines.push(`- Ready rate: ${(report.summary.readyRate * 100).toFixed(1)}%`);
  lines.push(`- Reviewed rate: ${(report.summary.reviewedRate * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("## By Status");
  lines.push("");
  lines.push(markdownTable(["Status", "Count"], Object.entries(report.summary.byStatus)));
  lines.push("");
  lines.push("## By Family");
  lines.push("");
  lines.push(markdownTable(["Family", "Count"], Object.entries(report.summary.byFamily)));
  lines.push("");
  lines.push("## By Relation");
  lines.push("");
  lines.push(markdownTable(["Relation", "Count"], Object.entries(report.summary.byRelation)));
  lines.push("");
  lines.push("## Top Unmatched Title Candidates");
  lines.push("");
  lines.push(markdownTable(["Title", "Count"], report.unmatchedTitleCandidates.slice(0, 30).map(item => [item.text, item.count])));
  lines.push("");
  lines.push("## Non-ready Examples");
  lines.push("");
  lines.push(markdownTable(
    ["Status", "File", "Sheet", "Rows", "Cols", "Diagnostics", "Findings"],
    report.results
      .filter(row => row.status !== "ready")
      .slice(0, 80)
      .map(row => [
        row.status,
        row.filePath,
        row.sheetName ?? row.sheetId,
        row.rowCount,
        row.columnCount,
        row.diagnostics.join(",") || "-",
        row.findings.join(",") || "-",
      ]),
  ));
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  if (!rows.length) {
    return "_None_";
  }
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.map(value => escapeMarkdownTableCell(value)).join(" | ")} |`),
  ].join("\n");
}

function escapeMarkdownTableCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function parseFiniteNumber(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const normalized = Number(text.replace(/,/g, ""));
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getErrorMessage(error) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error);
}

async function importCompiled(relativePath) {
  return import(pathToFileURL(path.join(outRoot, relativePath)).href);
}

const emptyUserTemplateSnapshot = {
  version: 0,
  workspaceVersion: 0,
  profileVersion: 0,
  workspaceFingerprint: "",
  profileFingerprint: "",
  effectiveFingerprint: "",
  templates: [],
};

const emptySchemaProfileSnapshot = {
  version: 0,
  profiles: [],
};

await main();
