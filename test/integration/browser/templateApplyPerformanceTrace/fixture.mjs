import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { strToU8, zipSync } from "fflate";

export const createRunId = () =>
  `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;

export const createUniqueImportFixture = async ({ fileCount, profile, rowCount, runId, outputRoot }) => {
  const fixtureRoot = path.join(outputRoot, "data", runId);
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(fixtureRoot, { recursive: true });

  const files = [];
  for (let index = 0; index < fileCount; index += 1) {
    const fixtureType = getFixtureType({ fileCount, index, profile });
    const kind = index % 2 === 0 ? "transfer" : "output";
    const fileName = createFixtureFileName({
      index,
      kind,
      runId,
      type: fixtureType,
    });
    const filePath = path.join(fixtureRoot, fileName);
    await writeFixtureFile(filePath, {
      fileIndex: index,
      fileName,
      fixtureType,
      kind,
      rowCount,
      runId,
    });
    files.push({
      expectedReviewDecoration: fixtureType === "healthyCsv" || fixtureType === "schemaVariantCsv",
      expectedPrepareFailure: fixtureType === "corruptXlsx",
      fileIndex: index,
      fileName,
      kind,
      type: fixtureType,
    });
  }

  const composition = files.reduce((acc, file) => {
    acc[file.type] = (acc[file.type] ?? 0) + 1;
    return acc;
  }, {});
  return {
    composition,
    expectedReviewDecorationCount: files.filter(file => file.expectedReviewDecoration).length,
    expectedPrepareCompletionCount: files.length,
    expectedPrepareFailureCount: files.filter(file => file.expectedPrepareFailure).length,
    files,
    fixtureRoot,
    profile,
  };
};

export const createFixtureFileName = ({ index, kind, runId, type }) => {
  const prefix = String(index + 1).padStart(4, "0");
  if (type === "multiSheetXlsx" || type === "corruptXlsx") {
    const label = type === "multiSheetXlsx" ? "multi-sheet" : "corrupt-xlsx";
    return `${prefix}-${label}-${runId}.xlsx`;
  }
  const label = type === "healthyCsv" ? kind : type.replace(/Csv$/, "");
  return `${prefix}-${label}-${runId}.csv`;
};

export const getFixtureType = ({ fileCount, index, profile }) => {
  if (profile !== "mixed") {
    return "healthyCsv";
  }

  const slot = index % 50;
  if (slot === 49) {
    return "multiSheetXlsx";
  }
  if (slot === 46) {
    return "corruptXlsx";
  }
  if (slot === 24 || slot === 48) {
    return "emptyCsv";
  }
  if (slot === 19 || slot === 39) {
    return "binaryCsv";
  }
  if (slot === 16 || slot === 33) {
    return "garbledCsv";
  }
  if (slot === 12 || slot === 37) {
    return "schemaVariantCsv";
  }
  if (fileCount < 20 && index === fileCount - 1) {
    return "schemaVariantCsv";
  }
  return "healthyCsv";
};

export const writeFixtureFile = async (filePath, options) => {
  switch (options.fixtureType) {
    case "binaryCsv":
      writeFileSync(filePath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x19, 0x00, 0x00]));
      return;
    case "corruptXlsx":
      writeFileSync(filePath, Buffer.from([
        0x50, 0x4b, 0x03, 0x04,
        0x63, 0x6f, 0x72, 0x72, 0x75, 0x70, 0x74,
        options.fileIndex & 0xff,
      ]));
      return;
    case "emptyCsv":
      writeFileSync(filePath, "");
      return;
    case "garbledCsv":
      writeFileSync(filePath, Buffer.from([
        0xff, 0xfe, 0x00, 0x00, 0x81, 0x30, 0x81, 0x30,
        0x00, 0x01, 0x02, 0x03, 0x2c, 0x0a, 0xc3, 0x28,
      ]));
      return;
    case "schemaVariantCsv":
      writeFileSync(
        filePath,
        [
          "Name,Description,Category,OperatorSeed",
          `alpha_${options.fileIndex},schema variant row A,metadata,${options.runId}`,
          `beta_${options.fileIndex},schema variant row B,notes,${options.fileName}`,
          "",
        ].join("\n"),
        "utf8",
      );
      return;
    case "multiSheetXlsx":
      await writeTinyXlsx(filePath, {
        columnCount: 7,
        fileIndex: options.fileIndex,
        rowCount: Math.max(64, Math.min(512, Math.floor(options.rowCount / 8))),
        runId: options.runId,
        sheetCount: 3,
      });
      return;
    default:
      await writeUniqueCsv(filePath, options);
  }
};

export const createSeededRandom = (seedText) => {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
};

export const writeUniqueCsv = (filePath, { fileIndex, kind, rowCount, runId }) =>
  new Promise((resolve, reject) => {
    const random = createSeededRandom(`${runId}:${fileIndex}:${kind}:${rowCount}`);
    const stream = createWriteStream(filePath, { encoding: "utf8" });
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.write(`SetupTitle,${kind}_${runId}_${fileIndex}\n`);
    stream.write(`DeviceId,device-${runId}-${fileIndex}-${Math.floor(random() * 1e9)}\n`);
    stream.write(`OperatorSeed,${random().toFixed(12)}\n`);
    stream.write(`TestParameter,Output.Graph.XAxis.Data,${kind === "transfer" ? "Vg" : "Vd"}\n`);
    stream.write("DataName,Vg,Id,Ig,Vd,Temp,Noise\n");

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const group = Math.floor(rowIndex / Math.max(1, Math.floor(rowCount / 7)));
      const sweep = rowIndex % Math.max(5, Math.floor(rowCount / 11));
      const jitter = random() - 0.5;
      const vg = kind === "transfer"
        ? -3 + sweep * 0.013 + fileIndex * 0.0007 + jitter * 0.0003
        : -2 + group * 0.2 + fileIndex * 0.0004;
      const vd = kind === "output"
        ? 0.01 + sweep * 0.011 + fileIndex * 0.0005 + jitter * 0.0002
        : 0.05 + group * 0.25 + fileIndex * 0.0006;
      const id = (1e-12 * (1 + fileIndex)) *
        Math.exp((kind === "transfer" ? vg + 3 : vd) * (1.2 + random() * 0.2));
      const ig = id * (0.012 + random() * 0.006);
      const temp = 295 + fileIndex * 0.03 + random() * 1.7;
      const noise = `${runId}-${fileIndex}-${rowIndex}-${Math.floor(random() * 1e9)}`;
      stream.write([
        "DataValue",
        vg.toPrecision(12),
        id.toExponential(12),
        ig.toExponential(12),
        vd.toPrecision(12),
        temp.toFixed(5),
        noise,
      ].join(","));
      stream.write("\n");
    }
    stream.end();
  });

export const xmlEscape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

export const columnName = (index) => {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
};

export const xlsxCellXml = (row, column, value) => {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
};

export const worksheetXml = ({ columnCount, fileIndex, rowCount, runId, sheetIndex }) => {
  const rows = [];
  rows.push(`<row r="1">${[
    "DataName",
    "Vg",
    "Id",
    "Ig",
    "Vd",
    "Temp",
    `Sheet_${sheetIndex}`,
  ].slice(0, columnCount).map((value, column) =>
    xlsxCellXml(1, column, value)
  ).join("")}</row>`);
  for (let row = 2; row <= rowCount + 1; row += 1) {
    const sourceRow = row - 2;
    rows.push(`<row r="${row}">${Array.from({ length: columnCount }, (_, column) => {
      if (column === 0) {
        return xlsxCellXml(row, column, "DataValue");
      }
      if (column === 1) {
        return xlsxCellXml(row, column, -3 + sourceRow * 0.01 + sheetIndex * 0.001);
      }
      if (column === 2) {
        return xlsxCellXml(row, column, (1e-12 * (fileIndex + 1)) * Math.exp(sourceRow * 0.002));
      }
      if (column === 3) {
        return xlsxCellXml(row, column, (1e-14 * (sheetIndex + 1)) * (sourceRow + 1));
      }
      if (column === 4) {
        return xlsxCellXml(row, column, 0.05 + sheetIndex * 0.1);
      }
      if (column === 5) {
        return xlsxCellXml(row, column, 295 + sourceRow * 0.01);
      }
      return xlsxCellXml(row, column, `${runId}-${fileIndex}-${sheetIndex}-${sourceRow}`);
    }).join("")}</row>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="A1:${columnName(columnCount - 1)}${rowCount + 1}"/>`,
    '<sheetData>',
    rows.join(""),
    '</sheetData>',
    '</worksheet>',
  ].join("");
};

export const writeTinyXlsx = async (filePath, options) => {
  const entries = {};
  addZipText(entries, "[Content_Types].xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...Array.from({ length: options.sheetCount }, (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    '</Types>',
  ].join(""));
  addZipText(entries, "_rels/.rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join(""));
  addZipText(entries, "xl/workbook.xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets>',
    ...Array.from({ length: options.sheetCount }, (_, index) =>
      `<sheet name="Trace ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`),
    '</sheets>',
    '</workbook>',
  ].join(""));
  addZipText(entries, "xl/_rels/workbook.xml.rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...Array.from({ length: options.sheetCount }, (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`),
    '</Relationships>',
  ].join(""));

  for (let index = 0; index < options.sheetCount; index += 1) {
    addZipText(entries, `xl/worksheets/sheet${index + 1}.xml`, worksheetXml({
      ...options,
      sheetIndex: index + 1,
    }));
  }

  const bytes = zipSync(entries, { level: 6 });
  writeFileSync(filePath, bytes);
};

const addZipText = (entries, entryPath, contents) => {
  entries[entryPath] = strToU8(contents);
};


export const getImportFileMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".xls") {
    return "application/vnd.ms-excel";
  }
  return "text/csv";
};

export const createBrowserDropSpecs = ({ fixture, rowCount, runId }) =>
  fixture.files.map((file) => {
    const filePath = path.join(fixture.fixtureRoot, file.fileName);
    const stat = statSync(filePath);
    const spec = {
      fileIndex: file.fileIndex,
      fileName: file.fileName,
      kind: file.kind,
      lastModified: Math.round(stat.mtimeMs),
      type: file.type,
    };
    if (file.type === "multiSheetXlsx" || file.type === "corruptXlsx") {
      spec.base64 = readFileSync(filePath).toString("base64");
      spec.mimeType = getImportFileMimeType(filePath);
    }
    return spec;
  });

export const dispatchBrowserFixtureDrop = async (page, payload) => page.evaluate(async ({ files, rowCount, runId }) => {
  const target = document.querySelector(".file-list-viewport");
  if (!target) {
    throw new Error("file-list-viewport not found");
  }

  const createSeededRandom = (seedText) => {
    let seed = 2166136261;
    for (let index = 0; index < seedText.length; index += 1) {
      seed ^= seedText.charCodeAt(index);
      seed = Math.imul(seed, 16777619);
    }
    return () => {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
      seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
      return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
    };
  };

  const createUniqueCsvText = ({ fileIndex, kind }) => {
    const random = createSeededRandom(`${runId}:${fileIndex}:${kind}:${rowCount}`);
    const rows = [
      `SetupTitle,${kind}_${runId}_${fileIndex}`,
      `DeviceId,device-${runId}-${fileIndex}-${Math.floor(random() * 1e9)}`,
      `OperatorSeed,${random().toFixed(12)}`,
      `TestParameter,Output.Graph.XAxis.Data,${kind === "transfer" ? "Vg" : "Vd"}`,
      "DataName,Vg,Id,Ig,Vd,Temp,Noise",
    ];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const group = Math.floor(rowIndex / Math.max(1, Math.floor(rowCount / 7)));
      const sweep = rowIndex % Math.max(5, Math.floor(rowCount / 11));
      const jitter = random() - 0.5;
      const vg = kind === "transfer"
        ? -3 + sweep * 0.013 + fileIndex * 0.0007 + jitter * 0.0003
        : -2 + group * 0.2 + fileIndex * 0.0004;
      const vd = kind === "output"
        ? 0.01 + sweep * 0.011 + fileIndex * 0.0005 + jitter * 0.0002
        : 0.05 + group * 0.25 + fileIndex * 0.0006;
      const id = (1e-12 * (1 + fileIndex)) *
        Math.exp((kind === "transfer" ? vg + 3 : vd) * (1.2 + random() * 0.2));
      const ig = id * (0.012 + random() * 0.006);
      const temp = 295 + fileIndex * 0.03 + random() * 1.7;
      const noise = `${runId}-${fileIndex}-${rowIndex}-${Math.floor(random() * 1e9)}`;
      rows.push([
        "DataValue",
        vg.toPrecision(12),
        id.toExponential(12),
        ig.toExponential(12),
        vd.toPrecision(12),
        temp.toFixed(5),
        noise,
      ].join(","));
    }
    rows.push("");
    return rows.join("\n");
  };

  const createSchemaVariantCsvText = ({ fileIndex, fileName }) => [
    "Name,Description,Category,OperatorSeed",
    `alpha_${fileIndex},schema variant row A,metadata,${runId}`,
    `beta_${fileIndex},schema variant row B,notes,${fileName}`,
    "",
  ].join("\n");

  const decodeBase64 = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  };

  const createFileBody = (file) => {
    switch (file.type) {
      case "binaryCsv":
        return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x19, 0x00, 0x00]);
      case "corruptXlsx":
      case "multiSheetXlsx":
        return decodeBase64(file.base64);
      case "emptyCsv":
        return "";
      case "garbledCsv":
        return new Uint8Array([
          0xff, 0xfe, 0x00, 0x00, 0x81, 0x30, 0x81, 0x30,
          0x00, 0x01, 0x02, 0x03, 0x2c, 0x0a, 0xc3, 0x28,
        ]);
      case "schemaVariantCsv":
        return createSchemaVariantCsvText(file);
      default:
        return createUniqueCsvText(file);
    }
  };

  const getMimeType = (file) => file.mimeType ??
    (file.fileName.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv");

  const dataTransfer = new DataTransfer();
  for (const file of files) {
    dataTransfer.items.add(new File(
      [createFileBody(file)],
      file.fileName,
      {
        lastModified: file.lastModified,
        type: getMimeType(file),
      },
    ));
  }

  for (const type of ["dragenter", "dragover", "drop"]) {
    target.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  }
}, payload);

