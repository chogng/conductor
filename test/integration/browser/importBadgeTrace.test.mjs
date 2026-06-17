import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron, chromium } from "playwright";
import { createServer } from "vite";
import JSZip from "jszip";

const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const defaultOutputRoot = path.join(workspace, ".build", "bench", "import-badge-trace");
const traceQuery = "conductorImportBadgeTrace=1";

const parseArgs = () => {
  const args = new Map();
  const flags = new Set();
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      args.set(key, rest.join("="));
    } else if (arg.startsWith("--")) {
      flags.add(arg.slice(2));
    }
  }

  return {
    autoBrowser: flags.has("auto-browser"),
    autoFolder: flags.has("auto-folder"),
    clean: !flags.has("keep-data"),
    fileCount: readPositiveInteger(args.get("files"), 40),
    outputRoot: path.resolve(args.get("out") || defaultOutputRoot),
    profile: args.get("profile") || "healthy",
    rowCount: readPositiveInteger(args.get("rows"), 4000),
    runtime: args.get("runtime") || "browser",
    sampleMs: readPositiveInteger(args.get("sample-ms"), 100),
    timeoutMs: readPositiveInteger(args.get("timeout-ms"), 120000),
  };
};

const readPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const formatMs = (value) => `${Math.round(value)}ms`;

const createRunId = () =>
  `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;

const createUniqueImportFixture = async ({ fileCount, profile, rowCount, runId, outputRoot }) => {
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
      expectedAssessmentBadge: fixtureType === "healthyCsv" || fixtureType === "schemaVariantCsv",
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
    expectedAssessmentBadgeCount: files.filter(file => file.expectedAssessmentBadge).length,
    expectedPrepareCompletionCount: files.length,
    expectedPrepareFailureCount: files.filter(file => file.expectedPrepareFailure).length,
    files,
    fixtureRoot,
    profile,
  };
};

const createFixtureFileName = ({ index, kind, runId, type }) => {
  const prefix = String(index + 1).padStart(4, "0");
  if (type === "multiSheetXlsx" || type === "corruptXlsx") {
    const label = type === "multiSheetXlsx" ? "multi-sheet" : "corrupt-xlsx";
    return `${prefix}-${label}-${runId}.xlsx`;
  }
  const label = type === "healthyCsv" ? kind : type.replace(/Csv$/, "");
  return `${prefix}-${label}-${runId}.csv`;
};

const getFixtureType = ({ fileCount, index, profile }) => {
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

const writeFixtureFile = async (filePath, options) => {
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

const writeUniqueCsv = (filePath, { fileIndex, kind, rowCount, runId }) =>
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

const xmlEscape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

const columnName = (index) => {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
};

const xlsxCellXml = (row, column, value) => {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
};

const worksheetXml = ({ columnCount, fileIndex, rowCount, runId, sheetIndex }) => {
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

const writeTinyXlsx = async (filePath, options) => {
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
      `<sheet name="Trace ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`),
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
    worksheets.file(`sheet${index + 1}.xml`, worksheetXml({
      ...options,
      sheetIndex: index + 1,
    }));
  }

  const bytes = await zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });
  writeFileSync(filePath, bytes);
};

const startViteServer = async () => {
  const server = await createServer({
    configFile: path.join(workspace, "vite.config.ts"),
    configLoader: "runner",
    root: workspace,
    server: {
      host: "127.0.0.1",
      port: 0,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.equal(typeof address, "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
};

const withTraceQuery = (url) => `${url}${url.includes("?") ? "&" : "?"}${traceQuery}`;

const openRuntime = async ({ autoFolderPath, runtime, baseUrl }) => {
  if (runtime === "desktop") {
    const build = spawnSync("npm", ["run", "build:desktop:core"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: "inherit",
    });
    assert.equal(build.status, 0, "desktop core build failed");
    const app = await electron.launch({
      args: [".", "--user-data-dir", path.join(tmpdir(), `conductor-import-trace-${Date.now()}`)],
      cwd: workspace,
      env: {
        ...process.env,
        CONDUCTOR_DEV: "1",
        ...(autoFolderPath ? { CONDUCTOR_IMPORT_TRACE_FOLDER: autoFolderPath } : {}),
        ELECTRON_START_URL: withTraceQuery(`${baseUrl}/src/cs/code/electron-browser/workbench/workbench-dev.html`),
      },
    });
    const page = await app.firstWindow();
    return {
      browser: null,
      close: () => app.close(),
      page,
      processRootPid: app.process()?.pid ?? null,
    };
  }

  const processRowsBeforeLaunch = readProcessRows();
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(withTraceQuery(`${baseUrl}/src/cs/code/browser/workbench/workbench-dev.html`), {
    waitUntil: "domcontentloaded",
  });
  return {
    browser,
    close: () => browser.close(),
    page,
    processRootPid: resolveBrowserProcessPid(browser) ??
      findNewBrowserProcessRootPid(processRowsBeforeLaunch),
  };
};

const getOpenFolderButton = (page) =>
  page.getByRole("button", { name: /^(打开文件夹|导入文件夹|Open Folder)$/ });

const getImportFileMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".xls") {
    return "application/vnd.ms-excel";
  }
  return "text/csv";
};

const createBrowserDropSpecs = ({ fixture, rowCount, runId }) =>
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

const dispatchBrowserFixtureDrop = async (page, payload) => page.evaluate(async ({ files, rowCount, runId }) => {
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

const startResourceSampler = ({ page, processRootPid, runtime, sampleMs }) => {
  const samples = [];
  let stopped = false;
  const cdpSession = page.context().newCDPSession(page)
    .then(async (session) => {
      await session.send("Performance.enable").catch(() => {});
      return session;
    })
    .catch(() => null);
  const sample = async () => {
    if (stopped) {
      return;
    }
    const cdp = await cdpSession;
    const performanceMetrics = cdp
      ? await cdp.send("Performance.getMetrics")
          .then(result => Object.fromEntries(
            result.metrics.map(metric => [metric.name, metric.value]),
          ))
          .catch(() => null)
      : null;
    const renderer = await page.evaluate(() => {
      const memory = performance.memory;
      return {
        timestamp: performance.now(),
        usedJSHeapSize: memory?.usedJSHeapSize ?? null,
        totalJSHeapSize: memory?.totalJSHeapSize ?? null,
        jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null,
      };
    }).catch(() => null);
    samples.push({
      process: readProcessTreeSample(processRootPid),
      performanceMetrics,
      renderer,
      runtime,
      wallTime: Date.now(),
    });
  };
  const interval = setInterval(() => {
    void sample();
  }, sampleMs);
  void sample();
  return {
    samples,
    stop: () => {
      stopped = true;
      clearInterval(interval);
    },
  };
};

const readProcessTreeSample = (rootPid) => {
  if (!rootPid) {
    return null;
  }
  const rows = readProcessRows();
  if (!rows.length) {
    return null;
  }
  const byParent = new Map();
  for (const row of rows) {
    const list = byParent.get(row.ppid) ?? [];
    list.push(row);
    byParent.set(row.ppid, list);
  }
  const descendants = [];
  const visit = (pid) => {
    for (const child of byParent.get(pid) ?? []) {
      descendants.push(child);
      visit(child.pid);
    }
  };
  const root = rows.find(row => row.pid === rootPid);
  if (root) {
    descendants.push(root);
  }
  visit(rootPid);
  return {
    cpuPercent: descendants.reduce((sum, row) => sum + row.cpuPercent, 0),
    processCount: descendants.length,
    rssKb: descendants.reduce((sum, row) => sum + row.rssKb, 0),
    rootPid,
  };
};

const readProcessRows = () => {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,%cpu=,rss=,comm="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
      return match
        ? {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            cpuPercent: Number(match[3]),
            rssKb: Number(match[4]),
            command: match[5],
          }
        : null;
    })
    .filter(Boolean);
};

const resolveBrowserProcessPid = (browser) => {
  const processGetter = browser?.process;
  if (typeof processGetter !== "function") {
    return null;
  }

  try {
    return processGetter.call(browser)?.pid ?? null;
  } catch {
    return null;
  }
};

const findNewBrowserProcessRootPid = (rowsBeforeLaunch) => {
  const beforePids = new Set(rowsBeforeLaunch.map(row => row.pid));
  const browserRows = readProcessRows().filter(row =>
    !beforePids.has(row.pid) &&
    /chrom(e|ium)|google chrome/i.test(row.command)
  );
  if (!browserRows.length) {
    return null;
  }

  const browserPids = new Set(browserRows.map(row => row.pid));
  const roots = browserRows.filter(row => !browserPids.has(row.ppid));
  return (roots[0] ?? browserRows[0]).pid;
};

const readTraceState = async (page) => page.evaluate(() => {
  const trace = window.__conductorImportBadgeTrace;
  const hosts = [...document.querySelectorAll("[data-badge-state]")];
  const apply = [...document.querySelectorAll("button")]
    .find(button => /^(应用到所有|Apply to All)$/.test((button.textContent || "").trim()));
  return {
    dom: {
      assessment: hosts.filter(host => host.dataset.badgeSource === "assessment").length,
      fast: hosts.filter(host => host.dataset.badgeSource === "fast").length,
      hosts: hosts.length,
      loading: [...document.querySelectorAll("[data-source-status]")]
        .filter(host => host.dataset.sourceStatus === "pending" || host.dataset.sourceStatus === "preparing").length,
      pending: hosts.filter(host => host.dataset.badgeState === "pending").length,
      applyDisabled: apply ? apply.disabled : null,
      applyVisible: Boolean(apply),
    },
    events: trace?.events ? [...trace.events] : [],
  };
});

const installPageTraceObservers = async (page) => page.evaluate(() => {
  const target = window;
  if (target.__conductorImportBadgeTraceObserverInstalled) {
    return;
  }

  target.__conductorImportBadgeTraceObserverInstalled = true;
  const traceMark = (stage, meta = {}) => {
    const trace = target.__conductorImportBadgeTrace;
    if (trace && typeof trace.mark === "function") {
      trace.mark(stage, meta);
    }
  };
  const readBadgeDom = () => {
    const hosts = [...document.querySelectorAll("[data-badge-state]")];
    const sourceHosts = [...document.querySelectorAll("[data-source-status]")];
    return {
      assessmentBadgeCount: hosts.filter(host => host.dataset.badgeSource === "assessment").length,
      fastBadgeCount: hosts.filter(host => host.dataset.badgeSource === "fast").length,
      hostCount: hosts.length,
      loadingSourceCount: sourceHosts.filter(host =>
        host.dataset.sourceStatus === "pending" ||
        host.dataset.sourceStatus === "preparing"
      ).length,
      pendingBadgeCount: hosts.filter(host => host.dataset.badgeState === "pending").length,
    };
  };
  let badgeSignature = "";
  const emitBadgeDom = () => {
    const dom = readBadgeDom();
    const signature = [
      dom.assessmentBadgeCount,
      dom.fastBadgeCount,
      dom.hostCount,
      dom.loadingSourceCount,
      dom.pendingBadgeCount,
    ].join(":");
    if (signature === badgeSignature) {
      return;
    }

    badgeSignature = signature;
    traceMark("import.badge.dom", dom);
  };

  let pendingBadgeRead = false;
  const scheduleBadgeRead = () => {
    if (pendingBadgeRead) {
      return;
    }

    pendingBadgeRead = true;
    const run = () => {
      pendingBadgeRead = false;
      emitBadgeDom();
    };
    if (typeof target.requestAnimationFrame === "function") {
      target.requestAnimationFrame(run);
      return;
    }
    target.setTimeout(run, 0);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutation =>
      mutation.type === "childList" ||
      mutation.attributeName === "data-badge-state" ||
      mutation.attributeName === "data-badge-source" ||
      mutation.attributeName === "data-source-status"
    )) {
      scheduleBadgeRead();
    }
  });
  observer.observe(document.body || document.documentElement, {
    attributeFilter: ["data-badge-state", "data-badge-source", "data-source-status"],
    attributes: true,
    childList: true,
    subtree: true,
  });

  const intervalMs = 50;
  let expected = performance.now() + intervalMs;
  const lagTimer = target.setInterval(() => {
    const now = performance.now();
    const lagMs = now - expected;
    expected = now + intervalMs;
    if (lagMs > 24) {
      traceMark("import.runtime.eventLoopLag", {
        durationMs: lagMs,
        intervalMs,
      });
    }
  }, intervalMs);

  let longTaskObserver = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 24) {
          continue;
        }
        traceMark("import.runtime.longTask", {
          durationMs: entry.duration,
          name: entry.name,
          startTime: entry.startTime,
        });
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    longTaskObserver = null;
  }

  target.__conductorImportBadgeTraceObserverStop = () => {
    observer.disconnect();
    target.clearInterval(lagTimer);
    longTaskObserver?.disconnect();
    target.__conductorImportBadgeTraceObserverInstalled = false;
  };
  emitBadgeDom();
});

const stopPageTraceObservers = async (page) => page.evaluate(() => {
  window.__conductorImportBadgeTraceObserverStop?.();
}).catch(() => {});

const summarizeMilestones = (
  events,
  {
    expectedAssessmentBadgeCount,
    expectedPrepareCompletionCount,
  },
) => {
  const baseline = events[0]?.timestamp ?? 0;
  const relative = event => event ? event.timestamp - baseline : null;
  const findBadge = (stage, threshold) => events.find(event =>
    event.stage === stage &&
    Number(event.meta?.assessmentBadgeCount) >= threshold
  );
  const findProjection = threshold => findBadge("import.badge.projection", threshold);
  const findDom = threshold => findBadge("import.badge.dom", threshold);
  const prepareCompletions = events.filter(event =>
    event.stage === "import.prepare.file.complete" ||
    event.stage === "import.prepare.file.failed"
  );
  const findPrepare = threshold => prepareCompletions[threshold - 1];
  const prepareHalf = Math.max(1, Math.ceil(expectedPrepareCompletionCount / 2));
  const badgeHalf = Math.max(1, Math.ceil(expectedAssessmentBadgeCount / 2));
  const firstDom = expectedAssessmentBadgeCount > 0 ? findDom(1) : null;
  const halfDom = expectedAssessmentBadgeCount > 0 ? findDom(badgeHalf) : null;
  const allDom = expectedAssessmentBadgeCount > 0 ? findDom(expectedAssessmentBadgeCount) : null;
  const firstProjection = expectedAssessmentBadgeCount > 0 ? findProjection(1) : null;
  const halfProjection = expectedAssessmentBadgeCount > 0 ? findProjection(badgeHalf) : null;
  const allProjection = expectedAssessmentBadgeCount > 0 ? findProjection(expectedAssessmentBadgeCount) : null;
  return {
    firstAssessmentBadgeMs: relative(firstDom ?? firstProjection),
    halfAssessmentBadgeMs: relative(halfDom ?? halfProjection),
    allAssessmentBadgeMs: relative(allDom ?? allProjection),
    firstAssessmentBadgeDomMs: relative(firstDom),
    halfAssessmentBadgeDomMs: relative(halfDom),
    allAssessmentBadgeDomMs: relative(allDom),
    firstAssessmentBadgeProjectionMs: relative(firstProjection),
    halfAssessmentBadgeProjectionMs: relative(halfProjection),
    allAssessmentBadgeProjectionMs: relative(allProjection),
    firstPrepareCompleteMs: expectedPrepareCompletionCount > 0 ? relative(findPrepare(1)) : null,
    halfPrepareCompleteMs: expectedPrepareCompletionCount > 0 ? relative(findPrepare(prepareHalf)) : null,
    allPrepareCompleteMs: expectedPrepareCompletionCount > 0
      ? relative(findPrepare(expectedPrepareCompletionCount))
      : null,
    sessionCommitMs: relative(events.find(event => event.stage === "import.session.commit.complete")),
  };
};

const waitForTraceCompletion = async ({
  expectedAssessmentBadgeCount,
  expectedPrepareCompletionCount,
  page,
  timeoutMs,
}) => {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await readTraceState(page);
    const events = latest.events;
    const projection = [...events].reverse().find(event => event.stage === "import.badge.projection");
    const prepareCompletionCount = events.filter(event =>
      event.stage === "import.prepare.file.complete" ||
      event.stage === "import.prepare.file.failed"
    ).length;
    const assessmentBadgeCount = Math.max(
      Number(projection?.meta?.assessmentBadgeCount ?? 0),
      Number(latest.dom?.assessment ?? 0),
    );
    const loadingSourceCount = Math.max(
      Number(projection?.meta?.loadingSourceCount ?? 0),
      Number(latest.dom?.loading ?? 0),
    );
    if (
      prepareCompletionCount >= expectedPrepareCompletionCount &&
      assessmentBadgeCount >= expectedAssessmentBadgeCount &&
      loadingSourceCount === 0
    ) {
      return latest;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(
    `Timed out waiting for ${expectedPrepareCompletionCount} prepare completions and ` +
      `${expectedAssessmentBadgeCount} assessment badges. Last state: ${JSON.stringify(latest?.dom)}`,
  );
};

const readNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const roundMetric = (value) => value == null ? null : Math.round(value * 10) / 10;

const summarizeDurations = (values) => {
  const numbers = values
    .map(readNumber)
    .filter(value => value != null && value >= 0)
    .sort((a, b) => a - b);
  if (!numbers.length) {
    return {
      avgMs: null,
      count: 0,
      maxMs: null,
      minMs: null,
      p50Ms: null,
      p90Ms: null,
      p95Ms: null,
      totalMs: null,
    };
  }

  const percentile = (ratio) => {
    const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * ratio) - 1));
    return numbers[index];
  };
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return {
    avgMs: roundMetric(total / numbers.length),
    count: numbers.length,
    maxMs: roundMetric(numbers[numbers.length - 1]),
    minMs: roundMetric(numbers[0]),
    p50Ms: roundMetric(percentile(0.5)),
    p90Ms: roundMetric(percentile(0.9)),
    p95Ms: roundMetric(percentile(0.95)),
    totalMs: roundMetric(total),
  };
};

const summarizeStageDuration = (events, stage, key = "durationMs") =>
  summarizeDurations(events
    .filter(event => event.stage === stage)
    .map(event => event.meta?.[key]));

const summarizeMatchedDurations = (events, startStage, endStages) => {
  const startsByKey = new Map();
  const durations = [];
  const getKey = event => [
    event.meta?.fileName ?? "",
    event.meta?.relativePath ?? "",
    event.meta?.index ?? "",
    event.meta?.sourceSizeBytes ?? "",
  ].join("|");

  for (const event of events) {
    if (event.stage === startStage) {
      const key = getKey(event);
      const starts = startsByKey.get(key) ?? [];
      starts.push(event);
      startsByKey.set(key, starts);
      continue;
    }

    if (!endStages.includes(event.stage)) {
      continue;
    }

    const key = getKey(event);
    const starts = startsByKey.get(key);
    const start = starts?.shift();
    if (!start) {
      continue;
    }
    durations.push(event.timestamp - start.timestamp);
  }

  return summarizeDurations(durations);
};

const summarizeResourceSamples = (samples) => {
  const cpu = samples.map(sample => sample.process?.cpuPercent).filter(value => typeof value === "number");
  const rssMb = samples
    .map(sample => typeof sample.process?.rssKb === "number" ? sample.process.rssKb / 1024 : null)
    .filter(value => value != null);
  const usedHeapMb = samples
    .map(sample => typeof sample.renderer?.usedJSHeapSize === "number"
      ? sample.renderer.usedJSHeapSize / 1024 / 1024
      : null)
    .filter(value => value != null);
  const totalHeapMb = samples
    .map(sample => typeof sample.renderer?.totalJSHeapSize === "number"
      ? sample.renderer.totalJSHeapSize / 1024 / 1024
      : null)
    .filter(value => value != null);
  const avg = values => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const max = values => values.length ? Math.max(...values) : null;
  const first = samples[0];
  const last = samples[samples.length - 1];

  return {
    avgCpuPercent: roundMetric(avg(cpu)),
    durationMs: first && last ? last.wallTime - first.wallTime : null,
    maxCpuPercent: roundMetric(max(cpu)),
    maxRssMb: roundMetric(max(rssMb)),
    maxTotalJsHeapMb: roundMetric(max(totalHeapMb)),
    maxUsedJsHeapMb: roundMetric(max(usedHeapMb)),
    sampleCount: samples.length,
  };
};

const countBy = (values) => {
  const counts = {};
  for (const value of values) {
    const key = String(value ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

const summarizePrepareOutcomes = (events) => {
  const backendResults = events.filter(event => event.stage === "import.prepare.backend.result");
  const fileCompletes = events.filter(event => event.stage === "import.prepare.file.complete");
  const fileFailures = events.filter(event => event.stage === "import.prepare.file.failed");
  return {
    backend: {
      cacheHitCount: backendResults.filter(event => event.meta?.cacheHit === true).length,
      count: backendResults.length,
      healthStates: countBy(backendResults.map(event => event.meta?.healthState ?? "none")),
      okCount: backendResults.filter(event => event.meta?.ok === true).length,
      sourceCounts: countBy(backendResults.map(event => event.meta?.source ?? "unknown")),
      failureCodes: countBy(
        backendResults
          .filter(event => event.meta?.ok !== true)
          .map(event => event.meta?.code ?? "unknown"),
      ),
    },
    files: {
      completeCount: fileCompletes.length,
      failedCount: fileFailures.length,
      preparedAssessmentCount: fileCompletes.filter(event =>
        event.meta?.hasPreparedAssessment === true
      ).length,
      failureCodes: countBy(fileFailures.map(event => event.meta?.code ?? "unknown")),
      sourceKinds: countBy([
        ...fileCompletes.map(event => event.meta?.sourceKind ?? "unknown"),
        ...fileFailures.map(event => event.meta?.sourceKind ?? "unknown"),
      ]),
    },
  };
};

const buildBottleneckHints = ({ milestones, stages, resources }) => {
  const hints = [];
  const allPrepareMs = readNumber(milestones.allPrepareCompleteMs);
  const allBadgeDomMs = readNumber(milestones.allAssessmentBadgeDomMs);
  const backendWallMs = readNumber(stages.backendInvokeMs.maxMs);
  const folderReadDirMs = readNumber(stages.folderReadDirMs.totalMs) ?? 0;
  const folderStatMs = readNumber(stages.folderStatBatchMs.totalMs) ?? 0;
  const folderIoMs = folderReadDirMs + folderStatMs;
  const folderOnBatchMs = readNumber(stages.folderOnBatchMs.totalMs);
  const materializeTotalMs = readNumber(stages.materializeMs.totalMs);
  const appendTotalMs = readNumber(stages.appendMs.totalMs);
  const longTaskMaxMs = readNumber(stages.longTaskMs.maxMs);
  const maxHeapMb = readNumber(resources.maxUsedJsHeapMb);

  if (allPrepareMs != null && allBadgeDomMs != null && allBadgeDomMs - allPrepareMs > 100) {
    hints.push("Badge DOM display trails prepare completion by >100ms; inspect Explorer projection/render batching.");
  }
  if (allPrepareMs != null && backendWallMs != null && backendWallMs > allPrepareMs * 0.65) {
    hints.push("Backend invoke wall time dominates prepare; inspect IPC/main/Rust scheduling or native IO.");
  }
  if (allPrepareMs != null && folderIoMs > allPrepareMs * 0.35) {
    hints.push("Folder scan is a large share of import time; inspect readDir/stat batching and native metadata IO.");
  }
  if (allPrepareMs != null && folderOnBatchMs != null && folderOnBatchMs > allPrepareMs * 0.25) {
    hints.push("Folder walk is gated by onBatch preparation; inspect first-file prepare and scan/prepare overlap.");
  }
  if (allPrepareMs != null && materializeTotalMs != null && materializeTotalMs > allPrepareMs * 0.25) {
    hints.push("Renderer materialization is significant; inspect validation, File construction, and record shaping.");
  }
  if (allPrepareMs != null && appendTotalMs != null && appendTotalMs > allPrepareMs * 0.15) {
    hints.push("Append/projection callback cost is visible; inspect Explorer pending source updates and batching.");
  }
  if (longTaskMaxMs != null && longTaskMaxMs > 80) {
    hints.push("Renderer long tasks exceed 80ms; inspect synchronous parse/render/record shaping on the UI thread.");
  }
  if (maxHeapMb != null && maxHeapMb > 512) {
    hints.push("Renderer JS heap exceeds 512MB; inspect duplicated row/text retention and large File objects.");
  }

  return hints;
};

const summarizeTraceAnalysis = ({ events, fixture, milestones, resourceSamples }) => {
  const stages = {
    appendMs: summarizeStageDuration(events, "import.prepare.append"),
    backendInvokeMs: summarizeStageDuration(events, "import.prepare.backend.invoke.complete"),
    backendResultRustMs: summarizeStageDuration(events, "import.prepare.backend.result", "resultDurationMs"),
    convertFileMs: summarizeMatchedDurations(events, "import.prepare.convert.start", ["import.prepare.convert.complete"]),
    dropCollectionMs: summarizeStageDuration(events, "import.drop.collected"),
    eventLoopLagMs: summarizeStageDuration(events, "import.runtime.eventLoopLag"),
    folderOnBatchMs: summarizeStageDuration(events, "import.folder.onBatch.complete"),
    folderReadDirMs: summarizeStageDuration(events, "import.folder.readDir.complete"),
    folderScanMs: summarizeStageDuration(events, "import.folder.scan.complete"),
    folderStatBatchMs: summarizeStageDuration(events, "import.folder.statBatch.complete"),
    longTaskMs: summarizeStageDuration(events, "import.runtime.longTask"),
    materializeMs: summarizeMatchedDurations(events, "import.prepare.result.materialize.start", ["import.prepare.result.materialize.complete"]),
    prepareFileMs: summarizeMatchedDurations(events, "import.prepare.file.start", [
      "import.prepare.file.complete",
      "import.prepare.file.failed",
    ]),
  };
  const resources = summarizeResourceSamples(resourceSamples);
  return {
    bottleneckHints: buildBottleneckHints({ milestones, resources, stages }),
    fixture: {
      composition: fixture.composition,
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
      expectedPrepareFailureCount: fixture.expectedPrepareFailureCount,
      profile: fixture.profile,
    },
    outcomes: summarizePrepareOutcomes(events),
    resources,
    stages,
  };
};

const main = async () => {
  const options = parseArgs();
  assert.ok(options.runtime === "browser" || options.runtime === "desktop", "runtime must be browser or desktop");
  const runId = createRunId();
  mkdirSync(options.outputRoot, { recursive: true });
  const fixture = await createUniqueImportFixture({
    fileCount: options.fileCount,
    outputRoot: options.outputRoot,
    profile: options.profile,
    rowCount: options.rowCount,
    runId,
  });
  const { fixtureRoot } = fixture;

  const server = await startViteServer();
  let runtime = null;
  let sampler = null;
  try {
    runtime = await openRuntime({
      autoFolderPath: options.runtime === "desktop" && options.autoFolder ? fixtureRoot : null,
      baseUrl: server.baseUrl,
      runtime: options.runtime,
    });
    await getOpenFolderButton(runtime.page).waitFor({ timeout: 30000 });
    await installPageTraceObservers(runtime.page);
    sampler = startResourceSampler({
      page: runtime.page,
      processRootPid: runtime.processRootPid,
      runtime: options.runtime,
      sampleMs: options.sampleMs,
    });

    console.log(`[import-badge-trace] runtime=${options.runtime}`);
    console.log(`[import-badge-trace] fixture=${fixtureRoot}`);
    console.log(`[import-badge-trace] profile=${fixture.profile} composition=${JSON.stringify(fixture.composition)}`);
    console.log("[import-badge-trace] Click Open Folder in the app and select the fixture directory.");
    console.log("[import-badge-trace] Waiting for all assessment badges...");
    if (options.autoFolder) {
      assert.equal(options.runtime, "desktop", "--auto-folder is currently supported for desktop runtime");
      await getOpenFolderButton(runtime.page).click();
    } else if (options.autoBrowser) {
      const files = createBrowserDropSpecs({
        fixture,
        rowCount: options.rowCount,
        runId,
      });
      await runtime.page.locator(".file-list-viewport").waitFor({ timeout: 30000 });
      await dispatchBrowserFixtureDrop(runtime.page, {
        files,
        rowCount: options.rowCount,
        runId,
      });
    }
    const finalState = await waitForTraceCompletion({
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
      page: runtime.page,
      timeoutMs: options.timeoutMs,
    });
    sampler.stop();
    const milestones = summarizeMilestones(finalState.events, {
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
    });
    const analysis = summarizeTraceAnalysis({
      events: finalState.events,
      fixture,
      milestones,
      resourceSamples: sampler.samples,
    });
    const report = {
      analysis,
      fixture,
      fixtureRoot,
      generatedAt: new Date().toISOString(),
      options,
      runId,
      runtime: options.runtime,
      finalDomState: finalState.dom,
      milestones,
      resourceSamples: sampler.samples,
      traceEvents: finalState.events,
    };
    const reportPath = path.join(options.outputRoot, `${runId}-${options.runtime}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[import-badge-trace] report=${reportPath}`);
    console.log(`[import-badge-trace] milestones=${JSON.stringify(Object.fromEntries(Object.entries(milestones).map(([key, value]) => [key, value == null ? null : formatMs(value)])), null, 2)}`);
    console.log(`[import-badge-trace] analysis=${JSON.stringify(analysis, null, 2)}`);
  } finally {
    sampler?.stop();
    if (runtime?.page) {
      await stopPageTraceObservers(runtime.page);
    }
    await runtime?.close()?.catch?.(() => {});
    await server.close();
    if (options.clean && existsSync(fixtureRoot)) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
};

await main();
