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
const stressViewport = { width: 1920, height: 1200 };

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

  const fileCount = readPositiveInteger(args.get("files"), 40);
  return {
    analysisPerf: !flags.has("no-analysis-perf"),
    autoBrowser: flags.has("auto-browser"),
    autoFolder: flags.has("auto-folder"),
    browserChannel: args.get("browser-channel") || null,
    clean: !flags.has("keep-data"),
    fileSwitch: flags.has("file-switch"),
    fileSwitchCount: readPositiveInteger(args.get("file-switch-count"), Math.min(20, fileCount)),
    fileSwitchIntervalMs: readPositiveInteger(
      args.get("file-switch-interval-ms") || args.get("file-switch-storm-interval-ms"),
      16,
    ),
    fileSwitchLive: flags.has("file-switch-live"),
    fileSwitchLiveMs: readPositiveInteger(args.get("file-switch-live-ms"), 8000),
    fileCount,
    liveStressParallel: flags.has("live-stress-parallel"),
    outputRoot: path.resolve(args.get("out") || defaultOutputRoot),
    profile: args.get("profile") || "healthy",
    rowCount: readPositiveInteger(args.get("rows"), 4000),
    runtime: args.get("runtime") || "browser",
    sampleMs: readPositiveInteger(args.get("sample-ms"), 100),
    thumbnailHover: flags.has("thumbnail-hover"),
    thumbnailHoverCount: readPositiveInteger(args.get("thumbnail-hover-count"), Math.min(12, fileCount)),
    thumbnailHoverLive: flags.has("thumbnail-hover-live"),
    thumbnailHoverLiveMs: readPositiveInteger(args.get("thumbnail-hover-live-ms"), 8000),
    thumbnailHoverLiveWatchOnly: flags.has("thumbnail-hover-live-watch-only"),
    thumbnailHoverStormIntervalMs: readPositiveInteger(args.get("thumbnail-hover-storm-interval-ms"), 16),
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

const openRuntime = async ({ autoFolderPath, browserChannel, runtime, baseUrl }) => {
  if (runtime === "desktop") {
    const build = spawnSync("npm", ["run", "build:desktop:core"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: "inherit",
    });
    assert.equal(build.status, 0, "desktop core build failed");
    const app = await electron.launch({
      args: [
        ".",
        "--window-size=1920,1200",
        "--user-data-dir",
        path.join(tmpdir(), `conductor-import-trace-${Date.now()}`),
      ],
      cwd: workspace,
      env: {
        ...process.env,
        CONDUCTOR_DEV: "1",
        ...(autoFolderPath ? { CONDUCTOR_IMPORT_TRACE_FOLDER: autoFolderPath } : {}),
        ELECTRON_START_URL: withTraceQuery(`${baseUrl}/src/cs/code/electron-browser/workbench/workbench-dev.html`),
      },
    });
    const page = await app.firstWindow();
    await page.setViewportSize(stressViewport).catch(() => {});
    return {
      browser: null,
      close: () => app.close(),
      page,
      processRootPid: app.process()?.pid ?? null,
    };
  }

  const processRowsBeforeLaunch = readProcessRows();
  const browser = await chromium.launch({
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: false,
  });
  const page = await browser.newPage({ viewport: stressViewport });
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

const enableAnalysisPerf = async (page) => page.evaluate(() => {
  window.localStorage.setItem("conductor.perf", "1");
  window.conductorAnalysisPerf?.clear?.();
}).catch(() => {});

const readAnalysisPerfReport = async (page) => page.evaluate(() =>
  window.conductorAnalysisPerf?.getReport?.() ?? null
).catch(() => null);

const markPageTrace = async (page, stage, meta = {}) => page.evaluate(({
  meta: markMeta,
  stage: markStage,
}) =>
  window.__conductorImportBadgeTrace?.mark?.(markStage, markMeta) ?? null,
{ meta, stage },
).catch(() => null);

const createPhaseRecorder = (page, runtime) => {
  const anchors = [];
  return {
    anchors,
    mark: async (name, meta = {}) => {
      const anchor = {
        meta,
        name,
        runtime,
        wallTime: Date.now(),
      };
      anchors.push(anchor);
      await markPageTrace(page, "bench.phase", {
        ...meta,
        phase: name,
        runtime,
        wallTime: anchor.wallTime,
      });
      return anchor;
    },
  };
};

const readThumbnailHoverDomState = async (page) => page.evaluate(() => {
  const fileItems = [...document.querySelectorAll(".file-list-item[data-file-id]")];
  const chartStateCounts = fileItems.reduce((counts, item) => {
    const key = item.dataset.chartState || "none";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const readyItems = fileItems.filter(item =>
    item.dataset.hasChartData === "true" ||
    item.dataset.chartState === "ready"
  );
  return {
    bodyTail: document.body.innerText.slice(-2000),
    chartReadyCount: readyItems.length,
    chartStateCounts,
    fileItemCount: fileItems.length,
    hoverVisible: Boolean(document.querySelector(".file-list-hover--thumbnail")),
    thumbnailCanvasCount: document.querySelectorAll(".file-list-hover--thumbnail canvas.thumbnail_view_chart_canvas").length,
    thumbnailLoadingCount: document.querySelectorAll(".file-list-hover--thumbnail .thumbnail_view_chart_loading").length,
  };
});

const getApplyAllButton = (page) =>
  page.getByRole("button", { name: /^(应用到所有|Apply to All)$/ });

const waitForApplyAllReady = async (page, timeoutMs) => page.waitForFunction(
  () => {
    const apply = [...document.querySelectorAll("button")]
      .find(button => /^(应用到所有|Apply to All)$/.test((button.textContent || "").trim()));
    const loading = [...document.querySelectorAll("[data-source-status]")]
      .filter(host => host.dataset.sourceStatus === "pending" || host.dataset.sourceStatus === "preparing")
      .length;
    return Boolean(apply && !apply.disabled && loading === 0);
  },
  undefined,
  { timeout: timeoutMs },
);

const runTemplateApplyForThumbnailHover = async ({
  expectedReadyCount,
  page,
  timeoutMs,
}) => {
  const before = await readThumbnailHoverDomState(page);
  await waitForApplyAllReady(page, timeoutMs);
  const startedAt = Date.now();
  await getApplyAllButton(page).click();
  await page.waitForFunction(
    ({ expectedReadyCount: expected }) => {
      const fileItems = [...document.querySelectorAll(".file-list-item[data-file-id]")];
      const required = Math.min(
        Math.max(1, expected),
        Math.max(1, fileItems.length),
      );
      const readyItems = fileItems.filter(item =>
        item.dataset.hasChartData === "true" ||
        item.dataset.chartState === "ready"
      );
      return readyItems.length >= required;
    },
    { expectedReadyCount },
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(300);
  const after = await readThumbnailHoverDomState(page);
  return {
    after,
    before,
    durationMs: Date.now() - startedAt,
    expectedReadyCount,
  };
};

const readVisibleThumbnailHoverTargets = async (page, count) => page.evaluate((targetCount) =>
  [...document.querySelectorAll(".file-list-item[data-file-id]")]
    .map((item, itemIndex) => ({
      chartState: item.dataset.chartState || null,
      fileId: item.dataset.fileId || "",
      hasChartData: item.dataset.hasChartData === "true",
      itemIndex,
      label: (item.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
      selected: item.dataset.selected === "true",
    }))
    .filter(target =>
      target.fileId &&
      (target.hasChartData ||
        target.chartState === "ready" ||
        target.chartState === "queued" ||
        target.chartState === "processing")
    )
    .slice(0, targetCount),
  count,
);

const waitForVisibleThumbnailHoverTargets = async (page, count, timeoutMs) => {
  const startedAt = Date.now();
  let targets = [];
  while (Date.now() - startedAt < timeoutMs) {
    targets = await readVisibleThumbnailHoverTargets(page, count);
    if (targets.length) {
      return targets;
    }
    await page.waitForTimeout(20);
  }
  return targets;
};

const dispatchSyntheticFileHover = async (page, fileId, previousFileId = null) => page.evaluate(({
  fileId: targetFileId,
  previousFileId: previousTargetFileId,
}) => {
  const findItem = (id) =>
    [...document.querySelectorAll(".file-list-item[data-file-id]")]
      .find(item => item instanceof HTMLElement && item.dataset.fileId === id) ?? null;
  const target = findItem(targetFileId);
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  window.__thumbnailHoverLiveTrace?.recordDispatch?.(targetFileId);

  const previous = previousTargetFileId ? findItem(previousTargetFileId) : null;
  if (previous instanceof HTMLElement && previous !== target) {
    previous.dispatchEvent(new MouseEvent("mouseout", {
      bubbles: true,
      cancelable: true,
      relatedTarget: target,
    }));
  }

  const rect = target.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent("mouseover", {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
    clientY: rect.top + Math.min(8, Math.max(1, rect.height / 2)),
    relatedTarget: previous instanceof HTMLElement ? previous : null,
  }));
  return true;
}, {
  fileId,
  previousFileId,
});

const dispatchSyntheticFileMouseOut = async (page, fileId) => page.evaluate((targetFileId) => {
  const target = [...document.querySelectorAll(".file-list-item[data-file-id]")]
    .find(item => item instanceof HTMLElement && item.dataset.fileId === targetFileId) ?? null;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  target.dispatchEvent(new MouseEvent("mouseout", {
    bubbles: true,
    cancelable: true,
    relatedTarget: document.body,
  }));
  return true;
}, fileId);

const inspectMainChartState = async (page) => page.evaluate(() => {
  const readCanvasSnapshot = (canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return {
        canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
        canvasNonBlank: false,
        canvasSignature: null,
        canvasVisible: canvas instanceof HTMLCanvasElement,
        canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
      };
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return {
        canvasHeight: canvas.height,
        canvasNonBlank: false,
        canvasSignature: null,
        canvasVisible: true,
        canvasWidth: canvas.width,
      };
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 1024 / 4) * 4);
    let nonBlank = false;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        nonBlank = true;
      }
      hash ^= data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (alpha << 24);
      hash = Math.imul(hash, 16777619);
    }

    return {
      canvasHeight: canvas.height,
      canvasNonBlank: nonBlank,
      canvasSignature: `${canvas.width}x${canvas.height}:${hash >>> 0}`,
      canvasVisible: true,
      canvasWidth: canvas.width,
    };
  };

  const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
  const canvas = document.querySelector(".plot_main_chart_canvas");
  const emptyTitle = document.querySelector(".chart_view_empty_title");
  const snapshot = readCanvasSnapshot(canvas);
  return {
    ...snapshot,
    chartEmptyTitle: emptyTitle?.textContent?.trim() ?? null,
    selectedChartState: selected instanceof HTMLElement ? selected.dataset.chartState ?? null : null,
    selectedFileId: selected instanceof HTMLElement ? selected.dataset.fileId ?? null : null,
    selectedHasChartData: selected instanceof HTMLElement ? selected.dataset.hasChartData === "true" : null,
  };
});

const dispatchSyntheticFileSelect = async (page, fileId) => page.evaluate((targetFileId) => {
  const target = [...document.querySelectorAll(".file-list-item[data-file-id]")]
    .find(item => item instanceof HTMLElement && item.dataset.fileId === targetFileId) ?? null;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  window.__fileSwitchLiveTrace?.recordDispatch?.(targetFileId);

  const rect = target.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
    clientY: rect.top + Math.min(8, Math.max(1, rect.height / 2)),
  };
  target.dispatchEvent(new MouseEvent("mousedown", eventInit));
  target.dispatchEvent(new MouseEvent("mouseup", eventInit));
  target.dispatchEvent(new MouseEvent("click", eventInit));
  return true;
}, fileId);

const waitForSelectedFile = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    return selected instanceof HTMLElement && selected.dataset.fileId === targetFileId;
  },
  fileId,
  { timeout: Math.min(timeoutMs, 5000) },
);

const waitForMainChartCanvas = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    return selected instanceof HTMLElement &&
      selected.dataset.fileId === targetFileId &&
      Boolean(document.querySelector(".plot_main_chart_canvas"));
  },
  fileId,
  { timeout: Math.min(timeoutMs, 10000) },
);

const waitForMainChartDrawn = async (page, fileId, previousCanvasSignature, timeoutMs) => page.waitForFunction(
  ({ targetFileId, previousSignature }) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    if (!(selected instanceof HTMLElement) || selected.dataset.fileId !== targetFileId) {
      return false;
    }

    const canvas = document.querySelector(".plot_main_chart_canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 1024 / 4) * 4);
    let nonBlank = false;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        nonBlank = true;
      }
      hash ^= data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (alpha << 24);
      hash = Math.imul(hash, 16777619);
    }
    if (!nonBlank) {
      return false;
    }

    const signature = `${canvas.width}x${canvas.height}:${hash >>> 0}`;
    return !previousSignature || signature !== previousSignature;
  },
  { targetFileId: fileId, previousSignature: previousCanvasSignature },
  { timeout: Math.min(timeoutMs, 10000) },
);

const installFileSwitchLiveObserver = async (page) => page.evaluate(() => {
  const globalTarget = window;
  globalTarget.__fileSwitchLiveTrace?.stop?.();
  const dispatches = [];
  const events = [];
  const startedAt = performance.now();

  const readTraceTime = () => ({
    timestamp: performance.now() - startedAt,
    wallTime: Date.now(),
  });

  const readCanvasSnapshot = (canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return {
        canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
        canvasNonBlank: false,
        canvasSignature: null,
        canvasVisible: canvas instanceof HTMLCanvasElement,
        canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
      };
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return {
        canvasHeight: canvas.height,
        canvasNonBlank: false,
        canvasSignature: null,
        canvasVisible: true,
        canvasWidth: canvas.width,
      };
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 1024 / 4) * 4);
    let nonBlank = false;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        nonBlank = true;
      }
      hash ^= data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (alpha << 24);
      hash = Math.imul(hash, 16777619);
    }

    return {
      canvasHeight: canvas.height,
      canvasNonBlank: nonBlank,
      canvasSignature: `${canvas.width}x${canvas.height}:${hash >>> 0}`,
      canvasVisible: true,
      canvasWidth: canvas.width,
    };
  };

  const readState = (reason) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    const canvas = document.querySelector(".plot_main_chart_canvas");
    const emptyTitle = document.querySelector(".chart_view_empty_title");
    const snapshot = readCanvasSnapshot(canvas);
    const traceTime = readTraceTime();
    return {
      ...snapshot,
      chartEmptyTitle: emptyTitle?.textContent?.trim() ?? null,
      reason,
      selectedChartState: selected instanceof HTMLElement ? selected.dataset.chartState ?? null : null,
      selectedFileId: selected instanceof HTMLElement ? selected.dataset.fileId ?? null : null,
      selectedHasChartData: selected instanceof HTMLElement ? selected.dataset.hasChartData === "true" : null,
      timestamp: traceTime.timestamp,
      wallTime: traceTime.wallTime,
    };
  };

  let lastSignature = "";
  const pushState = (reason) => {
    const state = readState(reason);
    const signature = [
      state.selectedFileId ?? "",
      state.selectedChartState ?? "",
      state.selectedHasChartData ? "1" : "0",
      state.canvasSignature ?? "",
      state.canvasNonBlank ? "1" : "0",
      state.chartEmptyTitle ?? "",
    ].join("|");
    if (signature === lastSignature && reason !== "tick") {
      return;
    }
    lastSignature = signature;
    events.push(state);
  };

  const observer = new MutationObserver(() => pushState("mutation"));
  observer.observe(document.body || document.documentElement, {
    attributes: true,
    attributeFilter: ["data-selected", "data-chart-state", "data-has-chart-data", "class", "style"],
    childList: true,
    subtree: true,
  });
  const interval = window.setInterval(() => pushState("tick"), 50);
  pushState("start");

  globalTarget.__fileSwitchLiveTrace = {
    dispatches,
    events,
    recordDispatch: (fileId) => {
      const state = readState("dispatch");
      dispatches.push({
        fileId: String(fileId ?? ""),
        state,
        timestamp: state.timestamp,
        wallTime: state.wallTime,
      });
      pushState("dispatch");
    },
    stop: () => {
      observer.disconnect();
      window.clearInterval(interval);
      pushState("stop");
      return {
        dispatches: [...dispatches],
        events: [...events],
      };
    },
  };
});

const stopFileSwitchLiveObserver = async (page) => page.evaluate(() =>
  window.__fileSwitchLiveTrace?.stop?.() ?? null
).catch(() => null);

const installThumbnailHoverLiveObserver = async (page, watchedFileId) => page.evaluate((targetFileId) => {
  const globalTarget = window;
  globalTarget.__thumbnailHoverLiveTrace?.stop?.();
  let nextCanvasId = 1;
  const dispatches = [];
  const events = [];
  const startedAt = performance.now();

  const readTraceTime = () => ({
    timestamp: performance.now() - startedAt,
    wallTime: Date.now(),
  });

  const readCanvasNonBlank = (canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 512 / 4) * 4);
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        return true;
      }
    }
    return false;
  };

  const readState = (reason) => {
    const hover = document.querySelector(".file-list-hover--thumbnail");
    const node = hover?.querySelector(".thumbnail_view[data-hover-file-id]") ?? null;
    const canvas = node?.querySelector("canvas.thumbnail_view_chart_canvas") ?? null;
    if (canvas instanceof HTMLCanvasElement && !canvas.dataset.traceCanvasId) {
      canvas.dataset.traceCanvasId = String(nextCanvasId);
      nextCanvasId += 1;
    }
    const traceTime = readTraceTime();
    return {
      canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
      canvasId: canvas instanceof HTMLCanvasElement ? canvas.dataset.traceCanvasId ?? null : null,
      canvasNonBlank: readCanvasNonBlank(canvas),
      canvasVisible: canvas instanceof HTMLCanvasElement,
      canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
      fileId: node?.dataset.hoverFileId ?? null,
      isWatchedFile: node?.dataset.hoverFileId === targetFileId,
      loadingVisible: Boolean(node?.querySelector(".thumbnail_view_chart_loading")),
      plotSignature: node?.dataset.hoverPlotSignature ?? null,
      reason,
      timestamp: traceTime.timestamp,
      tooltipVisible: Boolean(hover),
      wallTime: traceTime.wallTime,
    };
  };

  let lastSignature = "";
  const pushState = (reason) => {
    const state = readState(reason);
    const signature = [
      state.fileId ?? "",
      state.canvasId ?? "",
      state.canvasHeight ?? "",
      state.canvasWidth ?? "",
      state.canvasNonBlank ? "1" : "0",
      state.loadingVisible ? "1" : "0",
      state.plotSignature ?? "",
      state.tooltipVisible ? "1" : "0",
    ].join("|");
    if (signature === lastSignature && reason !== "tick") {
      return;
    }
    lastSignature = signature;
    events.push(state);
  };

  const observer = new MutationObserver(() => pushState("mutation"));
  observer.observe(document.body || document.documentElement, {
    attributes: true,
    attributeFilter: ["data-hover-file-id", "data-hover-plot-signature", "class", "style"],
    childList: true,
    subtree: true,
  });
  const interval = window.setInterval(() => pushState("tick"), 50);
  pushState("start");

  globalTarget.__thumbnailHoverLiveTrace = {
    dispatches,
    events,
    recordDispatch: (fileId) => {
      const traceTime = readTraceTime();
      dispatches.push({
        fileId: String(fileId ?? ""),
        timestamp: traceTime.timestamp,
        wallTime: traceTime.wallTime,
      });
      pushState("dispatch");
    },
    stop: () => {
      observer.disconnect();
      window.clearInterval(interval);
      pushState("stop");
      return {
        dispatches: [...dispatches],
        events: [...events],
        watchedFileId: targetFileId,
      };
    },
    watchedFileId: targetFileId,
  };
}, watchedFileId);

const stopThumbnailHoverLiveObserver = async (page) => page.evaluate(() =>
  window.__thumbnailHoverLiveTrace?.stop?.() ?? null
).catch(() => null);

const waitForHoverThumbnailNode = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const escape = window.CSS?.escape ?? ((value) => String(value).replace(/[\\"]/g, "\\$&"));
    const selector = `.file-list-hover--thumbnail .thumbnail_view[data-hover-file-id="${escape(targetFileId)}"]`;
    return Boolean(document.querySelector(selector));
  },
  fileId,
  { timeout: Math.min(timeoutMs, 5000) },
);

const waitForHoverThumbnailCanvas = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const escape = window.CSS?.escape ?? ((value) => String(value).replace(/[\\"]/g, "\\$&"));
    const selector = `.file-list-hover--thumbnail .thumbnail_view[data-hover-file-id="${escape(targetFileId)}"]`;
    return Boolean(document.querySelector(`${selector} canvas.thumbnail_view_chart_canvas`));
  },
  fileId,
  { timeout: Math.min(timeoutMs, 10000) },
);

const waitForHoverThumbnailDrawn = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const escape = window.CSS?.escape ?? ((value) => String(value).replace(/[\\"]/g, "\\$&"));
    const selector = `.file-list-hover--thumbnail .thumbnail_view[data-hover-file-id="${escape(targetFileId)}"]`;
    const canvas = document.querySelector(`${selector} canvas.thumbnail_view_chart_canvas`);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        return true;
      }
    }
    return false;
  },
  fileId,
  { timeout: Math.min(timeoutMs, 10000) },
);

const waitForTemplateProcessingBatch = async (page, timeoutMs) => page.waitForFunction(
  () => Boolean(window.conductorAnalysisPerf?.getReport?.()?.entries?.some(entry =>
    entry.stage === "processing:batch"
  )),
  undefined,
  { timeout: timeoutMs },
).catch(() => null);

const inspectVisibleThumbnailHover = async (page) => page.evaluate(() => {
  const hover = document.querySelector(".file-list-hover--thumbnail");
  const node = hover?.querySelector(".thumbnail_view[data-hover-file-id]") ?? null;
  const canvas = node?.querySelector("canvas.thumbnail_view_chart_canvas") ?? null;
  let canvasNonBlank = false;
  let canvasNonBlankPixels = 0;
  let canvasPixels = 0;
  let canvasHeight = null;
  let canvasWidth = null;
  if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
    canvasHeight = canvas.height;
    canvasWidth = canvas.width;
    const context = canvas.getContext("2d");
    if (context) {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      canvasPixels = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        const color = data[index] + data[index + 1] + data[index + 2];
        if (alpha > 0 && color > 0) {
          canvasNonBlankPixels += 1;
        }
      }
      canvasNonBlank = canvasNonBlankPixels > 0;
    }
  }

  return {
    canvasHeight,
    canvasNonBlank,
    canvasNonBlankPixels,
    canvasPixels,
    canvasVisible: Boolean(canvas),
    canvasWidth,
    fileId: node?.dataset.hoverFileId ?? null,
    loadingVisible: Boolean(node?.querySelector(".thumbnail_view_chart_loading")),
    plotSignature: node?.dataset.hoverPlotSignature ?? null,
    tooltipVisible: Boolean(hover),
  };
});

const runThumbnailHoverStress = async ({
  count,
  page,
  timeoutMs,
}) => {
  const before = await readThumbnailHoverDomState(page);
  const targets = await readVisibleThumbnailHoverTargets(page, count);
  const samples = [];
  const startedAt = Date.now();
  let previousFileId = null;

  for (const target of targets) {
    const hoverStartedAt = Date.now();
    const dispatched = await dispatchSyntheticFileHover(page, target.fileId, previousFileId)
      .catch(() => false);
    if (!dispatched) {
      samples.push({
        ...target,
        canvasDrawnMs: null,
        canvasReadyMs: null,
        canvasStableMs: null,
        hoverState: await inspectVisibleThumbnailHover(page),
        tooltipVisibleMs: null,
      });
      continue;
    }
    previousFileId = target.fileId;
    let tooltipVisibleMs = null;
    let canvasReadyMs = null;
    let canvasDrawnMs = null;
    let canvasStableMs = null;
    try {
      await waitForHoverThumbnailNode(page, target.fileId, timeoutMs);
      tooltipVisibleMs = Date.now() - hoverStartedAt;
    } catch {
      tooltipVisibleMs = null;
    }
    try {
      await waitForHoverThumbnailCanvas(page, target.fileId, timeoutMs);
      canvasReadyMs = Date.now() - hoverStartedAt;
    } catch {
      canvasReadyMs = null;
    }
    try {
      await waitForHoverThumbnailDrawn(page, target.fileId, timeoutMs);
      canvasDrawnMs = Date.now() - hoverStartedAt;
      await page.waitForTimeout(50);
      const stableState = await inspectVisibleThumbnailHover(page);
      if (stableState.canvasNonBlank) {
        canvasStableMs = Date.now() - hoverStartedAt;
      } else {
        await waitForHoverThumbnailDrawn(page, target.fileId, timeoutMs);
        canvasStableMs = Date.now() - hoverStartedAt;
      }
    } catch {
      canvasDrawnMs = null;
      canvasStableMs = null;
    }
    const hoverState = await inspectVisibleThumbnailHover(page);
    samples.push({
      ...target,
      canvasDrawnMs,
      canvasReadyMs,
      canvasStableMs,
      hoverState,
      tooltipVisibleMs,
    });
    await page.waitForTimeout(160);
  }
  if (previousFileId) {
    await dispatchSyntheticFileMouseOut(page, previousFileId).catch(() => {});
  }

  return {
    before,
    durationMs: Date.now() - startedAt,
    requestedCount: count,
    samples,
    targetCount: targets.length,
  };
};

const runLiveThumbnailHoverStress = async ({
  count,
  intervalMs,
  liveMs,
  page,
  timeoutMs,
  watchOnly = false,
}) => {
  const targets = await waitForVisibleThumbnailHoverTargets(page, count, Math.min(timeoutMs, 5000));
  const watchedTarget = targets[0] ?? null;
  if (!watchedTarget) {
    return {
      durationMs: 0,
      eventCount: 0,
      intervalMs,
      liveMs,
      requestedCount: count,
      targetCount: 0,
      targets,
      trace: null,
      watchedTarget: null,
    };
  }

  await installThumbnailHoverLiveObserver(page, watchedTarget.fileId);
  const startedAt = Date.now();
  let eventCount = 0;
  let previousFileId = null;
  while (Date.now() - startedAt < liveMs) {
    const target = watchOnly
      ? watchedTarget
      : targets[eventCount % targets.length];
    if (!target) {
      break;
    }

    const dispatched = await dispatchSyntheticFileHover(page, target.fileId, previousFileId)
      .catch(() => false);
    if (dispatched) {
      previousFileId = target.fileId;
    }
    eventCount += 1;
    await page.waitForTimeout(intervalMs);
  }

  if (watchedTarget.fileId !== previousFileId) {
    await dispatchSyntheticFileHover(page, watchedTarget.fileId, previousFileId).catch(() => false);
    await page.waitForTimeout(Math.max(50, intervalMs * 2));
  }

  return {
    durationMs: Date.now() - startedAt,
    eventCount,
    intervalMs,
    liveMs,
    requestedCount: count,
    targetCount: targets.length,
    targets,
    trace: await stopThumbnailHoverLiveObserver(page),
    watchOnly,
    watchedTarget,
  };
};

const orderSwitchTargets = (targets, count) => [
  ...targets.filter(target => !target.selected),
  ...targets.filter(target => target.selected),
].slice(0, count);

const runFileSwitchStress = async ({
  count,
  page,
  timeoutMs,
}) => {
  const before = await inspectMainChartState(page);
  const targets = orderSwitchTargets(
    await readVisibleThumbnailHoverTargets(page, count + 1),
    count,
  );
  const samples = [];
  const startedAt = Date.now();

  for (const target of targets) {
    const beforeState = await inspectMainChartState(page);
    const switchStartedAt = Date.now();
    const dispatched = await dispatchSyntheticFileSelect(page, target.fileId)
      .catch(() => false);
    if (!dispatched) {
      samples.push({
        ...target,
        afterState: await inspectMainChartState(page),
        beforeState,
        canvasVisibleMs: null,
        chartDrawnMs: null,
        dispatched: false,
        selectedMs: null,
      });
      continue;
    }

    let selectedMs = null;
    let canvasVisibleMs = null;
    let chartDrawnMs = null;
    try {
      await waitForSelectedFile(page, target.fileId, timeoutMs);
      selectedMs = Date.now() - switchStartedAt;
    } catch {
      selectedMs = null;
    }
    try {
      await waitForMainChartCanvas(page, target.fileId, timeoutMs);
      canvasVisibleMs = Date.now() - switchStartedAt;
    } catch {
      canvasVisibleMs = null;
    }
    try {
      await waitForMainChartDrawn(page, target.fileId, beforeState.canvasSignature, timeoutMs);
      chartDrawnMs = Date.now() - switchStartedAt;
    } catch {
      chartDrawnMs = null;
    }

    samples.push({
      ...target,
      afterState: await inspectMainChartState(page),
      beforeState,
      canvasVisibleMs,
      chartDrawnMs,
      dispatched: true,
      selectedMs,
    });
    await page.waitForTimeout(80);
  }

  return {
    before,
    durationMs: Date.now() - startedAt,
    requestedCount: count,
    samples,
    targetCount: targets.length,
  };
};

const runLiveFileSwitchStress = async ({
  count,
  intervalMs,
  liveMs,
  page,
  timeoutMs,
}) => {
  const targets = orderSwitchTargets(
    await waitForVisibleThumbnailHoverTargets(page, count + 1, Math.min(timeoutMs, 5000)),
    count,
  );
  if (!targets.length) {
    return {
      durationMs: 0,
      eventCount: 0,
      intervalMs,
      liveMs,
      requestedCount: count,
      settleSample: null,
      targetCount: 0,
      targets,
      trace: null,
    };
  }

  await installFileSwitchLiveObserver(page);
  const startedAt = Date.now();
  let eventCount = 0;
  let lastBeforeState = null;
  let lastSwitchStartedAt = null;
  let lastTarget = null;
  while (Date.now() - startedAt < liveMs) {
    const target = targets[eventCount % targets.length];
    if (!target) {
      break;
    }

    lastBeforeState = await inspectMainChartState(page);
    lastSwitchStartedAt = Date.now();
    lastTarget = target;
    await dispatchSyntheticFileSelect(page, target.fileId).catch(() => false);
    eventCount += 1;
    await page.waitForTimeout(intervalMs);
  }

  let settleSample = null;
  if (lastTarget && lastSwitchStartedAt != null) {
    let selectedMs = null;
    let canvasVisibleMs = null;
    let chartDrawnMs = null;
    try {
      await waitForSelectedFile(page, lastTarget.fileId, timeoutMs);
      selectedMs = Date.now() - lastSwitchStartedAt;
    } catch {
      selectedMs = null;
    }
    try {
      await waitForMainChartCanvas(page, lastTarget.fileId, timeoutMs);
      canvasVisibleMs = Date.now() - lastSwitchStartedAt;
    } catch {
      canvasVisibleMs = null;
    }
    try {
      await waitForMainChartDrawn(
        page,
        lastTarget.fileId,
        lastBeforeState?.canvasSignature ?? null,
        timeoutMs,
      );
      chartDrawnMs = Date.now() - lastSwitchStartedAt;
    } catch {
      chartDrawnMs = null;
    }
    settleSample = {
      ...lastTarget,
      afterState: await inspectMainChartState(page),
      beforeState: lastBeforeState,
      canvasVisibleMs,
      chartDrawnMs,
      selectedMs,
    };
  } else {
    await page.waitForTimeout(Math.max(80, intervalMs * 2));
  }

  return {
    durationMs: Date.now() - startedAt,
    eventCount,
    intervalMs,
    liveMs,
    requestedCount: count,
    settleSample,
    targetCount: targets.length,
    targets,
    trace: await stopFileSwitchLiveObserver(page),
  };
};

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
  if (value == null || value === "") {
    return null;
  }
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

const getTraceEventWallTime = event =>
  readNumber(event?.wallTime) ??
  (readNumber(event?.timeOrigin) != null && readNumber(event?.timestamp) != null
    ? readNumber(event.timeOrigin) + readNumber(event.timestamp)
    : null);

const isInWindow = (time, window) =>
  time != null &&
  time >= window.startWallTime &&
  (window.endWallTime == null || time <= window.endWallTime);

const filterByWindow = (items, window, getTime) =>
  items.filter(item => isInWindow(getTime(item), window));

const createPhaseWindows = (anchors) => {
  const byName = new Map();
  for (const anchor of anchors) {
    if (!byName.has(anchor.name)) {
      byName.set(anchor.name, anchor);
    }
  }

  const createWindow = (name, startName, endName) => {
    const start = byName.get(startName);
    if (!start) {
      return null;
    }

    const end = byName.get(endName);
    if (end?.wallTime != null && end.wallTime < start.wallTime) {
      return null;
    }
    return {
      endAnchor: endName,
      endWallTime: end?.wallTime ?? null,
      name,
      startAnchor: startName,
      startWallTime: start.wallTime,
      durationMs: end?.wallTime != null
        ? Math.max(0, end.wallTime - start.wallTime)
        : null,
    };
  };

  return [
    createWindow("importDispatch", "import.dispatch.start", "import.dispatch.end"),
    createWindow("importUntilReady", "import.dispatch.start", "import.ready"),
    createWindow("applyClick", "apply.click.start", "apply.click.end"),
    createWindow("applyProcessing", "apply.click.start", "processing.done"),
    createWindow("liveThumbnailHover", "live.thumbnailHover.start", "live.thumbnailHover.end"),
    createWindow("liveThumbnailHoverDuringProcessing", "live.thumbnailHover.start", "processing.done"),
    createWindow("liveThumbnailHoverAfterProcessing", "processing.done", "live.thumbnailHover.end"),
    createWindow("liveFileSwitch", "live.fileSwitch.start", "live.fileSwitch.end"),
    createWindow("liveFileSwitchDuringProcessing", "live.fileSwitch.start", "processing.done"),
    createWindow("liveFileSwitchAfterProcessing", "processing.done", "live.fileSwitch.end"),
    createWindow("stableThumbnailHover", "stable.thumbnailHover.start", "stable.thumbnailHover.end"),
    createWindow("stableFileSwitch", "stable.fileSwitch.start", "stable.fileSwitch.end"),
    createWindow("postProcessingStable", "processing.done", "stable.end"),
  ].filter(Boolean);
};

const summarizePerfEntries = (entries) => {
  const stageCounts = countBy(entries.map(entry => entry.stage));
  const stageDurationMs = {};
  for (const stage of Object.keys(stageCounts).sort()) {
    const summary = summarizeStageDuration(entries, stage);
    if (summary.count > 0) {
      stageDurationMs[stage] = summary;
    }
  }

  const topStageDurationMs = Object.entries(stageDurationMs)
    .map(([stage, summary]) => ({
      count: summary.count,
      maxMs: summary.maxMs,
      stage,
      totalMs: summary.totalMs,
    }))
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0))
    .slice(0, 12);

  return {
    entryCount: entries.length,
    stageCounts,
    stageDurationMs,
    topStageDurationMs,
  };
};

const summarizePhaseWindow = ({
  analysisPerfReport,
  resourceSamples,
  traceEvents,
  window,
}) => {
  const windowTraceEvents = filterByWindow(
    traceEvents,
    window,
    getTraceEventWallTime,
  );
  const perfEntries = filterByWindow(
    Array.isArray(analysisPerfReport?.entries) ? analysisPerfReport.entries : [],
    window,
    entry => readNumber(entry?.timestamp),
  );
  const resources = filterByWindow(
    resourceSamples,
    window,
    sample => readNumber(sample?.wallTime),
  );
  const longTasks = windowTraceEvents.filter(event => event.stage === "import.runtime.longTask");
  const eventLoopLag = windowTraceEvents.filter(event => event.stage === "import.runtime.eventLoopLag");

  return {
    ...window,
    eventLoopLagMs: summarizeDurations(eventLoopLag.map(event => event.meta?.durationMs)),
    longTaskMs: summarizeDurations(longTasks.map(event => event.meta?.durationMs)),
    perf: summarizePerfEntries(perfEntries),
    resources: summarizeResourceSamples(resources),
    topLongTasks: longTasks
      .map(event => ({
        durationMs: roundMetric(readNumber(event.meta?.durationMs)),
        name: event.meta?.name ?? null,
        offsetMs: roundMetric(getTraceEventWallTime(event) - window.startWallTime),
        stage: event.stage,
      }))
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 8),
    traceEventCount: windowTraceEvents.length,
    traceStageCounts: countBy(windowTraceEvents.map(event => event.stage)),
  };
};

const summarizePhaseAnalysis = ({
  analysisPerfReport,
  phaseAnchors,
  resourceSamples,
  traceEvents,
}) => {
  const windows = createPhaseWindows(phaseAnchors);
  const summaries = windows.map(window => summarizePhaseWindow({
    analysisPerfReport,
    resourceSamples,
    traceEvents,
    window,
  }));
  return {
    anchorCount: phaseAnchors.length,
    anchors: phaseAnchors,
    windows: summaries,
    windowsByName: Object.fromEntries(summaries.map(summary => [summary.name, summary])),
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

const summarizeAnalysisPerfReport = (report) => {
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  if (!entries.length) {
    return {
      entryCount: 0,
      stageCounts: {},
      thumbnail: null,
    };
  }

  const thumbnailEntries = entries.filter(entry =>
    String(entry.stage ?? "").startsWith("thumbnail")
  );
  const thumbnailHoverRenders = entries.filter(entry => entry.stage === "thumbnailHover.render");
  const thumbnailPreviewRequests = entries.filter(entry => entry.stage === "thumbnailPreview.request");
  return {
    entryCount: entries.length,
    stageCounts: countBy(entries.map(entry => entry.stage)),
    thumbnail: {
      entryCount: thumbnailEntries.length,
      hoverRenderCacheHits: countBy(thumbnailHoverRenders.map(entry => entry.meta?.cacheHit)),
      hoverRenderModelSources: countBy(thumbnailHoverRenders.map(entry => entry.meta?.plotModelSource)),
      hoverRenderPreviewStates: countBy(thumbnailHoverRenders.map(entry => entry.meta?.previewState)),
      previewRequestMs: summarizeStageDuration(entries, "thumbnailPreview.request"),
      previewRequestPriorities: countBy(thumbnailPreviewRequests.map(entry => entry.meta?.priority)),
      previewRequestStates: countBy(thumbnailPreviewRequests.map(entry => entry.meta?.state)),
      stageCounts: countBy(thumbnailEntries.map(entry => entry.stage)),
    },
  };
};

const targetPerfMilestoneDefs = [
  {
    key: "templateOutputCommitted",
    match: (entry, fileId) =>
      entry.stage === "templateApplyController.commitTemplateOutput" &&
      entry.meta?.committed === true &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "templateOutputFlushed",
    match: (entry, fileId) =>
      entry.stage === "templateApplyController.flushTemplateOutputs" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "sessionTemplateCommitted",
    match: (entry, fileId) =>
      entry.stage === "sessionService.commitTemplateOutput" &&
      entry.meta?.committed === true &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "calculationPrioritized",
    match: (entry, fileId) =>
      entry.stage === "calculationService.prioritizeCalculationFiles" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "calculationEnqueued",
    match: (entry, fileId) =>
      entry.stage === "calculationContribution.update" &&
      perfEntryMetaIds(entry.meta, ["enqueuedFileIds", "fileIds"]).includes(fileId),
  },
  {
    key: "calculationBuilt",
    match: (entry, fileId) =>
      entry.stage === "calculationContribution.buildRecords" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "sessionCalculationCommitted",
    match: (entry, fileId) =>
      entry.stage === "sessionService.commitCalculatedRecordsBatch" &&
      entry.meta?.committed === true &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "plotDisplayRequested",
    match: (entry, fileId) =>
      entry.stage === "plotService.prefetchPlotDisplayModel" &&
      perfEntryIncludesFileId(entry, fileId),
  },
  {
    key: "plotChartCached",
    match: (entry, fileId) =>
      perfEntryIncludesFileId(entry, fileId) &&
      (
        (
          entry.stage === "plotService.prefetchPlotDisplayModel" &&
          entry.meta?.result === "chartCached"
        ) ||
        (
          entry.stage === "plotService.cachePlotDisplayModel" &&
          entry.meta?.hasInspector === false
        )
      ),
  },
  {
    key: "plotFullCached",
    match: (entry, fileId) =>
      perfEntryIncludesFileId(entry, fileId) &&
      (
        (
          entry.stage === "plotService.prefetchPlotDisplayModel" &&
          entry.meta?.result === "fullCacheHit"
        ) ||
        (
          entry.stage === "plotService.cachePlotDisplayModel" &&
          entry.meta?.hasInspector === true
        )
      ),
  },
  {
    key: "thumbnailReady",
    match: (entry, fileId) =>
      perfEntryIncludesFileId(entry, fileId) &&
      (
        (
          entry.stage === "thumbnailPreview.update" &&
          ["fastReady", "rawReady", "ready"].includes(String(entry.meta?.resolvedState ?? ""))
        ) ||
        (
          entry.stage === "thumbnailHover.render" &&
          ["fastReady", "rawReady", "ready"].includes(String(entry.meta?.previewState ?? ""))
        )
      ),
  },
];

const perfEntryIncludesFileId = (entry, fileId) =>
  perfEntryFileIds(entry).includes(fileId);

const perfEntryFileIds = (entry) =>
  perfEntryMetaIds(entry?.meta, [
    "candidateFileIds",
    "committedFileIds",
    "enqueuedFileIds",
    "fileId",
    "fileIds",
    "foregroundFileIds",
    "interactiveCommittedFileIds",
    "interactivePriorityFileIds",
    "pendingFileIds",
    "remainingFileIds",
  ]);

const perfEntryMetaIds = (meta, keys) => {
  const ids = [];
  for (const key of keys) {
    const value = meta?.[key];
    if (Array.isArray(value)) {
      ids.push(...value);
    } else if (value != null) {
      ids.push(value);
    }
  }
  return [...new Set(ids.map(value => String(value ?? "").trim()).filter(Boolean))];
};

const createTargetPerfMilestoneSamples = (perfReport, targetSamples) => {
  const entries = Array.isArray(perfReport?.entries)
    ? perfReport.entries.filter(entry => readNumber(entry?.timestamp) != null)
    : [];
  if (!entries.length || !Array.isArray(targetSamples) || !targetSamples.length) {
    return [];
  }

  return targetSamples.map((sample) => {
    const fileId = String(sample?.fileId ?? "").trim();
    const dispatchWallTime = readNumber(sample?.dispatchWallTime);
    const milestones = {};
    if (fileId && dispatchWallTime != null) {
      for (const def of targetPerfMilestoneDefs) {
        const entry = findTargetPerfEntry(entries, fileId, dispatchWallTime, def);
        if (!entry) {
          milestones[def.key] = null;
          continue;
        }

        const timestamp = readNumber(entry.timestamp);
        milestones[def.key] = {
          durationMs: roundMetric(readNumber(entry.meta?.durationMs)),
          offsetMs: timestamp != null ? roundMetric(timestamp - dispatchWallTime) : null,
          result: entry.meta?.result ?? null,
          stage: entry.stage,
          timestamp: roundMetric(timestamp),
        };
      }
    }

    return {
      dispatchWallTime,
      fileId,
      milestones,
    };
  });
};

const findTargetPerfEntry = (entries, fileId, dispatchWallTime, def) => {
  const afterDispatch = entries.find(entry =>
    readNumber(entry.timestamp) >= dispatchWallTime &&
    def.match(entry, fileId)
  );
  if (afterDispatch) {
    return afterDispatch;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      readNumber(entry.timestamp) < dispatchWallTime &&
      def.match(entry, fileId)
    ) {
      return entry;
    }
  }
  return null;
};

const summarizeTargetPerfMilestoneSamples = (samples) => {
  if (!Array.isArray(samples) || !samples.length) {
    return null;
  }

  return Object.fromEntries(targetPerfMilestoneDefs.map((def) => {
    const milestoneSamples = samples
      .map(sample => sample.milestones?.[def.key])
      .filter(Boolean);
    const offsets = milestoneSamples
      .map(milestone => readNumber(milestone.offsetMs))
      .filter(value => value != null && value >= 0);
    return [def.key, {
      afterDispatchCount: offsets.length,
      beforeDispatchCount: milestoneSamples.filter(
        milestone => readNumber(milestone.offsetMs) != null && readNumber(milestone.offsetMs) < 0,
      ).length,
      durationMs: summarizeDurations(milestoneSamples.map(milestone => milestone.durationMs)),
      missingCount: samples.length - milestoneSamples.length,
      offsetMs: summarizeDurations(offsets),
      reachedCount: milestoneSamples.length,
    }];
  }));
};

const summarizeTargetPerfMilestoneOffset = (samples, key) => summarizeDurations(
  (Array.isArray(samples) ? samples : [])
    .map(sample => readNumber(sample?.milestones?.[key]?.offsetMs))
    .filter(value => value != null && value >= 0),
);

const summarizeThumbnailHoverStress = (result, perfReport) => {
  if (!result) {
    return null;
  }

  const samples = Array.isArray(result.samples) ? result.samples : [];
  const perfSummary = summarizeAnalysisPerfReport(perfReport).thumbnail;
  return {
    canvasDrawnCount: samples.filter(sample => sample.canvasDrawnMs != null).length,
    canvasDrawnMs: summarizeDurations(samples.map(sample => sample.canvasDrawnMs)),
    canvasNonBlankCount: samples.filter(sample => sample.hoverState?.canvasNonBlank).length,
    canvasReadyMs: summarizeDurations(samples.map(sample => sample.canvasReadyMs)),
    canvasStableCount: samples.filter(sample => sample.canvasStableMs != null).length,
    canvasStableMs: summarizeDurations(samples.map(sample => sample.canvasStableMs)),
    canvasVisibleCount: samples.filter(sample => sample.hoverState?.canvasVisible).length,
    durationMs: result.durationMs,
    loadingVisibleCount: samples.filter(sample => sample.hoverState?.loadingVisible).length,
    perf: perfSummary,
    requestedCount: result.requestedCount,
    sampledCount: samples.length,
    targetCount: result.targetCount,
    tooltipVisibleCount: samples.filter(sample => sample.hoverState?.tooltipVisible).length,
    tooltipVisibleMs: summarizeDurations(samples.map(sample => sample.tooltipVisibleMs)),
  };
};

const firstDispatchesByFile = (dispatches) => {
  const seen = new Set();
  const firstDispatches = [];
  for (const dispatch of dispatches) {
    const fileId = String(dispatch?.fileId ?? "");
    if (!fileId || seen.has(fileId)) {
      continue;
    }
    seen.add(fileId);
    firstDispatches.push(dispatch);
  }
  return firstDispatches;
};

const durationFromDispatch = (dispatch, event) => {
  const start = readNumber(dispatch?.timestamp);
  const end = readNumber(event?.timestamp);
  return start != null && end != null ? roundMetric(end - start) : null;
};

const phaseWindowByName = (phaseAnchors, name) =>
  createPhaseWindows(Array.isArray(phaseAnchors) ? phaseAnchors : [])
    .find(window => window.name === name) ?? null;

const firstDispatchesByFileForWindow = (dispatches, window) =>
  firstDispatchesByFile(
    window
      ? filterByWindow(dispatches, window, getTraceEventWallTime)
      : dispatches,
  );

const createLiveHoverTargetSamples = (result, window = null) => {
  const events = Array.isArray(result?.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result?.trace?.dispatches) ? result.trace.dispatches : [];
  return firstDispatchesByFileForWindow(dispatches, window).map((dispatch) => {
    const fileId = String(dispatch.fileId ?? "");
    const fileEvents = events.filter(event =>
      event.fileId === fileId &&
      readNumber(event.timestamp) != null &&
      readNumber(dispatch.timestamp) != null &&
      event.timestamp >= dispatch.timestamp
    );
    const tooltip = fileEvents.find(event => event.tooltipVisible);
    const canvasVisible = fileEvents.find(event => event.canvasVisible);
    const canvasNonBlank = fileEvents.find(event => event.canvasNonBlank);
    const stableReady = fileEvents.find(event =>
      event.canvasNonBlank &&
      event.plotSignature &&
      event.loadingVisible === false
    );
    const canvasIds = new Set(fileEvents.map(event => event.canvasId).filter(Boolean));
    const plotSignatures = new Set(fileEvents.map(event => event.plotSignature).filter(Boolean));
    let blankAfterNonBlankCount = 0;
    let sawNonBlank = false;
    for (const event of fileEvents) {
      if (event.canvasNonBlank) {
        sawNonBlank = true;
      } else if (sawNonBlank && event.canvasVisible) {
        blankAfterNonBlankCount += 1;
      }
    }

    return {
      blankAfterNonBlankCount,
      canvasNonBlankMs: durationFromDispatch(dispatch, canvasNonBlank),
      canvasReplacementCount: Math.max(0, canvasIds.size - 1),
      canvasVisibleMs: durationFromDispatch(dispatch, canvasVisible),
      dispatchTimestamp: roundMetric(readNumber(dispatch.timestamp)),
      dispatchWallTime: roundMetric(getTraceEventWallTime(dispatch)),
      fileId,
      plotSignatureChangeCount: Math.max(0, plotSignatures.size - 1),
      stableReadyMs: durationFromDispatch(dispatch, stableReady),
      tooltipMs: durationFromDispatch(dispatch, tooltip),
    };
  });
};

const summarizeLiveHoverTargetSamples = (targetSamples) => ({
  sampledTargetCount: targetSamples.length,
  targetBlankAfterNonBlankCount: targetSamples.reduce(
    (sum, sample) => sum + sample.blankAfterNonBlankCount,
    0,
  ),
  targetCanvasNonBlankCount: targetSamples.filter(sample => sample.canvasNonBlankMs != null).length,
  targetCanvasNonBlankMs: summarizeDurations(targetSamples.map(sample => sample.canvasNonBlankMs)),
  targetCanvasReplacementCount: targetSamples.reduce(
    (sum, sample) => sum + sample.canvasReplacementCount,
    0,
  ),
  targetCanvasVisibleCount: targetSamples.filter(sample => sample.canvasVisibleMs != null).length,
  targetCanvasVisibleMs: summarizeDurations(targetSamples.map(sample => sample.canvasVisibleMs)),
  targetPlotSignatureChangeCount: targetSamples.reduce(
    (sum, sample) => sum + sample.plotSignatureChangeCount,
    0,
  ),
  targetSamples,
  targetStableReadyCount: targetSamples.filter(sample => sample.stableReadyMs != null).length,
  targetStableReadyMs: summarizeDurations(targetSamples.map(sample => sample.stableReadyMs)),
  targetTooltipCount: targetSamples.filter(sample => sample.tooltipMs != null).length,
  targetTooltipMs: summarizeDurations(targetSamples.map(sample => sample.tooltipMs)),
});

const summarizeLiveHoverWindow = (window, targetSamples, perfReport) => {
  if (!window) {
    return null;
  }

  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  return {
    durationMs: window.durationMs,
    endAnchor: window.endAnchor,
    startAnchor: window.startAnchor,
    ...summarizeLiveHoverTargetSamples(targetSamples),
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPreviewReadyMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "thumbnailReady"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
  };
};

const summarizeThumbnailHoverLiveStress = (result, perfReport, phaseAnchors = []) => {
  if (!result) {
    return null;
  }

  const events = Array.isArray(result.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result.trace?.dispatches) ? result.trace.dispatches : [];
  const targetSamples = createLiveHoverTargetSamples(result);
  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  const duringProcessingWindow = phaseWindowByName(phaseAnchors, "liveThumbnailHoverDuringProcessing");
  const afterProcessingWindow = phaseWindowByName(phaseAnchors, "liveThumbnailHoverAfterProcessing");
  const targetSampleSummary = summarizeLiveHoverTargetSamples(targetSamples);
  const watchedEvents = events.filter(event => event.isWatchedFile);
  const watchedCanvasIds = new Set(watchedEvents
    .map(event => event.canvasId)
    .filter(Boolean));
  const watchedPlotSignatures = new Set(watchedEvents
    .map(event => event.plotSignature)
    .filter(Boolean));
  let blankAfterNonBlankCount = 0;
  let sawNonBlank = false;
  for (const event of watchedEvents) {
    if (event.canvasNonBlank) {
      sawNonBlank = true;
    } else if (sawNonBlank && event.canvasVisible) {
      blankAfterNonBlankCount += 1;
    }
  }
  const firstNonBlank = watchedEvents.find(event => event.canvasNonBlank);
  const firstStableReady = watchedEvents.find(event =>
    event.canvasNonBlank &&
    event.plotSignature &&
    event.loadingVisible === false
  );
  const perfSummary = summarizeAnalysisPerfReport(perfReport).thumbnail;

  return {
    blankAfterNonBlankCount,
    dispatchCount: dispatches.length,
    durationMs: result.durationMs,
    eventCount: result.eventCount,
    hoverEventIntervalMs: result.intervalMs,
    liveWindowMs: result.liveMs,
    perf: perfSummary,
    phaseWindows: {
      afterProcessing: summarizeLiveHoverWindow(
        afterProcessingWindow,
        createLiveHoverTargetSamples(result, afterProcessingWindow),
        perfReport,
      ),
      duringProcessing: summarizeLiveHoverWindow(
        duringProcessingWindow,
        createLiveHoverTargetSamples(result, duringProcessingWindow),
        perfReport,
      ),
    },
    requestedCount: result.requestedCount,
    targetCount: result.targetCount,
    ...targetSampleSummary,
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPreviewReadyMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "thumbnailReady"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
    traceEventCount: events.length,
    uniqueDispatchedFileCount: new Set(dispatches.map(dispatch => dispatch.fileId).filter(Boolean)).size,
    watchOnly: result.watchOnly === true,
    watchedCanvasReplacementCount: Math.max(0, watchedCanvasIds.size - 1),
    watchedCanvasStateCounts: countBy(watchedEvents.map(event =>
      event.loadingVisible
        ? "loading"
        : event.canvasNonBlank
          ? "nonBlank"
          : event.canvasVisible
            ? "blankCanvas"
            : event.tooltipVisible
              ? "tooltipNoCanvas"
              : "noTooltip"
    )),
    watchedFirstNonBlankMs: readNumber(firstNonBlank?.timestamp),
    watchedFirstStableReadyMs: readNumber(firstStableReady?.timestamp),
    watchedFileId: result.trace?.watchedFileId ?? result.watchedTarget?.fileId ?? null,
    watchedPlotSignatureChangeCount: Math.max(0, watchedPlotSignatures.size - 1),
    watchedTimelineHead: watchedEvents.slice(0, 12),
    watchedTimelineTail: watchedEvents.slice(-12),
  };
};

const summarizeLiveWatchedHoverSpeed = (result, liveSummary) => {
  if (!result || !liveSummary) {
    return null;
  }

  const events = Array.isArray(result.trace?.events)
    ? result.trace.events.filter(event => event.isWatchedFile)
    : [];
  const firstMs = predicate => readNumber(events.find(predicate)?.timestamp);
  return {
    blankAfterNonBlankCount: liveSummary.blankAfterNonBlankCount,
    dispatchCount: liveSummary.dispatchCount,
    eventCount: result.eventCount,
    firstCanvasNonBlankMs: firstMs(event => event.canvasNonBlank),
    firstCanvasVisibleMs: firstMs(event => event.canvasVisible),
    firstLoadingMs: firstMs(event => event.loadingVisible),
    firstStableReadyMs: firstMs(event =>
      event.canvasNonBlank &&
      event.plotSignature &&
      event.loadingVisible === false
    ),
    firstTooltipMs: firstMs(event => event.tooltipVisible),
    sampledTargetCount: liveSummary.sampledTargetCount,
    targetCount: result.targetCount,
    targetCanvasNonBlankCount: liveSummary.targetCanvasNonBlankCount,
    targetCanvasNonBlankMs: liveSummary.targetCanvasNonBlankMs,
    targetCanvasReplacementCount: liveSummary.targetCanvasReplacementCount,
    targetCanvasVisibleCount: liveSummary.targetCanvasVisibleCount,
    targetCanvasVisibleMs: liveSummary.targetCanvasVisibleMs,
    targetStableReadyCount: liveSummary.targetStableReadyCount,
    targetStableReadyMs: liveSummary.targetStableReadyMs,
    targetTooltipCount: liveSummary.targetTooltipCount,
    targetTooltipMs: liveSummary.targetTooltipMs,
    uniqueDispatchedFileCount: liveSummary.uniqueDispatchedFileCount,
    watchedCanvasReplacementCount: liveSummary.watchedCanvasReplacementCount,
    watchedFileId: liveSummary.watchedFileId,
    watchedPlotSignatureChangeCount: liveSummary.watchedPlotSignatureChangeCount,
    watchOnly: result.watchOnly === true,
  };
};

const summarizeStableThumbnailHoverSpeed = (result, stableSummary) => {
  if (!result || !stableSummary) {
    return null;
  }

  return {
    canvasDrawnCount: stableSummary.canvasDrawnCount,
    canvasDrawnMs: stableSummary.canvasDrawnMs,
    canvasReadyMs: stableSummary.canvasReadyMs,
    canvasStableCount: stableSummary.canvasStableCount,
    canvasStableMs: stableSummary.canvasStableMs,
    canvasVisibleCount: stableSummary.canvasVisibleCount,
    loadingVisibleCount: stableSummary.loadingVisibleCount,
    sampledCount: stableSummary.sampledCount,
    targetCount: stableSummary.targetCount,
    tooltipVisibleCount: stableSummary.tooltipVisibleCount,
    tooltipVisibleMs: stableSummary.tooltipVisibleMs,
  };
};

const summarizeThumbnailHoverSpeedComparison = ({
  apply,
  live,
  liveSummary,
  stable,
  stableSummary,
}) => {
  if (!live && !stable) {
    return null;
  }

  const beforeProcessingComplete = summarizeLiveWatchedHoverSpeed(live, liveSummary);
  const afterProcessingComplete = summarizeStableThumbnailHoverSpeed(stable, stableSummary);
  const beforeFirstNonBlankMs = readNumber(beforeProcessingComplete?.targetCanvasNonBlankMs?.p50Ms) ??
    readNumber(beforeProcessingComplete?.firstCanvasNonBlankMs);
  const afterDrawnP50Ms = readNumber(afterProcessingComplete?.canvasDrawnMs?.p50Ms);
  const afterDrawnMinMs = readNumber(afterProcessingComplete?.canvasDrawnMs?.minMs);
  return {
    afterProcessingComplete,
    beforeProcessingComplete,
    delta: {
      firstNonBlankMinusStableDrawnMinMs: beforeFirstNonBlankMs != null && afterDrawnMinMs != null
        ? roundMetric(beforeFirstNonBlankMs - afterDrawnMinMs)
        : null,
      firstNonBlankMinusStableDrawnP50Ms: beforeFirstNonBlankMs != null && afterDrawnP50Ms != null
        ? roundMetric(beforeFirstNonBlankMs - afterDrawnP50Ms)
        : null,
      firstNonBlankToStableDrawnP50Ratio: beforeFirstNonBlankMs != null && afterDrawnP50Ms != null && afterDrawnP50Ms > 0
        ? roundMetric(beforeFirstNonBlankMs / afterDrawnP50Ms)
        : null,
    },
    processingBatchMs: readNumber(apply?.processingBatchMs),
  };
};

const createLiveFileSwitchTargetSamples = (result, window = null) => {
  const events = Array.isArray(result?.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result?.trace?.dispatches) ? result.trace.dispatches : [];
  return firstDispatchesByFileForWindow(dispatches, window).map((dispatch) => {
    const fileId = String(dispatch.fileId ?? "");
    const dispatchSignature = dispatch.state?.canvasSignature ?? null;
    const fileEvents = events.filter(event =>
      event.selectedFileId === fileId &&
      readNumber(event.timestamp) != null &&
      readNumber(dispatch.timestamp) != null &&
      event.timestamp >= dispatch.timestamp
    );
    const selected = fileEvents[0] ?? null;
    const canvasVisible = fileEvents.find(event => event.canvasVisible);
    const canvasNonBlank = fileEvents.find(event => event.canvasNonBlank);
    const chartChanged = fileEvents.find(event =>
      event.canvasNonBlank &&
      event.canvasSignature &&
      event.canvasSignature !== dispatchSignature
    );
    const readySelected = fileEvents.find(event =>
      event.selectedChartState === "ready" ||
      event.selectedHasChartData === true
    );
    return {
      canvasNonBlankMs: durationFromDispatch(dispatch, canvasNonBlank),
      canvasVisibleMs: durationFromDispatch(dispatch, canvasVisible),
      chartDrawnMs: durationFromDispatch(dispatch, chartChanged),
      dispatchTimestamp: roundMetric(readNumber(dispatch.timestamp)),
      dispatchWallTime: roundMetric(getTraceEventWallTime(dispatch)),
      fileId,
      readySelectedMs: durationFromDispatch(dispatch, readySelected),
      selectedMs: durationFromDispatch(dispatch, selected),
    };
  });
};

const summarizeFileSwitchStress = (result) => {
  if (!result) {
    return null;
  }

  const samples = Array.isArray(result.samples) ? result.samples : [];
  return {
    canvasVisibleCount: samples.filter(sample => sample.canvasVisibleMs != null).length,
    canvasVisibleMs: summarizeDurations(samples.map(sample => sample.canvasVisibleMs)),
    chartDrawnCount: samples.filter(sample => sample.chartDrawnMs != null).length,
    chartDrawnMs: summarizeDurations(samples.map(sample => sample.chartDrawnMs)),
    durationMs: result.durationMs,
    dispatchedCount: samples.filter(sample => sample.dispatched).length,
    requestedCount: result.requestedCount,
    sampledCount: samples.length,
    selectedCount: samples.filter(sample => sample.selectedMs != null).length,
    selectedMs: summarizeDurations(samples.map(sample => sample.selectedMs)),
    targetCount: result.targetCount,
  };
};

const summarizeLiveFileSwitchTargetSamples = (targetSamples) => ({
  readySelectedCount: targetSamples.filter(sample => sample.readySelectedMs != null).length,
  readySelectedMs: summarizeDurations(targetSamples.map(sample => sample.readySelectedMs)),
  sampledTargetCount: targetSamples.length,
  targetCanvasNonBlankCount: targetSamples.filter(sample => sample.canvasNonBlankMs != null).length,
  targetCanvasNonBlankMs: summarizeDurations(targetSamples.map(sample => sample.canvasNonBlankMs)),
  targetCanvasVisibleCount: targetSamples.filter(sample => sample.canvasVisibleMs != null).length,
  targetCanvasVisibleMs: summarizeDurations(targetSamples.map(sample => sample.canvasVisibleMs)),
  targetChartDrawnCount: targetSamples.filter(sample => sample.chartDrawnMs != null).length,
  targetChartDrawnMs: summarizeDurations(targetSamples.map(sample => sample.chartDrawnMs)),
  targetSamples,
  targetSelectedCount: targetSamples.filter(sample => sample.selectedMs != null).length,
  targetSelectedMs: summarizeDurations(targetSamples.map(sample => sample.selectedMs)),
});

const summarizeLiveFileSwitchWindow = (window, targetSamples, perfReport) => {
  if (!window) {
    return null;
  }

  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  return {
    durationMs: window.durationMs,
    endAnchor: window.endAnchor,
    startAnchor: window.startAnchor,
    ...summarizeLiveFileSwitchTargetSamples(targetSamples),
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
  };
};

const summarizeFileSwitchLiveStress = (result, phaseAnchors = [], perfReport = null) => {
  if (!result) {
    return null;
  }

  const events = Array.isArray(result.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result.trace?.dispatches) ? result.trace.dispatches : [];
  const targetSamples = createLiveFileSwitchTargetSamples(result);
  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  const duringProcessingWindow = phaseWindowByName(phaseAnchors, "liveFileSwitchDuringProcessing");
  const afterProcessingWindow = phaseWindowByName(phaseAnchors, "liveFileSwitchAfterProcessing");
  const targetSampleSummary = summarizeLiveFileSwitchTargetSamples(targetSamples);
  const settleSample = result.settleSample ?? null;
  return {
    dispatchCount: dispatches.length,
    durationMs: result.durationMs,
    eventCount: result.eventCount,
    fileSwitchIntervalMs: result.intervalMs,
    liveWindowMs: result.liveMs,
    phaseWindows: {
      afterProcessing: summarizeLiveFileSwitchWindow(
        afterProcessingWindow,
        createLiveFileSwitchTargetSamples(result, afterProcessingWindow),
        perfReport,
      ),
      duringProcessing: summarizeLiveFileSwitchWindow(
        duringProcessingWindow,
        createLiveFileSwitchTargetSamples(result, duringProcessingWindow),
        perfReport,
      ),
    },
    requestedCount: result.requestedCount,
    settleCanvasVisibleMs: readNumber(settleSample?.canvasVisibleMs),
    settleChartDrawnMs: readNumber(settleSample?.chartDrawnMs),
    settleFileId: settleSample?.fileId ?? null,
    settleSelectedMs: readNumber(settleSample?.selectedMs),
    settleState: settleSample?.afterState ?? null,
    targetCount: result.targetCount,
    ...targetSampleSummary,
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
    traceEventCount: events.length,
    uniqueDispatchedFileCount: new Set(dispatches.map(dispatch => dispatch.fileId).filter(Boolean)).size,
  };
};

const summarizeFileSwitchSpeedComparison = ({
  apply,
  liveSummary,
  stableSummary,
}) => {
  if (!liveSummary && !stableSummary) {
    return null;
  }

  const beforeDrawnP50Ms = readNumber(liveSummary?.targetChartDrawnMs?.p50Ms);
  const beforeSelectedP50Ms = readNumber(liveSummary?.targetSelectedMs?.p50Ms);
  const settleDrawnMs = readNumber(liveSummary?.settleChartDrawnMs);
  const settleSelectedMs = readNumber(liveSummary?.settleSelectedMs);
  const afterDrawnP50Ms = readNumber(stableSummary?.chartDrawnMs?.p50Ms);
  const afterSelectedP50Ms = readNumber(stableSummary?.selectedMs?.p50Ms);
  return {
    afterProcessingComplete: stableSummary,
    beforeProcessingComplete: liveSummary,
    delta: {
      chartDrawnP50MinusStableP50Ms: beforeDrawnP50Ms != null && afterDrawnP50Ms != null
        ? roundMetric(beforeDrawnP50Ms - afterDrawnP50Ms)
        : null,
      chartDrawnP50ToStableP50Ratio: beforeDrawnP50Ms != null && afterDrawnP50Ms != null && afterDrawnP50Ms > 0
        ? roundMetric(beforeDrawnP50Ms / afterDrawnP50Ms)
        : null,
      settleChartDrawnMinusStableP50Ms: settleDrawnMs != null && afterDrawnP50Ms != null
        ? roundMetric(settleDrawnMs - afterDrawnP50Ms)
        : null,
      settleChartDrawnToStableP50Ratio: settleDrawnMs != null && afterDrawnP50Ms != null && afterDrawnP50Ms > 0
        ? roundMetric(settleDrawnMs / afterDrawnP50Ms)
        : null,
      settleSelectedMinusStableP50Ms: settleSelectedMs != null && afterSelectedP50Ms != null
        ? roundMetric(settleSelectedMs - afterSelectedP50Ms)
        : null,
      settleSelectedToStableP50Ratio: settleSelectedMs != null && afterSelectedP50Ms != null && afterSelectedP50Ms > 0
        ? roundMetric(settleSelectedMs / afterSelectedP50Ms)
        : null,
      selectedP50MinusStableP50Ms: beforeSelectedP50Ms != null && afterSelectedP50Ms != null
        ? roundMetric(beforeSelectedP50Ms - afterSelectedP50Ms)
        : null,
      selectedP50ToStableP50Ratio: beforeSelectedP50Ms != null && afterSelectedP50Ms != null && afterSelectedP50Ms > 0
        ? roundMetric(beforeSelectedP50Ms / afterSelectedP50Ms)
        : null,
    },
    processingBatchMs: readNumber(apply?.processingBatchMs),
  };
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
  let phaseRecorder = null;
  try {
    runtime = await openRuntime({
      autoFolderPath: options.runtime === "desktop" && options.autoFolder ? fixtureRoot : null,
      baseUrl: server.baseUrl,
      browserChannel: options.browserChannel,
      runtime: options.runtime,
    });
    phaseRecorder = createPhaseRecorder(runtime.page, options.runtime);
    if (options.analysisPerf) {
      await enableAnalysisPerf(runtime.page);
    }
    await getOpenFolderButton(runtime.page).waitFor({ timeout: 30000 });
    await installPageTraceObservers(runtime.page);
    await phaseRecorder.mark("runtime.ready", {
      analysisPerf: options.analysisPerf,
      autoBrowser: options.autoBrowser,
      autoFolder: options.autoFolder,
      fileCount: options.fileCount,
      rowCount: options.rowCount,
    });
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
      await phaseRecorder.mark("import.dispatch.start", {
        method: "desktop-auto-folder",
      });
      await getOpenFolderButton(runtime.page).click();
      await phaseRecorder.mark("import.dispatch.end", {
        method: "desktop-auto-folder",
      });
    } else if (options.autoBrowser) {
      const files = createBrowserDropSpecs({
        fixture,
        rowCount: options.rowCount,
        runId,
      });
      await runtime.page.locator(".file-list-viewport").waitFor({ timeout: 30000 });
      await phaseRecorder.mark("import.dispatch.start", {
        fileCount: files.length,
        method: "browser-drop",
      });
      await dispatchBrowserFixtureDrop(runtime.page, {
        files,
        rowCount: options.rowCount,
        runId,
      });
      await phaseRecorder.mark("import.dispatch.end", {
        fileCount: files.length,
        method: "browser-drop",
      });
    }
    const finalState = await waitForTraceCompletion({
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
      page: runtime.page,
      timeoutMs: options.timeoutMs,
    });
    await phaseRecorder.mark("import.ready", {
      assessmentBadgeCount: finalState.dom?.assessment ?? null,
      prepareCompletionCount: fixture.expectedPrepareCompletionCount,
    });
    let thumbnailApply = null;
    let thumbnailHover = null;
    let thumbnailHoverLive = null;
    let fileSwitch = null;
    let fileSwitchLive = null;
    if (options.thumbnailHoverLive || options.fileSwitchLive) {
      const liveLabels = [
        options.thumbnailHoverLive ? "thumbnail hover" : null,
        options.fileSwitchLive ? "file switch" : null,
      ].filter(Boolean).join(" + ");
      console.log(`[import-badge-trace] Applying template and immediately running live ${liveLabels} stress...`);
      const before = await readThumbnailHoverDomState(runtime.page);
      await waitForApplyAllReady(runtime.page, options.timeoutMs);
      const applyStartedAt = Date.now();
      await phaseRecorder.mark("apply.click.start", {
        fileSwitchLive: options.fileSwitchLive,
        thumbnailHoverLive: options.thumbnailHoverLive,
      });
      await getApplyAllButton(runtime.page).click();
      await phaseRecorder.mark("apply.click.end");
      await runtime.page.waitForFunction(
        () => [...document.querySelectorAll(".file-list-item[data-file-id]")]
          .some(item => {
            const state = item.dataset.chartState;
            return state === "queued" ||
              state === "processing" ||
              state === "ready" ||
              state === "skipped";
          }),
        undefined,
        { timeout: options.timeoutMs },
      );
      await phaseRecorder.mark("apply.processing-visible");
      const afterClick = await readThumbnailHoverDomState(runtime.page);
      let processingBatchMs = null;
      const processingDone = waitForTemplateProcessingBatch(runtime.page, options.timeoutMs)
        .then(async (value) => {
          processingBatchMs = Date.now() - applyStartedAt;
          await phaseRecorder.mark("processing.done", {
            processingBatchMs,
          });
          return value;
        });
      const runThumbnailHoverLiveStressTask = async () => {
        await phaseRecorder.mark("live.thumbnailHover.start", {
          count: options.thumbnailHoverCount,
          intervalMs: options.thumbnailHoverStormIntervalMs,
          liveMs: options.thumbnailHoverLiveMs,
          watchOnly: options.thumbnailHoverLiveWatchOnly,
        });
        thumbnailHoverLive = await runLiveThumbnailHoverStress({
          count: options.thumbnailHoverCount,
          intervalMs: options.thumbnailHoverStormIntervalMs,
          liveMs: options.thumbnailHoverLiveMs,
          page: runtime.page,
          timeoutMs: options.timeoutMs,
          watchOnly: options.thumbnailHoverLiveWatchOnly,
        });
        await phaseRecorder.mark("live.thumbnailHover.end", {
          eventCount: thumbnailHoverLive?.eventCount ?? null,
          targetCount: thumbnailHoverLive?.targetCount ?? null,
        });
      };
      const runFileSwitchLiveStressTask = async () => {
        await phaseRecorder.mark("live.fileSwitch.start", {
          count: options.fileSwitchCount,
          intervalMs: options.fileSwitchIntervalMs,
          liveMs: options.fileSwitchLiveMs,
        });
        fileSwitchLive = await runLiveFileSwitchStress({
          count: options.fileSwitchCount,
          intervalMs: options.fileSwitchIntervalMs,
          liveMs: options.fileSwitchLiveMs,
          page: runtime.page,
          timeoutMs: options.timeoutMs,
        });
        await phaseRecorder.mark("live.fileSwitch.end", {
          eventCount: fileSwitchLive?.eventCount ?? null,
          targetCount: fileSwitchLive?.targetCount ?? null,
        });
      };
      const liveStressTasks = [
        ...(options.thumbnailHoverLive ? [runThumbnailHoverLiveStressTask] : []),
        ...(options.fileSwitchLive ? [runFileSwitchLiveStressTask] : []),
      ];
      if (options.liveStressParallel) {
        await Promise.all(liveStressTasks.map(task => task()));
      } else {
        for (const task of liveStressTasks) {
          await task();
        }
      }
      await processingDone;
      await runtime.page.waitForTimeout(300);
      thumbnailApply = {
        after: await readThumbnailHoverDomState(runtime.page),
        afterClick,
        before,
        durationMs: Date.now() - applyStartedAt,
        expectedReadyCount: Math.max(
          options.thumbnailHoverLive ? options.thumbnailHoverCount : 0,
          options.fileSwitchLive ? options.fileSwitchCount : 0,
        ),
        live: true,
        processingBatchMs,
      };
    }
    if (options.thumbnailHover) {
      if (!thumbnailApply) {
        console.log("[import-badge-trace] Applying template before thumbnail hover stress...");
        await phaseRecorder.mark("apply.stable.start", {
          reason: "thumbnail-hover",
        });
        thumbnailApply = await runTemplateApplyForThumbnailHover({
          expectedReadyCount: options.thumbnailHoverCount,
          page: runtime.page,
          timeoutMs: options.timeoutMs,
        });
        await phaseRecorder.mark("processing.done", {
          processingBatchMs: thumbnailApply.durationMs,
          reason: "stable-apply",
        });
      }
      console.log("[import-badge-trace] Running thumbnail hover stress...");
      await phaseRecorder.mark("stable.thumbnailHover.start", {
        count: options.thumbnailHoverCount,
      });
      thumbnailHover = await runThumbnailHoverStress({
        count: options.thumbnailHoverCount,
        page: runtime.page,
        timeoutMs: options.timeoutMs,
      });
      await phaseRecorder.mark("stable.thumbnailHover.end", {
        targetCount: thumbnailHover?.targetCount ?? null,
      });
    }
    if (options.fileSwitch) {
      if (!thumbnailApply) {
        console.log("[import-badge-trace] Applying template before file switch stress...");
        await phaseRecorder.mark("apply.stable.start", {
          reason: "file-switch",
        });
        thumbnailApply = await runTemplateApplyForThumbnailHover({
          expectedReadyCount: options.fileSwitchCount,
          page: runtime.page,
          timeoutMs: options.timeoutMs,
        });
        await phaseRecorder.mark("processing.done", {
          processingBatchMs: thumbnailApply.durationMs,
          reason: "stable-apply",
        });
      }
      console.log("[import-badge-trace] Running file switch stress...");
      await phaseRecorder.mark("stable.fileSwitch.start", {
        count: options.fileSwitchCount,
      });
      fileSwitch = await runFileSwitchStress({
        count: options.fileSwitchCount,
        page: runtime.page,
        timeoutMs: options.timeoutMs,
      });
      await phaseRecorder.mark("stable.fileSwitch.end", {
        targetCount: fileSwitch?.targetCount ?? null,
      });
    }
    if (options.thumbnailHover || options.fileSwitch) {
      await phaseRecorder.mark("stable.end", {
        fileSwitch: Boolean(fileSwitch),
        thumbnailHover: Boolean(thumbnailHover),
      });
    }
    sampler.stop();
    const analysisPerfReport = options.analysisPerf
      ? await readAnalysisPerfReport(runtime.page)
      : null;
    const reportTraceState = await readTraceState(runtime.page).catch(() => finalState);
    const milestones = summarizeMilestones(finalState.events, {
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
    });
    const thumbnailHoverSummary = summarizeThumbnailHoverStress(thumbnailHover, analysisPerfReport);
    const thumbnailHoverLiveSummary = summarizeThumbnailHoverLiveStress(
      thumbnailHoverLive,
      analysisPerfReport,
      phaseRecorder.anchors,
    );
    const fileSwitchSummary = summarizeFileSwitchStress(fileSwitch);
    const fileSwitchLiveSummary = summarizeFileSwitchLiveStress(
      fileSwitchLive,
      phaseRecorder.anchors,
      analysisPerfReport,
    );
    const analysis = {
      ...summarizeTraceAnalysis({
        events: finalState.events,
        fixture,
        milestones,
        resourceSamples: sampler.samples,
      }),
      analysisPerf: summarizeAnalysisPerfReport(analysisPerfReport),
      phaseAnalysis: summarizePhaseAnalysis({
        analysisPerfReport,
        phaseAnchors: phaseRecorder.anchors,
        resourceSamples: sampler.samples,
        traceEvents: reportTraceState.events,
      }),
      thumbnailHover: thumbnailHoverSummary,
      thumbnailHoverLive: thumbnailHoverLiveSummary,
      thumbnailHoverSpeedComparison: summarizeThumbnailHoverSpeedComparison({
        apply: thumbnailApply,
        live: thumbnailHoverLive,
        liveSummary: thumbnailHoverLiveSummary,
        stable: thumbnailHover,
        stableSummary: thumbnailHoverSummary,
      }),
      fileSwitch: fileSwitchSummary,
      fileSwitchLive: fileSwitchLiveSummary,
      fileSwitchSpeedComparison: summarizeFileSwitchSpeedComparison({
        apply: thumbnailApply,
        liveSummary: fileSwitchLiveSummary,
        stableSummary: fileSwitchSummary,
      }),
    };
    const report = {
      analysis,
      analysisPerfReport,
      fixture,
      fixtureRoot,
      generatedAt: new Date().toISOString(),
      options,
      phaseAnchors: phaseRecorder.anchors,
      runId,
      runtime: options.runtime,
      finalDomState: reportTraceState.dom,
      milestones,
      resourceSamples: sampler.samples,
      thumbnailApply,
      thumbnailHover,
      thumbnailHoverLive,
      fileSwitch,
      fileSwitchLive,
      traceEvents: reportTraceState.events,
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
