/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import JSZip from "jszip";
import Papa from "papaparse";

import type { URI } from "src/cs/base/common/uri";
import {
	copyBytesToArrayBuffer,
	readTableByteBuffer,
	readTableTextBuffer,
	type TableReadBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";
import { toTableSheetKey } from "src/cs/workbench/services/table/common/table";
import {
  type TableModelContentSnapshot,
  type TableModelSheetSnapshot,
} from "src/cs/workbench/services/table/common/model";
import {
  type TableFormatId,
} from "src/cs/workbench/services/table/common/tableFormatService";

export type TableStructureParseInput = {
  readonly buffer: TableReadBuffer;
  readonly format: TableFormatId;
  readonly resource: URI;
  readonly defaultSheetKey: string;
};

export type ParsedTableStructure = {
  readonly content: TableModelContentSnapshot | null;
  readonly sheets: readonly TableModelSheetSnapshot[];
};

export const parseTableStructure = async ({
  buffer,
  defaultSheetKey,
  format,
  resource,
}: TableStructureParseInput): Promise<ParsedTableStructure> => {
  if (format === "xls") {
    throw new Error("Legacy .xls table resources need native parser support.");
  }

  if (format === "xlsx") {
    if (buffer.kind !== "bytes") {
      throw new Error("The xlsx parser requires a byte table read buffer.");
    }
    const bytes = copyBytesToArrayBuffer(await readTableByteBuffer(buffer));
    return parseXlsxTableModelContent({
      bytes,
      defaultSheetKey,
      resource,
    });
  }

  if (buffer.kind !== "text") {
    return {
      content: null,
      sheets: [],
    };
  }
  const text = await readTableTextBuffer(buffer);
  const content = createTableModelContentSnapshot(text, format);
  return {
    content,
    sheets: content ? [{
      content,
      sheetId: defaultSheetKey,
      sheetKey: defaultSheetKey,
      sheetName: null,
    }] : [],
  };
};

const createTableModelContentSnapshot = (
  text: string | null,
  format: TableFormatId | null,
): TableModelContentSnapshot | null => {
  if (text === null || (format !== "csv" && format !== "tsv")) {
    return null;
  }

  const parsed = Papa.parse<unknown[]>(text, {
    delimiter: format === "tsv" ? "\t" : ",",
    skipEmptyLines: false,
  });
  const rows = parsed.data.map(row => row.map(cell => cell == null ? "" : String(cell)));
  const columnCount = rows.reduce(
    (count, row) => Math.max(count, row.length),
    0,
  );
  const maxCellLengths = Array.from({ length: columnCount }, (_, columnIndex) =>
    rows.reduce(
      (length, row) => Math.max(length, String(row[columnIndex] ?? "").length),
      0,
    )
  );
  return {
    columnCount,
    maxCellLengths,
    rowCount: rows.length,
    rows,
  };
};

const parseXlsxTableModelContent = async ({
  bytes,
  defaultSheetKey,
  resource,
}: {
  readonly bytes: ArrayBuffer;
  readonly defaultSheetKey: string;
  readonly resource: URI;
}): Promise<ParsedTableStructure> => {
  const workbook = await readXlsxWorkbook(bytes);
  const sheets: TableModelSheetSnapshot[] = [];
  for (let index = 0; index < workbook.sheets.length; index += 1) {
    const sheet = workbook.sheets[index]!;
    const sheetXml = await workbook.zip.file(sheet.path)?.async("text");
    if (!sheetXml) {
      continue;
    }

    const content = createTableModelContentFromXlsxSheet(sheetXml, workbook.sharedStrings);
    if (!content) {
      continue;
    }
    const sheetId = getXlsxSheetId(sheet, index);
    sheets.push({
      content,
      sheetId,
      sheetKey: toTableSheetKey({ resource, sheetId }),
      sheetName: sheet.name,
    });
  }

  const resolvedSheets = sheets.length ? sheets : [{
    content: createEmptyTableContent(),
    sheetId: defaultSheetKey,
    sheetKey: defaultSheetKey,
    sheetName: null,
  }];
  return {
    content: resolvedSheets[0]?.content ?? null,
    sheets: resolvedSheets,
  };
};

type XlsxWorkbook = {
  readonly sharedStrings: readonly string[];
  readonly sheets: readonly XlsxSheet[];
  readonly zip: JSZip;
};

type XlsxSheet = {
  readonly id: string | null;
  readonly name: string | null;
  readonly path: string;
};

const readXlsxWorkbook = async (bytes: ArrayBuffer): Promise<XlsxWorkbook> => {
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("text") ?? "";
  const relationships = parseXlsxRelationships(relsXml);
  const sheets = parseXlsxSheets(workbookXml, relationships);
  return {
    sharedStrings: parseXlsxSharedStrings(sharedStringsXml),
    sheets,
    zip,
  };
};

const readZipText = async (zip: JSZip, path: string): Promise<string> => {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`The xlsx workbook is missing ${path}.`);
  }
  return file.async("text");
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

const createTableModelContentFromXlsxSheet = (
  xml: string,
  sharedStrings: readonly string[],
): TableModelContentSnapshot | null => {
  const rowElements = getXmlElements(xml, "row");
  const rows: string[][] = [];
  let maxColumnCount = 0;
  for (const rowElement of rowElements) {
    const row: string[] = [];
    let nextColumnIndex = 0;
    for (const cellElement of getXmlElements(rowElement.body, "c")) {
      const attributes = parseXmlAttributes(cellElement.attributes);
      const columnIndex = getCellColumnIndex(attributes.get("r")) ?? nextColumnIndex;
      const value = getXlsxCellValue(cellElement.body, attributes, sharedStrings);
      row[columnIndex] = value;
      nextColumnIndex = columnIndex + 1;
    }
    const normalizedRow = row.map(value => value ?? "");
    maxColumnCount = Math.max(maxColumnCount, normalizedRow.length);
    rows.push(normalizedRow);
  }

  for (const row of rows) {
    for (let columnIndex = row.length; columnIndex < maxColumnCount; columnIndex += 1) {
      row[columnIndex] = "";
    }
  }
  return rows.length ? createTableContent(rows, maxColumnCount) : createEmptyTableContent();
};

const getXlsxCellValue = (
  body: string,
  attributes: ReadonlyMap<string, string>,
  sharedStrings: readonly string[],
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
    return sharedStrings[Number(rawValue)] ?? "";
  }
  if (type === "b") {
    return rawValue === "1" ? "TRUE" : "FALSE";
  }
  return decodeXml(rawValue);
};

const parseXlsxTextRuns = (xml: string): string =>
  getXmlElements(xml, "t").map(element => decodeXml(element.body)).join("");

const createTableContent = (
  rows: readonly (readonly string[])[],
  columnCount: number,
): TableModelContentSnapshot => ({
  columnCount,
  maxCellLengths: Array.from({ length: columnCount }, (_, columnIndex) =>
    rows.reduce(
      (length, row) => Math.max(length, String(row[columnIndex] ?? "").length),
      0,
    )
  ),
  rowCount: rows.length,
  rows,
});

const createEmptyTableContent = (): TableModelContentSnapshot => ({
  columnCount: 0,
  maxCellLengths: [],
  rowCount: 0,
  rows: [],
});

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
  const pattern = new RegExp(`<[^\\s:>]*:?${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/[^\\s:>]*:?${tagName}>|<[^\\s:>]*:?${tagName}\\b([^>]*)\\/>`, "g");
  for (const match of xml.matchAll(pattern)) {
    elements.push({
      attributes: match[1] ?? match[3] ?? "",
      body: match[2] ?? "",
    });
  }
  return elements;
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
