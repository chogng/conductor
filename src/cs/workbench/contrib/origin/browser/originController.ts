import JSZip from "jszip";

import { triggerBlobDownload } from "src/cs/workbench/contrib/export/browser/export";
import {
  buildOriginAxisSpacingCommands,
  buildOriginAxisTitleCommands,
  buildOriginXAxisRangeCommandsFromDisplayRange,
  buildOriginYAxisRangeCommands,
  buildOriginYAxisRangeCommandsFromDisplayRange,
  type OriginAxisScaleMode,
} from "src/cs/workbench/contrib/origin/common/originAxisCommands";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import { originService } from "src/cs/workbench/services/origin/browser/originService";

export const ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES = new Set([
  "ORIGIN_ORIGINPRO_IMPORT_FAILED",
  "ORIGIN_PYTHON_NOT_FOUND",
  "ORIGIN_CSV_RUNNER_NOT_FOUND",
  "ORIGIN_CSV_RUNNER_FAILED",
  "ORIGIN_CSV_FAILED",
  "ORIGIN_CSV_IMPORT_FAILED",
]);

type JsonRecord = Record<string, unknown>;

export type OriginDisplayRange = {
  min: number;
  max: number;
  step?: number | null;
};

export type OriginExportPlanLike = {
  mixedYScales?: boolean;
  mode?: string;
  payloads: JsonRecord[];
  totalCanvasCount?: number;
  totalCurveCount?: number;
};

export type OriginCsvJob = JsonRecord & {
  csv?: {
    name?: string;
    path?: string;
    text?: string;
  };
};

export type OriginZipExportResult = {
  canvasCount: number;
  curveCount: number;
  mixedYScales?: boolean;
  mode?: string;
  zipName: string;
};

export type OriginPayloadBuilder = (options?: {
  omitRustEligibleCsvText?: boolean;
}) => OriginExportPlanLike;

export type OriginCsvRequestBuilder = (payload: JsonRecord) => unknown | null;

export function canRunOriginCsv(): boolean {
  return originService.canRunCsv();
}

const sanitizeFilename = (name: unknown, { max = 180 }: { max?: number } = {}) => {
  const raw = String(name || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "export";
  return raw.length > max ? raw.slice(0, max) : raw;
};

const normalizeOriginLabelText = (
  value: unknown,
  { max = 160 }: { max?: number } = {},
): string => {
  const raw = String(value ?? "")
    .replace(/[\\_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const buildOriginWorkbookKey = (): string => {
  const timeToken = Date.now().toString(36).toUpperCase().slice(-6);
  const randomToken = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `CDX${timeToken}${randomToken}`.slice(0, 18);
};

const buildOriginImportColumnLabels = (options: JsonRecord): JsonRecord | undefined => {
  const columnLayout =
    options.columnLayout === "shared-x"
      ? "shared-x"
      : options.columnLayout === "grouped-x"
        ? "grouped-x"
        : "xy-pairs";
  const columnLongNames = Array.isArray(options.columnLongNames)
    ? options.columnLongNames
    : [];
  const columnUnits = Array.isArray(options.columnUnits) ? options.columnUnits : [];
  const columnComments = Array.isArray(options.columnComments)
    ? options.columnComments
    : [];
  const curveLabels = Array.isArray(options.curveLabels) ? options.curveLabels : [];
  const xColumnLongNames = Array.isArray(options.xColumnLongNames)
    ? options.xColumnLongNames
    : [];
  const xColumnComments = Array.isArray(options.xColumnComments)
    ? options.xColumnComments
    : [];
  const xColumnUnits = Array.isArray(options.xColumnUnits)
    ? options.xColumnUnits
    : [];
  const yColumnLongNames = Array.isArray(options.yColumnLongNames)
    ? options.yColumnLongNames
    : [];
  const yColumnUnits = Array.isArray(options.yColumnUnits)
    ? options.yColumnUnits
    : [];
  if (!curveLabels.length) {
    const longNames = xColumnLongNames.map((label) => normalizeOriginLabelText(label));
    if (!longNames.some((label) => label.length > 0)) return undefined;
    return {
      comments: longNames.map((_, index) =>
        normalizeOriginLabelText(xColumnComments[index]),
      ),
      longNames,
      units: longNames.map((_, index) =>
        normalizeOriginLabelText(xColumnUnits[index]),
      ),
    };
  }

  if (columnLayout === "grouped-x" && columnLongNames.length) {
    return {
      comments: columnLongNames.map((_, index) =>
        normalizeOriginLabelText(columnComments[index]),
      ),
      longNames: columnLongNames.map((label) => normalizeOriginLabelText(label)),
      units: columnLongNames.map((_, index) =>
        normalizeOriginLabelText(columnUnits[index]),
      ),
    };
  }

  const longNames: string[] = [];
  const units: string[] = [];
  const comments: string[] = [];
  if (columnLayout === "shared-x") {
    longNames.push(normalizeOriginLabelText(xColumnLongNames[0]));
    units.push(normalizeOriginLabelText(xColumnUnits[0]));
    comments.push(normalizeOriginLabelText(xColumnComments[0]));
    for (let index = 0; index < curveLabels.length; index += 1) {
      longNames.push(
        normalizeOriginLabelText(yColumnLongNames[index] ?? curveLabels[index]),
      );
      units.push(normalizeOriginLabelText(yColumnUnits[index]));
      comments.push("");
    }
    return { comments, longNames, units };
  }

  for (let index = 0; index < curveLabels.length; index += 1) {
    longNames.push(normalizeOriginLabelText(xColumnLongNames[index]));
    units.push(normalizeOriginLabelText(xColumnUnits[index]));
    comments.push(normalizeOriginLabelText(xColumnComments[index]));
    longNames.push(
      normalizeOriginLabelText(yColumnLongNames[index] ?? curveLabels[index]),
    );
    units.push(normalizeOriginLabelText(yColumnUnits[index]));
    comments.push("");
  }
  return { comments, longNames, units };
};

const buildOriginLegendRefreshCommands = (curveLabels: unknown): string[] => {
  const labels = Array.isArray(curveLabels) ? curveLabels : [];
  return labels.some((label) => normalizeOriginLabelText(label).length > 0)
    ? ["legend -r;"]
    : [];
};

function toNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function buildOriginCsvJobs(options: {
  axisSettings?: unknown;
  chartXRange?: OriginDisplayRange | null;
  chartYRange?: (OriginDisplayRange & { mode: "linear" | "log" }) | null;
  plan: OriginExportPlanLike;
  plotOptions: unknown;
}): OriginCsvJob[] {
  const normalizedPlotOptions = normalizeOriginPlotOptions(
    options.plotOptions,
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );
  const hasCustomPlotCommand =
    typeof normalizedPlotOptions.command === "string" &&
    normalizedPlotOptions.command.trim().length > 0;
  const hasCustomXyPairs =
    String(normalizedPlotOptions.xyPairs || "").trim() !==
    DEFAULT_ORIGIN_PLOT_OPTIONS.xyPairs;
  const sharedWorkbookKey =
    options.plan.mode === "workbookSheets" ? buildOriginWorkbookKey() : "";

  return options.plan.payloads.map((payload, index) => {
    const importColumnLabels = buildOriginImportColumnLabels(payload);
    const legendPostCommands = buildOriginLegendRefreshCommands(payload.curveLabels);
    const payloadYScaleMode: OriginAxisScaleMode =
      payload.yScaleMode === "log" ? "log" : "linear";
    const shouldUseXDisplayRange =
      payload.skipDisplayRange !== true && Boolean(options.chartXRange);
    const shouldUseYDisplayRange =
      payload.skipDisplayRange !== true &&
      Boolean(options.chartYRange) &&
      options.chartYRange?.mode === payloadYScaleMode;
    const originYScaleMode: OriginAxisScaleMode =
      shouldUseYDisplayRange && options.chartYRange?.mode
        ? options.chartYRange.mode
        : payloadYScaleMode;
    const originYAxisTypeCommand =
      originYScaleMode === "log" ? "layer.y.type=2" : "layer.y.type=1";
    const effectiveXyPairs =
      !hasCustomPlotCommand && !hasCustomXyPairs
        ? payload.xyPairs
        : normalizedPlotOptions.xyPairs;
    const displayXRangeCommands = shouldUseXDisplayRange
      ? buildOriginXAxisRangeCommandsFromDisplayRange(options.chartXRange)
      : [];
    const displayRangeCommands = shouldUseYDisplayRange
      ? buildOriginYAxisRangeCommandsFromDisplayRange(
          originYScaleMode,
          options.chartYRange,
        )
      : [];
    const autoYRangeCommands = shouldUseYDisplayRange
      ? []
      : buildOriginYAxisRangeCommands(originYScaleMode, payload);
    const axisSettings =
      options.axisSettings && typeof options.axisSettings === "object"
        ? (options.axisSettings as JsonRecord)
        : null;
    const originAxisSpacingCommands = buildOriginAxisSpacingCommands(axisSettings);
    const originAxisTitleCommands = buildOriginAxisTitleCommands({
      xAxisTitle: payload.xAxisTitle,
      yAxisTitle: payload.yAxisTitle,
      axisTitleFontSize: axisSettings?.axisTitleFontSize ?? null,
    });
    const originAxisCommands = payload.skipAxisCommands
      ? []
      : [
          originYAxisTypeCommand,
          "layer.x.opposite=1",
          "layer.y.opposite=1",
          ...displayXRangeCommands,
          ...displayRangeCommands,
          ...autoYRangeCommands,
          ...originAxisTitleCommands,
          ...originAxisSpacingCommands,
        ];

    return {
      csv: {
        name: String(payload.csvName ?? ""),
        text: String(payload.csvText ?? ""),
      },
      importMode:
        options.plan.mode === "workbookSheets" && index > 0
          ? "existing-book-new-sheet"
          : "new-book",
      workbook: {
        key: sharedWorkbookKey || undefined,
        longName: payload.workbookName,
      },
      sheet: {
        name: payload.sheetShortName ?? payload.sheetName,
        longName: payload.sheetName,
      },
      plot: {
        command: payload.plotCommand ?? normalizedPlotOptions.command,
        postCommands: normalizedPlotOptions.postCommands,
        skip: payload.skipPlot === true,
        type: normalizedPlotOptions.type,
        lineWidth: normalizedPlotOptions.lineWidth,
        xyPairs: effectiveXyPairs,
      },
      capabilities: {
        import: importColumnLabels
          ? {
              columnLabels: {
                ...importColumnLabels,
                designations: payload.columnDesignations,
              },
            }
          : undefined,
        plot: legendPostCommands.length
          ? {
              postCommands: legendPostCommands,
            }
          : undefined,
        axis: {
          limits: {
            x: shouldUseXDisplayRange
              ? {
                  from: toNumber(options.chartXRange?.min),
                  to: toNumber(options.chartXRange?.max),
                  step: toNumber(options.chartXRange?.step),
                  scale: "linear",
                }
              : undefined,
            y: shouldUseYDisplayRange
              ? {
                  from: toNumber(options.chartYRange?.min),
                  to: toNumber(options.chartYRange?.max),
                  step:
                    originYScaleMode === "linear"
                      ? toNumber(options.chartYRange?.step)
                      : undefined,
                  scale: originYScaleMode,
                }
              : {
                  scale: originYScaleMode,
                },
          },
          commands: originAxisCommands,
        },
      },
    };
  });
}

export async function attachOriginCsvPaths(options: {
  buildCsvExportRequest: OriginCsvRequestBuilder;
  jobs: OriginCsvJob[];
  payloads: JsonRecord[];
}): Promise<void> {
  if (!originService.canExportCsv()) return;

  await Promise.all(
    options.jobs.map(async (job, index) => {
      const request = options.buildCsvExportRequest(options.payloads[index]);
      if (!request) return;
      try {
        const response = await originService.exportCsv(request);
        if (!response?.ok || !response?.csvPath) return;
        job.csv = {
          name: String(options.payloads[index]?.csvName ?? ""),
          path: response.csvPath,
        };
      } catch {
        // Keep in-memory CSV text as a compatibility fallback.
      }
    }),
  );
}

export function fillMissingOriginCsvText(options: {
  buildPayloads: OriginPayloadBuilder;
  jobs: OriginCsvJob[];
}): void {
  const missingIndexes = options.jobs
    .map((job, index) =>
      !String(job.csv?.path ?? "").trim() && !String(job.csv?.text ?? "").trim()
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  if (!missingIndexes.length) return;

  const fullResult = options.buildPayloads();
  for (const index of missingIndexes) {
    const fullPayload = fullResult.payloads[index];
    if (!fullPayload) continue;
    options.jobs[index].csv = {
      name: String(fullPayload.csvName ?? ""),
      text: String(fullPayload.csvText ?? ""),
    };
  }
}

export async function runOriginCsvJobs(options: {
  jobs: OriginCsvJob[];
  shouldBatch?: boolean;
}): Promise<void> {
  if (options.shouldBatch && options.jobs.length > 1) {
    await originService.runCsv({ jobs: options.jobs });
    return;
  }

  for (const job of options.jobs) {
    await originService.runCsv(job);
  }
}

export async function exportOriginZip(options: {
  buildCsvExportRequest: OriginCsvRequestBuilder;
  buildPayloads: OriginPayloadBuilder;
}): Promise<OriginZipExportResult | null> {
  const result = options.buildPayloads({ omitRustEligibleCsvText: true });
  const sanitizedPayloads = result.payloads.map((payload, index) => ({
    csvName: sanitizeFilename(payload.csvName || `device_analysis_${index + 1}.csv`),
    payload,
  }));
  const zipBase =
    result.mode === "merged"
      ? sanitizeFilename(
          String(result.payloads[0]?.csvName || "device_analysis").replace(
            /\.csv$/i,
            "",
          ),
        )
      : result.mode === "workbookSheets"
        ? sanitizeFilename(
            String(result.payloads[0]?.workbookName || "device_analysis_workbook"),
          )
        : sanitizeFilename(
            `device_analysis_batch_${result.totalCanvasCount ?? 0}_canvases`,
          );
  const zipName = `${String(zipBase || "device_analysis").replace(
    /\.zip$/i,
    "",
  )}.zip`;

  if (originService.canSaveZip()) {
    const entries = sanitizedPayloads.map(({ csvName, payload }) => ({
      name: csvName,
      text: String(payload.csvText ?? ""),
    }));
    if (originService.canExportCsv()) {
      await Promise.all(
        entries.map(async (entry, index) => {
          if (String(entry.text ?? "").trim()) return;
          const request = options.buildCsvExportRequest(result.payloads[index]);
          if (!request) return;
          try {
            const response = await originService.exportCsv(request);
            if (!response?.ok || !response?.csvPath) return;
            delete (entry as Partial<typeof entry>).text;
            (entry as { path?: string }).path = response.csvPath;
          } catch {
            // Regenerate only the missing CSV text below.
          }
        }),
      );
    }

    const missingIndexes = entries
      .map((entry, index) =>
        !String((entry as { path?: string }).path ?? "").trim() &&
        !String(entry.text ?? "").trim()
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    if (missingIndexes.length) {
      const fullResult = options.buildPayloads();
      for (const index of missingIndexes) {
        const fullPayload = fullResult.payloads[index];
        if (!fullPayload) continue;
        entries[index] = {
          name: sanitizeFilename(
            fullPayload.csvName || `device_analysis_${index + 1}.csv`,
          ),
          text: String(fullPayload.csvText ?? ""),
        };
      }
    }

    const response = await originService.saveZip({
      defaultName: zipName,
      entries,
    });
    if (response?.cancelled) return null;
    if (!response?.ok) {
      throw new Error(response?.message || "Failed to save Origin ZIP.");
    }
    return {
      canvasCount: Number(result.totalCanvasCount ?? 0),
      curveCount: Number(result.totalCurveCount ?? 0),
      mixedYScales: result.mixedYScales,
      mode: result.mode,
      zipName: response.zipPath || zipName,
    };
  }

  const fullResult = result.payloads.some((payload) =>
    !String(payload.csvText ?? "").trim(),
  )
    ? options.buildPayloads()
    : result;
  const zip = new JSZip();
  fullResult.payloads.forEach((payload, index) => {
    zip.file(
      sanitizeFilename(payload.csvName || `device_analysis_${index + 1}.csv`),
      String(payload.csvText ?? ""),
    );
  });

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  triggerBlobDownload(zipName, zipBlob);
  return {
    canvasCount: Number(fullResult.totalCanvasCount ?? 0),
    curveCount: Number(fullResult.totalCurveCount ?? 0),
    mixedYScales: fullResult.mixedYScales,
    mode: fullResult.mode,
    zipName,
  };
}
