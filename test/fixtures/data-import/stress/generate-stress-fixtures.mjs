import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import JSZip from "jszip";

const DEFAULT_OUT_DIR = path.join(process.cwd(), ".build", "bench", "import-fixtures");

const DEFAULTS = {
  tallRows: 200_000,
  tallColumns: 8,
  wideRows: 2_000,
  wideColumns: 256,
  xlsRows: 5_000,
  xlsColumns: 12,
  xlsxSheets: 3,
  xlsxRows: 5_000,
  xlsxColumns: 16,
};

const parseIntegerOption = (args, name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected a positive integer after ${name}.`);
  }
  return value;
};

const parseArgs = (args) => {
  const outIndex = args.indexOf("--out");
  return {
    outDir: outIndex === -1
      ? DEFAULT_OUT_DIR
      : path.resolve(String(args[outIndex + 1] ?? "")),
    tallRows: parseIntegerOption(args, "--tall-rows", DEFAULTS.tallRows),
    tallColumns: parseIntegerOption(args, "--tall-columns", DEFAULTS.tallColumns),
    wideRows: parseIntegerOption(args, "--wide-rows", DEFAULTS.wideRows),
    wideColumns: parseIntegerOption(args, "--wide-columns", DEFAULTS.wideColumns),
    xlsRows: parseIntegerOption(args, "--xls-rows", DEFAULTS.xlsRows),
    xlsColumns: parseIntegerOption(args, "--xls-columns", DEFAULTS.xlsColumns),
    xlsxSheets: parseIntegerOption(args, "--xlsx-sheets", DEFAULTS.xlsxSheets),
    xlsxRows: parseIntegerOption(args, "--xlsx-rows", DEFAULTS.xlsxRows),
    xlsxColumns: parseIntegerOption(args, "--xlsx-columns", DEFAULTS.xlsxColumns),
  };
};

const ensureInsideWorkspace = (targetPath) => {
  const workspace = process.cwd();
  const relative = path.relative(workspace, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside workspace: ${targetPath}`);
  }
};

const formatNumber = (value) => {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (Math.abs(value) >= 1e-3 && Math.abs(value) < 1e6) {
    return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  }
  return value.toExponential(8);
};

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeRows = async (filePath, rows) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "w");
  try {
    let buffer = "";
    let count = 0;
    for (const row of rows) {
      buffer += `${row}\n`;
      count += 1;
      if (buffer.length > 1024 * 1024) {
        await handle.write(buffer, undefined, "utf8");
        buffer = "";
      }
    }
    if (buffer) {
      await handle.write(buffer, undefined, "utf8");
    }
    return count;
  } finally {
    await handle.close();
  }
};

const createTallCsvRows = function* (rowCount, columnCount) {
  yield Array.from({ length: columnCount }, (_, index) => `col_${index + 1}`).join(",");
  for (let row = 0; row < rowCount; row += 1) {
    const values = Array.from({ length: columnCount }, (_, column) => {
      if (column === 0) {
        return row;
      }
      if (column === 1) {
        return formatNumber(Math.sin(row / 13) * 1e-7);
      }
      if (column === 2) {
        return row % 2 === 0 ? "TRUE" : "FALSE";
      }
      if (column === 3) {
        return `2024-${String((row % 12) + 1).padStart(2, "0")}-${String((row % 28) + 1).padStart(2, "0")}`;
      }
      if (column === 4) {
        return csvEscape(`device-${row % 97},sweep-${row % 11}`);
      }
      if (column === 5) {
        return csvEscape(row % 25 === 0 ? `quoted "row" ${row}` : `text-${row}`);
      }
      return formatNumber((row + 1) * (column + 1) * 0.001);
    });
    yield values.join(",");
  }
};

const createWideCsvRows = function* (rowCount, columnCount) {
  yield Array.from({ length: columnCount }, (_, index) => `wide_${index + 1}`).join(",");
  for (let row = 0; row < rowCount; row += 1) {
    yield Array.from({ length: columnCount }, (_, column) => {
      if (column % 17 === 0) {
        return "";
      }
      if (column % 13 === 0) {
        return csvEscape(`row ${row}\ncolumn ${column}`);
      }
      if (column % 11 === 0) {
        return row % 2 === 0 ? "TRUE" : "FALSE";
      }
      if (column % 7 === 0) {
        return `=literal_${row}_${column}`;
      }
      return formatNumber((row - column) / (column + 1));
    }).join(",");
  }
};

const xmlEscape = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const columnName = (zeroBasedIndex) => {
  let index = zeroBasedIndex + 1;
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
};

const cellXml = (row, column, value) => {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
};

const worksheetXml = (sheetIndex, rowCount, columnCount) => {
  const rows = [];
  rows.push(`<row r="1">${Array.from({ length: columnCount }, (_, column) =>
    cellXml(1, column, `sheet_${sheetIndex}_col_${column + 1}`),
  ).join("")}</row>`);
  for (let row = 2; row <= rowCount + 1; row += 1) {
    const sourceRow = row - 2;
    rows.push(`<row r="${row}">${Array.from({ length: columnCount }, (_, column) => {
      if (column === 0) {
        return cellXml(row, column, sourceRow);
      }
      if (column === 1) {
        return cellXml(row, column, sourceRow % 2 === 0);
      }
      if (column === 2) {
        return cellXml(row, column, `S${sheetIndex}-R${sourceRow}`);
      }
      return cellXml(row, column, (sourceRow + 1) * (column + 1) * 0.0001);
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

const writeXlsx = async (filePath, options) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const zip = new JSZip();
  zip.file("[Content_Types].xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...Array.from({ length: options.sheetCount }, (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    '</Types>',
  ].join(""));
  zip.folder("_rels").file(".rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join(""));
  zip.folder("xl").file("workbook.xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets>',
    ...Array.from({ length: options.sheetCount }, (_, index) =>
      `<sheet name="Stress ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`),
    '</sheets>',
    '</workbook>',
  ].join(""));
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...Array.from({ length: options.sheetCount }, (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`),
    '</Relationships>',
  ].join(""));

  const worksheets = zip.folder("xl").folder("worksheets");
  for (let index = 0; index < options.sheetCount; index += 1) {
    worksheets.file(`sheet${index + 1}.xml`, worksheetXml(index + 1, options.rows, options.columns));
  }

  const bytes = await zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });
  await fs.writeFile(filePath, bytes);
};

const createBiffXlsRows = function* (rowCount, columnCount) {
  yield '<html><head><meta charset="utf-8"></head><body><table>';
  yield `<tr>${Array.from({ length: columnCount }, (_, column) => `<th>biff_${column + 1}</th>`).join("")}</tr>`;
  for (let row = 0; row < rowCount; row += 1) {
    yield `<tr>${Array.from({ length: columnCount }, (_, column) => {
      const value = column % 5 === 0 ? `biff ${row},${column}` : formatNumber((row + 1) * (column + 1));
      return `<td>${xmlEscape(value)}</td>`;
    }).join("")}</tr>`;
  }
  yield "</table></body></html>";
};

const formatBytes = (value) => {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
};

const logFile = async (label, filePath) => {
  const stat = await fs.stat(filePath);
  console.log(`[stress-fixture] ${label}: ${filePath}`);
  console.log(`  bytes=${formatBytes(stat.size)}`);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  ensureInsideWorkspace(options.outDir);

  const tallCsvPath = path.join(options.outDir, "csv", `large-tall-${options.tallRows}x${options.tallColumns}.csv`);
  const tallLines = await writeRows(
    tallCsvPath,
    createTallCsvRows(options.tallRows, options.tallColumns),
  );
  await logFile(`${tallLines.toLocaleString()} CSV lines`, tallCsvPath);

  const wideCsvPath = path.join(options.outDir, "csv", `wide-mixed-${options.wideRows}x${options.wideColumns}.csv`);
  const wideLines = await writeRows(
    wideCsvPath,
    createWideCsvRows(options.wideRows, options.wideColumns),
  );
  await logFile(`${wideLines.toLocaleString()} CSV lines`, wideCsvPath);

  const xlsxPath = path.join(options.outDir, "xlsx", `multi-sheet-${options.xlsxSheets}x${options.xlsxRows}x${options.xlsxColumns}.xlsx`);
  await writeXlsx(xlsxPath, {
    columns: options.xlsxColumns,
    rows: options.xlsxRows,
    sheetCount: options.xlsxSheets,
  });
  await logFile(`${options.xlsxSheets.toLocaleString()} XLSX sheets`, xlsxPath);

  const xlsPath = path.join(options.outDir, "xls", `biff-large-${options.xlsRows}x${options.xlsColumns}.xls`);
  const xlsLines = await writeRows(
    xlsPath,
    createBiffXlsRows(options.xlsRows, options.xlsColumns),
  );
  await logFile(`${xlsLines.toLocaleString()} BIFF-compatible XLS HTML lines`, xlsPath);
};

await main();
