/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  getAndClearPerformanceMeasurements,
  isPerformanceMeasurementEnabled,
  type PerformanceMeasurements,
} from "src/cs/workbench/contrib/performance/browser/performanceMeasurements";

const TABLE_PERFORMANCE_DIAGNOSTICS_REPORT_LIMIT = 120;

export type TablePerformanceDiagnosticsReport = {
  readonly diagnosticsEnabled: boolean;
  readonly generatedAt: string;
  readonly kind: "tablePerformanceDiagnostics";
  readonly localOnly: true;
  readonly measurements: readonly PerformanceMeasurements[];
  readonly reportCount: number;
  readonly sampleCount: number;
};

export type TablePerformanceDiagnosticsReportText = {
  readonly report: TablePerformanceDiagnosticsReport;
  readonly text: string;
};

type TablePerformanceDiagnosticsGlobal = {
  reports: PerformanceMeasurements[];
  getLatestReport: () => PerformanceMeasurements | undefined;
  getReports: () => readonly PerformanceMeasurements[];
  reset: () => void;
};

type TablePerformanceDiagnosticsTarget = typeof globalThis & {
  __conductorTablePerformanceDiagnostics?: TablePerformanceDiagnosticsGlobal;
};

export const collectCurrentTablePerformanceDiagnosticsMeasurements = (): PerformanceMeasurements | undefined => {
  const measurements = getAndClearPerformanceMeasurements();
  if (measurements) {
    recordTablePerformanceDiagnosticsMeasurements(measurements);
  }
  return measurements;
};

export const recordTablePerformanceDiagnosticsMeasurements = (
  measurements: PerformanceMeasurements,
): void => {
  const api = getDiagnosticsGlobal();
  api.reports.push(cloneMeasurements(measurements));
  if (api.reports.length > TABLE_PERFORMANCE_DIAGNOSTICS_REPORT_LIMIT) {
    api.reports.splice(0, api.reports.length - TABLE_PERFORMANCE_DIAGNOSTICS_REPORT_LIMIT);
  }
};

export const createTablePerformanceDiagnosticsReport = (): TablePerformanceDiagnosticsReport => {
  collectCurrentTablePerformanceDiagnosticsMeasurements();
  const measurements = getDiagnosticsGlobal().getReports();
  return {
    diagnosticsEnabled: isPerformanceMeasurementEnabled(),
    generatedAt: new Date().toISOString(),
    kind: "tablePerformanceDiagnostics",
    localOnly: true,
    measurements,
    reportCount: measurements.length,
    sampleCount: measurements.reduce((sum, item) => sum + item.sampleCount, 0),
  };
};

export const createTablePerformanceDiagnosticsReportText = (): TablePerformanceDiagnosticsReportText => {
  const report = createTablePerformanceDiagnosticsReport();
  const text = [
    "# Table Performance Diagnostics",
    "",
    `Generated: ${report.generatedAt}`,
    `Diagnostics enabled: ${report.diagnosticsEnabled ? "yes" : "no"}`,
    `Samples: ${report.sampleCount}`,
    "",
    "This report is local-only and contains aggregated table performance measurements. It does not include file paths, file ids, source keys, selected file ids, raw cell contents, or user input.",
    "",
    report.sampleCount === 0
      ? "No table performance samples were collected yet. Enable table performance diagnostics, reproduce the slow table interaction, then copy this report again."
      : "Paste this report into a GitHub issue when reporting table responsiveness problems.",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```",
    "",
  ].join("\n");
  return { report, text };
};

export const resetTablePerformanceDiagnosticsReports = (): void => {
  getDiagnosticsGlobal().reset();
};

const getDiagnosticsGlobal = (): TablePerformanceDiagnosticsGlobal => {
  const target = globalThis as TablePerformanceDiagnosticsTarget;
  const existing = target.__conductorTablePerformanceDiagnostics;
  if (existing) {
    return existing;
  }

  const reports: PerformanceMeasurements[] = [];
  const api: TablePerformanceDiagnosticsGlobal = {
    reports,
    getLatestReport: () => {
      const latest = reports.length === 0 ? undefined : reports[reports.length - 1];
      return latest ? cloneMeasurements(latest) : undefined;
    },
    getReports: () => reports.map(cloneMeasurements),
    reset: () => {
      reports.length = 0;
    },
  };
  target.__conductorTablePerformanceDiagnostics = api;
  return api;
};

const cloneMeasurements = (
  measurements: PerformanceMeasurements,
): PerformanceMeasurements => {
  const stages: PerformanceMeasurements["stages"] = {};
  for (const [stage, measurement] of Object.entries(measurements.stages)) {
    stages[stage] = { ...measurement };
  }
  return {
    generatedAt: measurements.generatedAt,
    sampleCount: measurements.sampleCount,
    stages,
  };
};
