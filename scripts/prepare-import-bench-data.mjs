import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ROWS = 293_000;
const DEFAULT_OUT_DIR = path.join(process.cwd(), ".tooling", "import-bench-data");

const parseArgs = (args) => {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    rows: DEFAULT_ROWS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--rows") {
      options.rows = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.outDir = path.resolve(String(args[index + 1] ?? ""));
      index += 1;
      continue;
    }
  }

  if (!Number.isInteger(options.rows) || options.rows <= 0) {
    throw new Error(
      "Usage: node scripts/prepare-import-bench-data.mjs [--rows <positive integer>] [--out <directory>]",
    );
  }

  return options;
};

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1e-3 && Math.abs(value) < 1e6) {
    return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }
  return value.toExponential(6);
};

const createTransferRows = function* (rows) {
  yield "SetupTitle,Transfer_DB";
  yield "TestParameter,Channel.VName,Vg,Vd,Vs";
  yield "TestParameter,Channel.Func,VAR1,VAR2,CONST";
  yield "TestParameter,Output.Graph.XAxis.Data,Vg";
  yield "AnalysisSetup,Analysis.Setup.Vector.Graph.Notes,\"[VAR1] Unit=SMU3:MP, Name=Vg, Start=-3 V, Stop=3 V, Step=0.05 V\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=0.05 V, Stop=1 V\"";
  yield "DataName,Vg,Id,Ig,Vd";

  for (let index = 0; index < rows; index += 1) {
    const group = index % 4;
    const point = Math.floor(index / 4);
    const vg = -3 + (point % 121) * 0.05;
    const vd = group === 0 ? 0.05 : group === 1 ? 0.1 : group === 2 ? 0.5 : 1;
    const polarity = vg < 0 ? -1 : 1;
    const id = polarity * (1e-12 + Math.pow(Math.max(0, vg + 3.05), 2) * vd * 1e-8);
    const ig = polarity * (1e-13 + (point % 17) * 1e-15);
    yield `DataValue,${formatNumber(vg)},${formatNumber(id)},${formatNumber(ig)},${formatNumber(vd)}`;
  }
};

const createOutputRows = function* (rows) {
  yield "SetupTitle,Output";
  yield "TestParameter,Channel.VName,Vg,Vd,Vs";
  yield "TestParameter,Channel.Func,VAR2,VAR1,CONST";
  yield "TestParameter,Output.Graph.XAxis.Data,Vd";
  yield "DataName,Vd,Id,Ig,Vg";

  for (let index = 0; index < rows; index += 1) {
    const group = index % 5;
    const point = Math.floor(index / 5);
    const vd = (point % 201) * 0.01;
    const vg = -1 + group * 0.75;
    const drive = Math.max(0, vg + 1.2);
    const id = (drive * drive + 0.1) * vd * 1e-6;
    const ig = 1e-13 + group * 1e-14;
    yield `DataValue,${formatNumber(vd)},${formatNumber(id)},${formatNumber(ig)},${formatNumber(vg)}`;
  }
};

const writeCsv = async (filePath, rows) => {
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

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outDir, { recursive: true });

  const files = [
    {
      fileName: `generated-transfer-${options.rows}.csv`,
      rows: createTransferRows(options.rows),
    },
    {
      fileName: `generated-output-${options.rows}.csv`,
      rows: createOutputRows(options.rows),
    },
  ];

  for (const file of files) {
    const filePath = path.join(options.outDir, file.fileName);
    const lineCount = await writeCsv(filePath, file.rows);
    const stat = await fs.stat(filePath);
    console.log(`[bench-data] ${filePath}`);
    console.log(`  lines=${lineCount.toLocaleString()} bytes=${formatBytes(stat.size)}`);
  }

  console.log(`[bench-data] root=${options.outDir}`);
};

await main();
