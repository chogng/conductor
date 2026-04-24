import fs from "node:fs/promises";
import path from "node:path";
import { inferDeviceAnalysisAutoExtraction } from "../src/features/device-analysis/shared/lib/deviceAnalysisAutoExtraction.ts";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".tooling", "rust-auto-extraction-compat");
const REQUESTS_PATH = path.join(OUTPUT_DIR, "requests.jsonl");
const BASELINE_PATH = path.join(OUTPUT_DIR, "ts-baseline.json");
const RUST_RESULTS_PATH = path.join(OUTPUT_DIR, "rust-results.jsonl");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");

const fixtures = [
  {
    name: "stripped-output",
    fileName: "tran.csv",
    rows: [
      ["Repeat", "VAR2", "Point", "CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH1 Time", "CH2 Voltage", "CH2 Current"],
      ["1", "1", "1", "-3.0", "-1e-12", "", "", "-60", "1e-9"],
      ["1", "1", "2", "-2.0", "-1e-10", "", "", "-60", "1.1e-9"],
      ["1", "1", "3", "-1.0", "-1e-8", "", "", "-60", "1.2e-9"],
      ["1", "1", "4", "0.0", "-1e-7", "", "", "-60", "1.1e-9"],
      ["1", "2", "1", "-3.0", "-2e-12", "", "", "-40", "1e-9"],
      ["1", "2", "2", "-2.0", "-2e-10", "", "", "-40", "1.1e-9"],
      ["1", "2", "3", "-1.0", "-2e-8", "", "", "-40", "1.2e-9"],
      ["1", "2", "4", "0.0", "-2e-7", "", "", "-40", "1.1e-9"],
    ],
  },
  {
    name: "generic-transfer-repeated-x",
    fileName: "transfer.csv",
    rows: [
      ["SetupTitle", "Transfer_DB"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      ["DataName", "Vg", "Id", "Ig", "Vd"],
      ["DataValue", "-2", "1e-12", "1e-13", "0.1"],
      ["DataValue", "-1", "1e-11", "1e-13", "0.1"],
      ["DataValue", "0", "1e-10", "1e-13", "0.1"],
      ["DataValue", "-2", "2e-12", "1e-13", "1.0"],
      ["DataValue", "-1", "2e-11", "1e-13", "1.0"],
      ["DataValue", "0", "2e-10", "1e-13", "1.0"],
    ],
  },
  {
    name: "notes-only-bias",
    fileName: "Transfer_DB [notes-only-bias].csv",
    rows: [
      ["SetupTitle", "Transfer_DB"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      ["AnalysisSetup", "Analysis.Setup.Vector.Graph.Notes", "[VAR1] Unit=SMU3:MP, Name=Vg, Direction=Double, Start=-1 V, Stop=4 V, Step=25 mV\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV, Stop=1 V, Step=950 mV, No. of Steps=2"],
      ["DataName", "Vg", "Id", "Ig"],
      ["DataValue", "-1", "1e-13", "1e-12"],
      ["DataValue", "0", "1e-12", "1e-12"],
      ["DataValue", "1", "1e-9", "1e-12"],
      ["DataValue", "-1", "2e-13", "1e-12"],
      ["DataValue", "0", "2e-12", "1e-12"],
      ["DataValue", "1", "2e-9", "1e-12"],
    ],
  },
  {
    name: "adjacent-xy-shared-x",
    fileName: "30020 SLVT IVlin.csv",
    rows: [
      [
        "drain TotalCurrent(IdVg_n938_des) X",
        "drain TotalCurrent(IdVg_n938_des) Y",
        "drain TotalCurrent(IdVg_n944_des) X",
        "drain TotalCurrent(IdVg_n944_des) Y",
        "drain TotalCurrent(IdVg_n950_des) X",
        "drain TotalCurrent(IdVg_n950_des) Y",
      ],
      ["-0.5", "2e-23", "-0.5", "3e-22", "-0.5", "4e-21"],
      ["0.0", "1e-15", "0.0", "2e-14", "0.0", "3e-13"],
      ["0.5", "8e-8", "0.5", "7e-7", "0.5", "3e-6"],
      ["1.0", "2e-5", "1.0", "2.4e-5", "1.0", "2.8e-5"],
    ],
  },
  {
    name: "shared-x-multi-y",
    fileName: "output_multi_y.csv",
    rows: [
      ["Vd", "Id @ Vg=0.5", "Id @ Vg=1.0", "Id @ Vg=1.5"],
      ["0.0", "1e-9", "2e-9", "3e-9"],
      ["0.5", "1e-6", "2e-6", "3e-6"],
      ["1.0", "2e-5", "2.5e-5", "3.2e-5"],
    ],
  },
  {
    name: "cv-two-column",
    fileName: "#CV-60um-5,10kHz_2026-01-09-10-09-59.xls",
    rows: [
      ["{c_v_ext}", "2026-01-08-21-55-45"],
      ["{(C_V_C_V_EXT)Cp_vp@ vn=0.0}", "vn=0.00000"],
      ["vp", "Cp"],
      ["-7", "5.91849e-12"],
      ["-6.9", "6.96301e-12"],
      ["-6.8", "7.24286e-12"],
      ["-6.7", "6.74907e-12"],
    ],
  },
  {
    name: "cf-two-column",
    fileName: "#CF-10um-10_2026-01-09-11-09-36.xls",
    rows: [
      ["{c_freq_ext}", "2026-01-09-11-07-05"],
      ["{(C_freq_ext_C_Freq_EXT)Cp_freq@ vn=1.0}", "vn=1.00000"],
      ["freq", "Cp(vp=0.00000)"],
      ["1000", "1.48524e-12"],
      ["11000", "1.34488e-12"],
      ["21000", "1.33745e-12"],
      ["31000", "1.33642e-12"],
    ],
  },
  {
    name: "pv-fastiv",
    fileName: "W-AOHZOAO-W-380C-PV-D100-WAKE UP_2026-01-15-16-25-29.xls",
    rows: [
      ["{i_v_fastiv_ivt-D150}", "2026-01-15-16-20-41", "", "{i_v_fastiv_ivt-D150}", "2026-01-15-16-20-41", ""],
      ["{(_FastIV(IVT))vp,in_Time@ vn; vp}", "wave", "", "", "{(original__FastIV(IVT))vp,in_Time@ vn; vp}", "wave"],
      ["vp", "`vp", "ipt", "Time", "vp", "in"],
      ["-0.0071", "0.0002", "3.6e-7", "1e-7", "-0.0071", "-3.6e-7"],
      ["-0.0048", "0.0010", "9.4e-7", "2e-7", "-0.0048", "-9.4e-7"],
      ["0.0068", "0.0131", "1.8e-5", "1.2e-6", "0.0068", "-1.8e-5"],
    ],
  },
  {
    name: "unknown",
    fileName: "unknown.csv",
    rows: [
      ["A", "B", "C"],
      ["foo", "bar", "baz"],
    ],
  },
];

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const normalizePlan = (result) => {
  if (!result?.ok) return { ok: false };
  const plan = result.plan;
  return {
    ok: true,
    curveType: plan.curveType,
    groups: plan.groups ?? null,
    legendCount: plan.legendCount ?? null,
    legendStartColIndex: plan.legendStartColIndex ?? null,
    legendStartRowIndex: plan.legendStartRowIndex ?? null,
    legendStartValue: plan.legendStartValue ?? null,
    legendStep: Number.isFinite(plan.legendStep) ? Number(plan.legendStep.toPrecision(12)) : null,
    legendTarget: plan.legendTarget ?? "auto",
    xAxisRole: plan.xAxisRole ?? null,
    xCol: plan.xCol,
    xPointsPerGroup: plan.xPointsPerGroup ?? null,
    yCols: plan.yCols,
  };
};

const prepare = async () => {
  await fs.rm(OUTPUT_DIR, { force: true, recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const baseline = [];
  const requests = [];

  for (const [index, fixture] of fixtures.entries()) {
    const filePath = path.join(OUTPUT_DIR, `${fixture.name}.csv`);
    const csv = `${fixture.rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
    await fs.writeFile(filePath, csv, "utf8");

    baseline.push({
      fileName: fixture.fileName,
      name: fixture.name,
      plan: normalizePlan(inferDeviceAnalysisAutoExtraction({
        fileName: fixture.fileName,
        rows: fixture.rows,
        totalRowCount: fixture.rows.length,
      })),
    });

    requests.push(JSON.stringify({
      command: "inferAutoExtraction",
      fileId: `fixture-${index}`,
      fileName: fixture.fileName,
      id: index + 1,
      path: filePath,
    }));
  }

  await fs.writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await fs.writeFile(REQUESTS_PATH, `${requests.join("\n")}\n`, "utf8");
  console.log(`[rust-auto-compat] prepared ${fixtures.length} AB fixtures`);
};

const compare = async () => {
  const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
  const rustLines = (await fs.readFile(RUST_RESULTS_PATH, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rustById = new Map(rustLines.map((line) => {
    const parsed = JSON.parse(line);
    return [parsed.id, parsed];
  }));
  const failures = [];

  for (const [index, expected] of baseline.entries()) {
    const response = rustById.get(index + 1);
    const rustPlan = response?.ok
      ? normalizePlan(response.result)
      : { ok: false, engineError: response?.error?.message ?? "missing Rust response" };
    const passed = JSON.stringify(expected.plan) === JSON.stringify(rustPlan);
    console.log(`[rust-auto-compat] ${passed ? "PASS" : "FAIL"} ${expected.name}`);
    if (!passed) {
      failures.push({
        fixture: expected.name,
        rustPlan,
        tsPlan: expected.plan,
      });
    }
  }

  const report = {
    checked: baseline.length,
    failures,
    passed: baseline.length - failures.length,
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failures.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`[rust-auto-compat] all ${baseline.length} fixtures matched`);
  }
};

const mode = process.argv[2] || "prepare";
if (mode === "prepare") {
  await prepare();
} else if (mode === "compare") {
  await compare();
} else {
  console.error("Usage: node --experimental-strip-types scripts/verify-rust-auto-extraction-compat.mjs <prepare|compare>");
  process.exitCode = 2;
}
