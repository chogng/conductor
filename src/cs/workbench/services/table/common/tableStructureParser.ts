/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	readZipEntries,
	readZipText,
} from "src/cs/base/common/zip";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  createStructuredContentFingerprintBuilder,
  type StructuredContentFingerprintBuilder,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
	copyBytesToArrayBuffer,
	readTableByteBuffer,
	readTableTextChunks,
	type TableReadBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";
import {
  type TableParseDiagnostic,
} from "src/cs/workbench/services/table/common/model";
import {
  type TableFormatId,
} from "src/cs/workbench/services/table/common/tableFormatService";

export const PARSED_TABLE_ROW_WINDOW_SIZE = 1000;

export type TableStructureParseInput = {
  readonly buffer: TableReadBuffer;
  readonly format: TableFormatId;
  readonly xlsReader?: TableXlsReader;
};

export type TableXlsReader = (input: {
  readonly bytes: Uint8Array;
}) => Promise<TableXlsReadResult>;

export type TableXlsReadResult = {
  readonly sheets: readonly TableXlsReadSheet[];
};

export type TableXlsReadSheet = {
  readonly diagnostics?: readonly TableParseDiagnostic[];
  readonly rows: readonly (readonly string[])[];
  readonly sheetId?: string;
  readonly sheetName?: string | null;
};

export const DEFAULT_PHYSICAL_TABLE_SHEET_ID = "0";

export type ParsedTableContent = {
  readonly columnCount: number;
  readonly contentFingerprint: string;
  readonly maxCellLengths: readonly number[];
  readonly rowCount: number;
  readonly rows: readonly (readonly string[])[];
  readonly rowWindows?: readonly ParsedTableRowWindow[];
};

export type ParsedTableRowWindow = {
  readonly startRowIndex: number;
  readonly rows: readonly (readonly string[])[];
};

export type ParsedTableSheet = {
  readonly content: ParsedTableContent | null;
  readonly diagnostics: readonly TableParseDiagnostic[];
  readonly sheetId: string;
  readonly sheetName: string | null;
};

export type ParsedTableStructure = {
  readonly content: ParsedTableContent | null;
  readonly diagnostics: readonly TableParseDiagnostic[];
  readonly sheets: readonly ParsedTableSheet[];
};

export const parseTableStructure = async ({
  buffer,
  format,
  xlsReader,
}: TableStructureParseInput): Promise<ParsedTableStructure> => {
  const endParsePerf = startPerf("table.parser.parse", {
    bufferKind: buffer.kind,
    format,
    hasXlsReader: Boolean(xlsReader),
  }, { silent: true });
  let result: ParsedTableStructure | null = null;
  try {
    result = await doParseTableStructure({
      buffer,
      format,
      xlsReader,
    });
    return result;
  } finally {
    endParsePerf({
      ...summarizeParsedTableStructure(result),
      success: Boolean(result?.content),
    });
  }
};

const doParseTableStructure = async ({
  buffer,
  format,
  xlsReader,
}: TableStructureParseInput): Promise<ParsedTableStructure> => {
  if (format === "xls") {
    return parseXlsTableModelContent({
      buffer,
      xlsReader,
    });
  }

  if (format === "xlsx") {
    if (buffer.kind !== "bytes") {
      return createFatalParsedTableStructure(
        "table.parser.bufferKindMismatch",
        "The xlsx parser requires a byte table read buffer.",
      );
    }
    const bytes = copyBytesToArrayBuffer(await readTableByteBuffer(buffer));
    return parseXlsxTableModelContent({
      bytes,
    });
  }

  if (format !== "csv" && format !== "tsv") {
    return createFatalParsedTableStructure(
      "table.parser.parserUnavailable",
      `The ${format} table parser is not available.`,
    );
  }

  if (buffer.kind !== "text") {
    return {
      content: null,
      diagnostics: [{
        code: "table.parser.bufferKindMismatch",
        message: `The ${format} parser requires a text table read buffer.`,
        severity: "fatal",
      }],
      sheets: [],
    };
  }
  const { content, diagnostics } = await createTableModelContentSnapshot(buffer, format);
  if (!content && diagnostics.length) {
    return {
      content: null,
      diagnostics,
      sheets: [],
    };
  }
  return {
    content,
    diagnostics: [],
    sheets: content ? [{
      content,
      diagnostics,
      sheetId: DEFAULT_PHYSICAL_TABLE_SHEET_ID,
      sheetName: null,
    }] : [],
  };
};

const createTableModelContentSnapshot = (
  buffer: Extract<TableReadBuffer, { readonly kind: "text" }>,
  format: "csv" | "tsv",
): Promise<{
  readonly content: ParsedTableContent | null;
  readonly diagnostics: readonly TableParseDiagnostic[];
}> => parseDelimitedTableContent(buffer, format === "tsv" ? "\t" : ",");

const parseDelimitedTableContent = async (
  buffer: Extract<TableReadBuffer, { readonly kind: "text" }>,
  delimiter: "," | "\t",
): Promise<{
  readonly content: ParsedTableContent | null;
  readonly diagnostics: readonly TableParseDiagnostic[];
}> => {
  const contentBuilder = createParsedTableContentBuilder();
  const diagnostics: TableParseDiagnostic[] = [];
  let row: string[] = [];
  let cell = "";
  let atCellStart = true;
  let inQuotedCell = false;
  let afterClosingQuote = false;
  let previousWasCarriageReturn = false;
  let endedWithLineBreak = false;
  let hasNonWhitespaceText = false;
  let reportedInvalidQuote = false;

  const finishCell = (): void => {
    row.push(cell);
    cell = "";
    atCellStart = true;
    afterClosingQuote = false;
  };
  const finishRow = (): void => {
    finishCell();
    appendParsedTableRow(contentBuilder, row);
    row = [];
    endedWithLineBreak = true;
  };
  const addInvalidQuoteDiagnostic = (): void => {
    if (reportedInvalidQuote) {
      return;
    }
    reportedInvalidQuote = true;
    diagnostics.push({
      code: "table.parser.unescapedQuote",
      message: "The delimited table parser found characters after a closing quote.",
      rowIndex: contentBuilder.rowCount,
      severity: "error",
    });
  };

  for await (const chunk of readTableTextChunks(buffer)) {
    if (/\S/.test(chunk.text)) {
      hasNonWhitespaceText = true;
    }
    for (let index = 0; index < chunk.text.length; index += 1) {
      const char = chunk.text[index]!;
      if (inQuotedCell) {
        if (char === "\"") {
          inQuotedCell = false;
          afterClosingQuote = true;
        } else {
          cell += char;
        }
        endedWithLineBreak = false;
        continue;
      }

      if (previousWasCarriageReturn) {
        previousWasCarriageReturn = false;
        if (char === "\n") {
          continue;
        }
      }

      if (afterClosingQuote) {
        if (char === "\"") {
          cell += "\"";
          inQuotedCell = true;
          afterClosingQuote = false;
          atCellStart = false;
        } else if (char === delimiter) {
          finishCell();
        } else if (char === "\r" || char === "\n") {
          finishRow();
          previousWasCarriageReturn = char === "\r";
        } else {
          addInvalidQuoteDiagnostic();
          cell += char;
          afterClosingQuote = false;
          atCellStart = false;
          endedWithLineBreak = false;
        }
        continue;
      }

      if (atCellStart && char === "\"") {
        inQuotedCell = true;
        atCellStart = false;
        endedWithLineBreak = false;
        continue;
      }

      if (char === delimiter) {
        finishCell();
        endedWithLineBreak = false;
        continue;
      }

      if (char === "\r" || char === "\n") {
        finishRow();
        previousWasCarriageReturn = char === "\r";
        continue;
      }

      cell += char;
      atCellStart = false;
      endedWithLineBreak = false;
    }
  }

  if (!hasNonWhitespaceText) {
    return {
      content: null,
      diagnostics: [{
        code: "table.parser.empty",
        message: "The table file is empty.",
        severity: "fatal",
      }],
    };
  }

  if (inQuotedCell) {
    diagnostics.push({
      code: "table.parser.MissingQuotes",
      message: "The delimited table parser found an unclosed quoted cell.",
      rowIndex: contentBuilder.rowCount,
      severity: "error",
    });
  }

  if (endedWithLineBreak) {
    appendParsedTableRow(contentBuilder, [""]);
  } else if (row.length || cell.length || !atCellStart || afterClosingQuote) {
    finishCell();
    appendParsedTableRow(contentBuilder, row);
  }

  return {
    content: finalizeParsedTableContent(contentBuilder),
    diagnostics,
  };
};

const parseXlsTableModelContent = async ({
  buffer,
  xlsReader,
}: {
  readonly buffer: TableReadBuffer;
  readonly xlsReader?: TableXlsReader;
}): Promise<ParsedTableStructure> => {
  if (buffer.kind !== "bytes") {
    return createFatalParsedTableStructure(
      "table.parser.bufferKindMismatch",
      "The xls parser requires a byte table read buffer.",
    );
  }

  const bytes = await readTableByteBuffer(buffer);
  const sample = getAsciiCompatibleSample(bytes, 8192);
  const text = decodeLegacyWorkbookText(bytes);
  if (looksLikeHtmlWorkbook(sample)) {
    const content = parseHtmlWorkbookTableContent(text);
    return content
      ? createSingleSheetParsedTableStructure(content, [])
      : createFatalParsedTableStructure(
        "table.parser.noReadableSheet",
        "The xls workbook did not contain a readable HTML table.",
      );
  }

  if (looksLikeSpreadsheetMlWorkbook(sample)) {
    const content = parseSpreadsheetMlWorkbookContent(text);
    return content
      ? createSingleSheetParsedTableStructure(content, [])
      : createFatalParsedTableStructure(
        "table.parser.noReadableSheet",
        "The xls workbook did not contain a readable SpreadsheetML sheet.",
      );
  }

  if (!xlsReader) {
    return createFatalParsedTableStructure(
      "table.parser.binaryXlsUnsupported",
      "Binary .xls workbooks are not supported in this environment. Save the workbook as .xlsx or export it as CSV.",
    );
  }

  let readResult: TableXlsReadResult;
  try {
    readResult = await xlsReader({ bytes });
  } catch (error) {
    return createFatalParsedTableStructure(
      "table.parser.malformedWorkbook",
      getParserErrorMessage(error, "The xls workbook could not be parsed."),
    );
  }

  return createParsedTableStructureFromXlsReadSheets(readResult.sheets);
};

const createSingleSheetParsedTableStructure = (
  content: ParsedTableContent,
  diagnostics: readonly TableParseDiagnostic[],
): ParsedTableStructure => ({
  content,
  diagnostics: [],
  sheets: [{
    content,
    diagnostics,
    sheetId: DEFAULT_PHYSICAL_TABLE_SHEET_ID,
    sheetName: null,
  }],
});

const createParsedTableStructureFromXlsReadSheets = (
  readSheets: readonly TableXlsReadSheet[],
): ParsedTableStructure => {
  const sheets = readSheets.map((sheet, index): ParsedTableSheet => {
    const content = sheet.rows.length
      ? createParsedTableContentFromRows(sheet.rows)
      : null;
    return {
      content,
      diagnostics: sheet.diagnostics ?? [],
      sheetId: sheet.sheetId?.trim() || String(index),
      sheetName: normalizeOptionalString(sheet.sheetName ?? undefined),
    };
  });
  const firstReadableSheet = sheets.find(sheet => sheet.content);
  if (!firstReadableSheet) {
    return createFatalParsedTableStructure(
      "table.parser.noReadableSheet",
      "The xls workbook did not contain a readable worksheet.",
    );
  }

  return {
    content: firstReadableSheet.content,
    diagnostics: [],
    sheets,
  };
};

const createParsedTableContentFromRows = (
  rows: readonly (readonly string[])[],
): ParsedTableContent => {
  const contentBuilder = createParsedTableContentBuilder();
  for (const row of rows) {
    appendParsedTableRow(contentBuilder, row.map(cell => String(cell ?? "")));
  }
  return finalizeParsedTableContent(contentBuilder);
};

const decodeLegacyWorkbookText = (bytes: Uint8Array): string => {
  const charset = detectDeclaredTextCharset(bytes);
  const labels = uniqueStrings([
    charset ? normalizeTextDecoderLabel(charset) : null,
    charset,
    "utf-8",
  ]);
  for (const label of labels) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Try the next declared/default encoding label.
    }
  }
  return new TextDecoder().decode(bytes);
};

const detectDeclaredTextCharset = (bytes: Uint8Array): string | null => {
  const sample = getAsciiCompatibleSample(bytes, 8192);
  const metaCharset = /<meta\b[^>]*\bcharset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(sample)?.[1];
  if (metaCharset) {
    return metaCharset;
  }
  return /<\?xml\b[^>]*\bencoding\s*=\s*["']\s*([a-z0-9._-]+)/i.exec(sample)?.[1] ?? null;
};

const normalizeTextDecoderLabel = (label: string): string =>
  /^(gb2312|gbk)$/i.test(label) ? "gb18030" : label;

const uniqueStrings = (
  values: readonly (string | null | undefined)[],
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
};

const getAsciiCompatibleSample = (
  bytes: Uint8Array,
  limit: number,
): string => {
  let text = "";
  const length = Math.min(bytes.byteLength, limit);
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index]!;
    text += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " ";
  }
  return text;
};

const looksLikeHtmlWorkbook = (text: string): boolean =>
  /<html\b/i.test(text) || /<table\b/i.test(text);

const looksLikeSpreadsheetMlWorkbook = (text: string): boolean =>
  /urn:schemas-microsoft-com:office:spreadsheet/i.test(text) ||
  /<Workbook\b/i.test(text) && /<Worksheet\b/i.test(text);

const parseHtmlWorkbookTableContent = (
  html: string,
): ParsedTableContent | null => {
  const tableBody = getFirstHtmlElementBody(html, "table");
  if (tableBody === null) {
    return null;
  }

  const contentBuilder = createParsedTableContentBuilder();
  for (const rowElement of iterateHtmlElements(tableBody, "tr")) {
    const row: string[] = [];
    for (const cellElement of iterateHtmlTableCells(rowElement.body)) {
      const attributes = parseXmlAttributes(cellElement.attributes);
      const colspan = getPositiveIntegerAttribute(attributes, "colspan") ?? 1;
      row.push(normalizeHtmlCellText(cellElement.body));
      for (let spanIndex = 1; spanIndex < colspan; spanIndex += 1) {
        row.push("");
      }
    }
    if (row.length) {
      appendParsedTableRow(contentBuilder, row);
    }
  }

  return contentBuilder.rowCount
    ? finalizeParsedTableContent(contentBuilder)
    : null;
};

const parseSpreadsheetMlWorkbookContent = (
  xml: string,
): ParsedTableContent | null => {
  const worksheetBody = getXmlElements(xml, "Worksheet")[0]?.body ?? xml;
  const contentBuilder = createParsedTableContentBuilder();
  for (const rowElement of iterateXmlElements(worksheetBody, "Row")) {
    const row: string[] = [];
    let nextColumnIndex = 0;
    for (const cellElement of iterateXmlElements(rowElement.body, "Cell")) {
      const attributes = parseXmlAttributes(cellElement.attributes);
      const columnIndex = getPositiveIntegerAttribute(attributes, "Index");
      if (columnIndex !== null) {
        while (nextColumnIndex < columnIndex - 1) {
          row.push("");
          nextColumnIndex += 1;
        }
      }
      row.push(getSpreadsheetMlCellText(cellElement.body));
      nextColumnIndex += 1;
    }
    if (row.length) {
      appendParsedTableRow(contentBuilder, row);
    }
  }

  return contentBuilder.rowCount
    ? finalizeParsedTableContent(contentBuilder)
    : null;
};

const getFirstHtmlElementBody = (
  html: string,
  tagName: string,
): string | null => {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return pattern.exec(html)?.[1] ?? null;
};

type HtmlElement = {
  readonly attributes: string;
  readonly body: string;
};

const iterateHtmlElements = function* (
  html: string,
  tagName: string,
): IterableIterator<HtmlElement> {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  for (const match of html.matchAll(pattern)) {
    yield {
      attributes: match[1] ?? "",
      body: match[2] ?? "",
    };
  }
};

const iterateHtmlTableCells = function* (
  html: string,
): IterableIterator<HtmlElement> {
  const pattern = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    yield {
      attributes: match[2] ?? "",
      body: match[3] ?? "",
    };
  }
};

const normalizeHtmlCellText = (html: string): string =>
  decodeMarkupEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .trim(),
  );

const getSpreadsheetMlCellText = (body: string): string =>
  getXmlElements(body, "Data")
    .map(element => decodeMarkupEntities(element.body.replace(/<[^>]*>/g, "")))
    .join("");

const getPositiveIntegerAttribute = (
  attributes: ReadonlyMap<string, string>,
  name: string,
): number | null => {
  const nameLower = name.toLowerCase();
  for (const [key, value] of attributes) {
    const localName = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
    if (localName.toLowerCase() !== nameLower) {
      continue;
    }
    const integer = Number.parseInt(value, 10);
    return Number.isFinite(integer) && integer > 0 ? integer : null;
  }
  return null;
};

const decodeMarkupEntities = (value: string): string =>
  decodeXml(value.replace(/&nbsp;/gi, "\u00a0"));

const parseXlsxTableModelContent = async ({
  bytes,
}: {
  readonly bytes: ArrayBuffer;
}): Promise<ParsedTableStructure> => {
  let workbook: XlsxWorkbook;
  try {
    workbook = await readXlsxWorkbook(bytes);
  } catch (error) {
    return createFatalParsedTableStructure(
      "table.parser.malformedWorkbook",
      getParserErrorMessage(error, "The xlsx workbook could not be parsed."),
    );
  }
  const sheets: ParsedTableSheet[] = [];
  for (let index = 0; index < workbook.sheets.length; index += 1) {
    const sheet = workbook.sheets[index]!;
    const sheetId = getXlsxSheetId(sheet, index);
    const sheetXml = workbook.zip.has(sheet.path)
      ? readZipText(workbook.zip, sheet.path)
      : "";
    if (!sheetXml) {
      sheets.push({
        content: null,
        diagnostics: [{
          code: "table.parser.missingSheetXml",
          message: `The xlsx workbook is missing worksheet XML for ${sheet.name ?? sheetId}.`,
          severity: "error",
          sheetId,
        }],
        sheetId,
        sheetName: sheet.name,
      });
      continue;
    }

    const content = createTableModelContentFromXlsxSheet(
      sheetXml,
      workbook.sharedStrings,
      workbook.styles,
      workbook.date1904,
    );
    if (!content) {
      continue;
    }
    sheets.push({
      content,
      diagnostics: [],
      sheetId,
      sheetName: sheet.name,
    });
  }

  const firstReadableSheet = sheets.find(sheet => sheet.content);
  if (!firstReadableSheet) {
    return createFatalParsedTableStructure(
      "table.parser.noReadableSheet",
      "The workbook did not contain a readable sheet.",
    );
  }

  return {
    content: firstReadableSheet.content,
    diagnostics: [],
    sheets,
  };
};

const createFatalParsedTableStructure = (
  code: string,
  message: string,
): ParsedTableStructure => ({
  content: null,
  diagnostics: [{
    code,
    message,
    severity: "fatal",
  }],
  sheets: [],
});

const summarizeParsedTableStructure = (
  structure: ParsedTableStructure | null,
): Record<string, unknown> => ({
  columnCount: structure?.content?.columnCount ?? 0,
  diagnosticsCount: structure
    ? structure.diagnostics.length +
      structure.sheets.reduce((count, sheet) => count + sheet.diagnostics.length, 0)
    : 0,
  hasContent: Boolean(structure?.content),
  rowCount: structure?.content?.rowCount ?? 0,
  sheetCount: structure?.sheets.length ?? 0,
  windowCount: structure?.content?.rowWindows?.length ?? 0,
});

const getParserErrorMessage = (
  error: unknown,
  fallback: string,
): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : fallback;

type XlsxWorkbook = {
  readonly date1904: boolean;
  readonly sharedStrings: readonly string[];
  readonly sheets: readonly XlsxSheet[];
  readonly styles: XlsxStyles;
  readonly zip: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
};

type XlsxSheet = {
  readonly id: string | null;
  readonly name: string | null;
  readonly path: string;
};

type XlsxStyles = {
  readonly numberFormatsByStyleIndex: readonly (string | null)[];
};

const readXlsxWorkbook = async (bytes: ArrayBuffer): Promise<XlsxWorkbook> => {
  // XLSX is an OpenXML ZIP container; the table parser reads only workbook and worksheet XML entries.
  const zip = readZipEntries(bytes);
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = zip.has("xl/sharedStrings.xml")
    ? readZipText(zip, "xl/sharedStrings.xml")
    : "";
  const stylesXml = zip.has("xl/styles.xml")
    ? readZipText(zip, "xl/styles.xml")
    : "";
  const relationships = parseXlsxRelationships(relsXml);
  const sheets = parseXlsxSheets(workbookXml, relationships);
  return {
    date1904: parseXlsxDate1904(workbookXml),
    sharedStrings: parseXlsxSharedStrings(sharedStringsXml),
    sheets,
    styles: parseXlsxStyles(stylesXml),
    zip,
  };
};

const parseXlsxRelationships = (xml: string): Map<string, string> => {
  const relationships = new Map<string, string>();
  for (const element of getXmlElements(xml, "Relationship")) {
    const attributes = parseXmlAttributes(element.attributes);
    const id = attributes.get("Id") ?? "";
    const target = attributes.get("Target") ?? "";
    if (id && target) {
      relationships.set(id, normalizeXlsxPath(target));
    }
  }
  return relationships;
};

const parseXlsxSheets = (
  xml: string,
  relationships: ReadonlyMap<string, string>,
): readonly XlsxSheet[] => {
  const sheets: XlsxSheet[] = [];
  for (const element of getXmlElements(xml, "sheet")) {
    const attributes = parseXmlAttributes(element.attributes);
    const relationshipId = attributes.get("r:id") ?? attributes.get("id") ?? "";
    const path = relationshipId ? relationships.get(relationshipId) : undefined;
    if (!path) {
      continue;
    }
    sheets.push({
      id: attributes.get("sheetId") ?? null,
      name: normalizeOptionalString(attributes.get("name")),
      path,
    });
  }
  return sheets;
};

const normalizeXlsxPath = (target: string): string => {
  const normalized = target.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
};

const parseXlsxSharedStrings = (xml: string): readonly string[] =>
  getXmlElements(xml, "si").map(element => parseXlsxTextRuns(element.body));

const parseXlsxDate1904 = (xml: string): boolean => {
  const workbookPr = getXmlElements(xml, "workbookPr")[0];
  if (!workbookPr) {
    return false;
  }

  const attributes = parseXmlAttributes(workbookPr.attributes);
  return attributes.get("date1904") === "1" ||
    attributes.get("date1904")?.toLowerCase() === "true";
};

const parseXlsxStyles = (xml: string): XlsxStyles => {
  if (!xml) {
    return {
      numberFormatsByStyleIndex: [],
    };
  }

  const customNumberFormats = parseXlsxCustomNumberFormats(xml);
  const cellXfs = getXmlElements(xml, "cellXfs")[0]?.body ?? "";
  const numberFormatsByStyleIndex = getXmlElements(cellXfs, "xf").map(element => {
    const attributes = parseXmlAttributes(element.attributes);
    const numberFormatId = attributes.get("numFmtId");
    if (!numberFormatId) {
      return null;
    }
    return customNumberFormats.get(numberFormatId) ??
      getXlsxBuiltInNumberFormat(numberFormatId);
  });

  return {
    numberFormatsByStyleIndex,
  };
};

const parseXlsxCustomNumberFormats = (xml: string): ReadonlyMap<string, string> => {
  const formats = new Map<string, string>();
  for (const element of getXmlElements(xml, "numFmt")) {
    const attributes = parseXmlAttributes(element.attributes);
    const id = attributes.get("numFmtId");
    const formatCode = attributes.get("formatCode");
    if (id && formatCode) {
      formats.set(id, formatCode);
    }
  }
  return formats;
};

const getXlsxBuiltInNumberFormat = (numberFormatId: string): string | null => {
  switch (numberFormatId) {
    case "14":
      return "m/d/yy";
    case "15":
      return "d-mmm-yy";
    case "16":
      return "d-mmm";
    case "17":
      return "mmm-yy";
    case "22":
      return "m/d/yy h:mm";
    default:
      return null;
  }
};

const createTableModelContentFromXlsxSheet = (
  xml: string,
  sharedStrings: readonly string[],
  styles: XlsxStyles,
  date1904: boolean,
): ParsedTableContent | null => {
  const contentBuilder = createParsedTableContentBuilder();
  for (const rowElement of iterateXmlElements(xml, "row")) {
    const row: string[] = [];
    let nextColumnIndex = 0;
    for (const cellElement of iterateXmlElements(rowElement.body, "c")) {
      const attributes = parseXmlAttributes(cellElement.attributes);
      const columnIndex = getCellColumnIndex(attributes.get("r")) ?? nextColumnIndex;
      const value = getXlsxCellValue(cellElement.body, attributes, {
        date1904,
        sharedStrings,
        styles,
      });
      row[columnIndex] = value;
      nextColumnIndex = columnIndex + 1;
    }
    appendParsedTableRow(contentBuilder, Array.from({ length: row.length }, (_, columnIndex) => row[columnIndex] ?? ""));
  }
  return finalizeParsedTableContent(contentBuilder);
};

const getXlsxCellValue = (
  body: string,
  attributes: ReadonlyMap<string, string>,
  workbook: {
    readonly date1904: boolean;
    readonly sharedStrings: readonly string[];
    readonly styles: XlsxStyles;
  },
): string => {
  const type = attributes.get("t") ?? "";
  if (type === "inlineStr") {
    return parseXlsxTextRuns(body);
  }

  const rawValue = getFirstXmlElementBody(body, "v");
  if (rawValue === null) {
    return "";
  }

  if (type === "s") {
    return workbook.sharedStrings[Number(rawValue)] ?? "";
  }
  if (type === "b") {
    return rawValue === "1" ? "TRUE" : "FALSE";
  }
  const formattedDate = getXlsxFormattedDateValue(rawValue, attributes, workbook);
  if (formattedDate !== null) {
    return formattedDate;
  }
  return decodeXml(rawValue);
};

const parseXlsxTextRuns = (xml: string): string =>
  getXmlElements(xml, "t").map(element => decodeXml(element.body)).join("");

const getXlsxFormattedDateValue = (
  rawValue: string,
  attributes: ReadonlyMap<string, string>,
  workbook: {
    readonly date1904: boolean;
    readonly styles: XlsxStyles;
  },
): string | null => {
  const styleIndex = Number(attributes.get("s"));
  const numberFormat = Number.isInteger(styleIndex)
    ? workbook.styles.numberFormatsByStyleIndex[styleIndex] ?? null
    : null;
  if (!numberFormat || !isXlsxDateNumberFormat(numberFormat)) {
    return null;
  }

  return formatExcelSerialDate(rawValue, workbook.date1904);
};

const isXlsxDateNumberFormat = (formatCode: string): boolean => {
  const normalized = formatCode
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .toLowerCase();
  return /[dy]/.test(normalized);
};

const formatExcelSerialDate = (
  value: string,
  date1904: boolean,
): string | null => {
  const serial = Number(value);
  if (!Number.isFinite(serial)) {
    return null;
  }

  const epoch = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + serial * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

type ParsedTableContentBuilder = {
  readonly maxCellLengths: number[];
  readonly fingerprintBuilder: StructuredContentFingerprintBuilder;
  readonly windows: ParsedTableRowWindow[];
  columnCount: number;
  currentWindowRows: string[][];
  currentWindowStartRowIndex: number;
  rowCount: number;
};

const createParsedTableContentBuilder = (): ParsedTableContentBuilder => ({
  columnCount: 0,
  currentWindowRows: [],
  currentWindowStartRowIndex: 0,
  fingerprintBuilder: createStructuredContentFingerprintBuilder(),
  maxCellLengths: [],
  rowCount: 0,
  windows: [],
});

const appendParsedTableRow = (
  builder: ParsedTableContentBuilder,
  row: string[],
): void => {
  if (!builder.currentWindowRows.length) {
    builder.currentWindowStartRowIndex = builder.rowCount;
  }
  builder.currentWindowRows.push(row);
  builder.fingerprintBuilder.appendRow(row);
  builder.rowCount += 1;
  builder.columnCount = Math.max(builder.columnCount, row.length);
  for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
    builder.maxCellLengths[columnIndex] = Math.max(
      builder.maxCellLengths[columnIndex] ?? 0,
      String(row[columnIndex] ?? "").length,
    );
  }
  if (builder.currentWindowRows.length >= PARSED_TABLE_ROW_WINDOW_SIZE) {
    flushParsedTableContentWindow(builder);
  }
};

const finalizeParsedTableContent = (
  builder: ParsedTableContentBuilder,
): ParsedTableContent => {
  flushParsedTableContentWindow(builder);
  const maxCellLengths = Array.from({ length: builder.columnCount }, (_, columnIndex) =>
    builder.maxCellLengths[columnIndex] ?? 0
  );
  const contentFingerprint = builder.fingerprintBuilder.finish({
    columnCount: builder.columnCount,
    maxCellLengths,
    rowCount: builder.rowCount,
  });
  if (!builder.rowCount) {
    return {
      columnCount: 0,
      contentFingerprint,
      maxCellLengths: [],
      rowCount: 0,
      rows: [],
    };
  }

  const rows = builder.windows[0]?.rows ?? [];
  return {
    columnCount: builder.columnCount,
    contentFingerprint,
    maxCellLengths,
    rowCount: builder.rowCount,
    rows,
    ...(builder.rowCount > PARSED_TABLE_ROW_WINDOW_SIZE ? { rowWindows: builder.windows } : {}),
  };
};

const flushParsedTableContentWindow = (
  builder: ParsedTableContentBuilder,
): void => {
  if (!builder.currentWindowRows.length) {
    return;
  }
  builder.windows.push({
    startRowIndex: builder.currentWindowStartRowIndex,
    rows: builder.currentWindowRows,
  });
  builder.currentWindowRows = [];
  builder.currentWindowStartRowIndex = builder.rowCount;
};

const getXlsxSheetId = (sheet: XlsxSheet, fallbackIndex: number): string => {
  const id = sheet.id?.trim() || String(fallbackIndex);
  return sheet.name ? `${id}:${sheet.name}` : id;
};

type XmlElement = {
  readonly attributes: string;
  readonly body: string;
};

const getXmlElements = (xml: string, tagName: string): readonly XmlElement[] => {
  const elements: XmlElement[] = [];
  for (const element of iterateXmlElements(xml, tagName)) {
    elements.push(element);
  }
  return elements;
};

const iterateXmlElements = function* (xml: string, tagName: string): IterableIterator<XmlElement> {
  const pattern = new RegExp(`<[^\\s:>]*:?${tagName}\\b([^>]*)\\/>|<[^\\s:>]*:?${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/[^\\s:>]*:?${tagName}>`, "g");
  for (const match of xml.matchAll(pattern)) {
    yield {
      attributes: match[1] ?? match[2] ?? "",
      body: match[3] ?? "",
    };
  }
};

const getFirstXmlElementBody = (xml: string, tagName: string): string | null =>
  getXmlElements(xml, tagName)[0]?.body ?? null;

const parseXmlAttributes = (attributes: string): ReadonlyMap<string, string> => {
  const values = new Map<string, string>();
  const pattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of attributes.matchAll(pattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    values.set(name, decodeXml(match[2] ?? match[3] ?? ""));
  }
  return values;
};

const decodeXml = (value: string): string =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    switch (entity) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return "\"";
      case "apos":
        return "'";
      default:
        if (entity.toLowerCase().startsWith("#x")) {
          return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        }
        if (entity.startsWith("#")) {
          return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        }
        return match;
    }
  });

const normalizeOptionalString = (value: string | undefined): string | null => {
  const normalized = value?.trim() ?? "";
  return normalized || null;
};

const getCellColumnIndex = (cellReference: string | undefined): number | null => {
  const letters = /^[A-Za-z]+/.exec(cellReference ?? "")?.[0];
  if (!letters) {
    return null;
  }
  let column = 0;
  for (const letter of letters.toUpperCase()) {
    column = column * 26 + letter.charCodeAt(0) - 64;
  }
  return column - 1;
};
