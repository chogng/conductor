/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, type Dialog, type IpcMain, type IpcMainInvokeEvent } from "electron";

import type { IDisposable } from "../../../base/common/lifecycle.js";
import {
  assertOriginExePath,
  normalizeOriginExePath,
} from "./core.js";
import { detectOriginExecutablePathDetailed, type OriginDetectionResult } from "./detect.js";
import { pickOriginExecutable } from "./picker.js";
import { runOriginCsvBatchJob, runOriginCsvJob, runOriginHealthCheck } from "./jobs.js";
import { runOriginRuntimeCleanup } from "./runtime.js";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeNonEmptyString,
  normalizeOriginCommandList,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "./originPlotOptions.js";

type OriginIpcChannels = {
  readonly originExeGet: string;
  readonly originExeSet: string;
  readonly originExePick: string;
  readonly originHealthCheck: string;
  readonly originRunCsv: string;
  readonly originRuntimeCleanupRun: string;
};

type ConductorSettings = Record<string, unknown>;

type ConductorSettingsStore = {
  getConductorSettings(): ConductorSettings;
  patchConductorSettings(updates: Record<string, unknown>): ConductorSettings;
};

export type OriginMainHandlers = IDisposable & {
  runRuntimeCleanup(options?: { clearAll?: boolean; force?: boolean }): Promise<unknown>;
};

export type RegisterOriginMainHandlersOptions = {
  readonly conductorStore: ConductorSettingsStore;
  readonly dialog: Dialog;
  readonly ipcChannels: OriginIpcChannels;
  readonly ipcMain: IpcMain;
  readonly isWindows: boolean;
  readonly logDetectionResult?: (context: string, result: OriginDetectionResult) => void;
  readonly originCsvScriptPath: string | null;
  readonly originCsvWorkerPath: string | null;
  readonly runtimeRootDir: () => string;
};

const ORIGIN_DETECTION_CACHE_TTL_MS = 60 * 1000;

function getPayloadProperty(payload: unknown, key: string): unknown {
  return payload && typeof payload === "object"
    ? Reflect.get(payload, key)
    : undefined;
}

function assertOriginCapabilitiesObject(value: unknown, fieldPath: string): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected object.`);
  }
  return value as Record<string, unknown>;
}

function assertOriginCapabilitiesAllowedKeys(
  section: unknown,
  allowedKeys: string[],
  fieldPath: string,
): Record<string, unknown> {
  const sectionObj = assertOriginCapabilitiesObject(section, fieldPath);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(sectionObj)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid Origin capabilities field '${fieldPath}.${key}'.`);
    }
  }
  return sectionObj;
}

function assertOriginCapabilitiesString(value: unknown, fieldPath: string): void {
  if (value == null) return;
  if (typeof value !== "string") {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected string.`);
  }
}

function assertOriginCapabilitiesCommandList(value: unknown, fieldPath: string): void {
  if (value == null) return;
  if (typeof value === "string") return;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected string or string array.`);
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "string") {
      throw new Error(`Invalid Origin capabilities at '${fieldPath}[${i}]': expected string.`);
    }
  }
}

function assertOriginCapabilitiesStringList(value: unknown, fieldPath: string): void {
  if (value == null) return;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected string array.`);
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== "string") {
      throw new Error(`Invalid Origin capabilities at '${fieldPath}[${i}]': expected string.`);
    }
  }
}

function assertOriginCapabilitiesNumber(value: unknown, fieldPath: string): void {
  if (value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected finite number.`);
  }
}

function validateOriginCapabilitiesPayload(rawCapabilities: unknown): void {
  if (rawCapabilities == null) return;

  const root = assertOriginCapabilitiesAllowedKeys(
    rawCapabilities,
    ["import", "plot", "graph", "style", "axis", "commands", "preCommands", "postCommands"],
    "capabilities",
  );
  const importSection = assertOriginCapabilitiesAllowedKeys(
    root.import,
    ["workbookLongName", "longName", "columnLabels", "preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.import",
  );
  const plotSection = assertOriginCapabilitiesAllowedKeys(
    root.plot,
    ["command", "plotCommand", "preCommands", "beforeCommands", "postCommands", "afterCommands", "postPlotCommands"],
    "capabilities.plot",
  );
  const graphSection = assertOriginCapabilitiesAllowedKeys(
    root.graph,
    ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.graph",
  );
  const styleSection = assertOriginCapabilitiesAllowedKeys(
    root.style,
    ["commands", "postCommands"],
    "capabilities.style",
  );
  const axisSection = assertOriginCapabilitiesAllowedKeys(
    root.axis,
    ["commands", "postCommands", "limits"],
    "capabilities.axis",
  );
  const commandsSection = assertOriginCapabilitiesAllowedKeys(
    root.commands,
    ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
    "capabilities.commands",
  );
  const importColumnLabels = assertOriginCapabilitiesAllowedKeys(
    importSection.columnLabels,
    ["longNames", "units", "comments", "designations"],
    "capabilities.import.columnLabels",
  );
  const axisLimits = assertOriginCapabilitiesAllowedKeys(
    axisSection.limits,
    ["x", "y"],
    "capabilities.axis.limits",
  );
  const axisXLimits = assertOriginCapabilitiesAllowedKeys(
    axisLimits.x,
    ["from", "to", "step", "scale"],
    "capabilities.axis.limits.x",
  );
  const axisYLimits = assertOriginCapabilitiesAllowedKeys(
    axisLimits.y,
    ["from", "to", "step", "scale"],
    "capabilities.axis.limits.y",
  );

  assertOriginCapabilitiesString(importSection.workbookLongName, "capabilities.import.workbookLongName");
  assertOriginCapabilitiesString(importSection.longName, "capabilities.import.longName");
  assertOriginCapabilitiesString(plotSection.command, "capabilities.plot.command");
  assertOriginCapabilitiesString(plotSection.plotCommand, "capabilities.plot.plotCommand");
  assertOriginCapabilitiesStringList(importColumnLabels.longNames, "capabilities.import.columnLabels.longNames");
  assertOriginCapabilitiesStringList(importColumnLabels.units, "capabilities.import.columnLabels.units");
  assertOriginCapabilitiesStringList(importColumnLabels.comments, "capabilities.import.columnLabels.comments");
  assertOriginCapabilitiesStringList(importColumnLabels.designations, "capabilities.import.columnLabels.designations");
  assertOriginCapabilitiesNumber(axisXLimits.from, "capabilities.axis.limits.x.from");
  assertOriginCapabilitiesNumber(axisXLimits.to, "capabilities.axis.limits.x.to");
  assertOriginCapabilitiesNumber(axisXLimits.step, "capabilities.axis.limits.x.step");
  assertOriginCapabilitiesString(axisXLimits.scale, "capabilities.axis.limits.x.scale");
  assertOriginCapabilitiesNumber(axisYLimits.from, "capabilities.axis.limits.y.from");
  assertOriginCapabilitiesNumber(axisYLimits.to, "capabilities.axis.limits.y.to");
  assertOriginCapabilitiesNumber(axisYLimits.step, "capabilities.axis.limits.y.step");
  assertOriginCapabilitiesString(axisYLimits.scale, "capabilities.axis.limits.y.scale");

  for (const [value, fieldPath] of [
    [root.preCommands, "capabilities.preCommands"],
    [root.postCommands, "capabilities.postCommands"],
    [importSection.preCommands, "capabilities.import.preCommands"],
    [importSection.beforeCommands, "capabilities.import.beforeCommands"],
    [importSection.postCommands, "capabilities.import.postCommands"],
    [importSection.afterCommands, "capabilities.import.afterCommands"],
    [plotSection.preCommands, "capabilities.plot.preCommands"],
    [plotSection.beforeCommands, "capabilities.plot.beforeCommands"],
    [plotSection.postCommands, "capabilities.plot.postCommands"],
    [plotSection.afterCommands, "capabilities.plot.afterCommands"],
    [plotSection.postPlotCommands, "capabilities.plot.postPlotCommands"],
    [graphSection.preCommands, "capabilities.graph.preCommands"],
    [graphSection.beforeCommands, "capabilities.graph.beforeCommands"],
    [graphSection.postCommands, "capabilities.graph.postCommands"],
    [graphSection.afterCommands, "capabilities.graph.afterCommands"],
    [styleSection.commands, "capabilities.style.commands"],
    [styleSection.postCommands, "capabilities.style.postCommands"],
    [axisSection.commands, "capabilities.axis.commands"],
    [axisSection.postCommands, "capabilities.axis.postCommands"],
    [commandsSection.preCommands, "capabilities.commands.preCommands"],
    [commandsSection.beforeCommands, "capabilities.commands.beforeCommands"],
    [commandsSection.postCommands, "capabilities.commands.postCommands"],
    [commandsSection.afterCommands, "capabilities.commands.afterCommands"],
  ] as const) {
    assertOriginCapabilitiesCommandList(value, fieldPath);
  }
}

function normalizeOriginCapabilitiesPayload(rawCapabilities: unknown): Record<string, unknown> | null {
  if (rawCapabilities != null) {
    validateOriginCapabilitiesPayload(rawCapabilities);
  }

  const raw =
    rawCapabilities && typeof rawCapabilities === "object" && !Array.isArray(rawCapabilities)
      ? rawCapabilities as Record<string, unknown>
      : null;
  if (!raw) return null;

  const pickSection = (sectionValue: unknown): Record<string, unknown> =>
    sectionValue && typeof sectionValue === "object"
      ? sectionValue as Record<string, unknown>
      : {};
  const importSection = pickSection(raw.import);
  const plotSection = pickSection(raw.plot);
  const graphSection = pickSection(raw.graph);
  const styleSection = pickSection(raw.style);
  const axisSection = pickSection(raw.axis);
  const commandsSection = pickSection(raw.commands);

  const importWorkbookLongName = normalizeNonEmptyString(
    importSection.workbookLongName ?? importSection.longName,
    "",
  );
  const importColumnLabelsRaw = pickSection(importSection.columnLabels);
  const normalizeStringList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter(item => typeof item === "string").map(item => item.trim())
      : [];
  const importColumnLongNames = normalizeStringList(importColumnLabelsRaw.longNames);
  const importColumnUnits = normalizeStringList(importColumnLabelsRaw.units);
  const importColumnComments = normalizeStringList(importColumnLabelsRaw.comments);
  const importColumnDesignations = normalizeStringList(importColumnLabelsRaw.designations);
  const importPreCommands = normalizeOriginCommandList(
    importSection.preCommands ?? importSection.beforeCommands,
  );
  const importPostCommands = normalizeOriginCommandList(
    importSection.postCommands ?? importSection.afterCommands,
  );

  const plotCommand = normalizeNonEmptyString(
    plotSection.command ?? plotSection.plotCommand,
    "",
  );
  const plotPreCommands = normalizeOriginCommandList(
    plotSection.preCommands ?? plotSection.beforeCommands,
  );
  const plotPostCommands = normalizeOriginCommandList(
    plotSection.postCommands ?? plotSection.afterCommands ?? plotSection.postPlotCommands,
  );
  const graphPreCommands = normalizeOriginCommandList(
    graphSection.preCommands ?? graphSection.beforeCommands,
  );
  const graphPostCommands = normalizeOriginCommandList(
    graphSection.postCommands ?? graphSection.afterCommands,
  );
  const styleCommands = normalizeOriginCommandList(
    styleSection.commands ?? styleSection.postCommands,
  );
  const axisCommands = normalizeOriginCommandList(
    axisSection.commands ?? axisSection.postCommands,
  );

  const normalizeAxisLimitShape = (value: unknown): Record<string, unknown> | null => {
    const source = pickSection(value);
    const from = typeof source.from === "number" && Number.isFinite(source.from) ? source.from : undefined;
    const to = typeof source.to === "number" && Number.isFinite(source.to) ? source.to : undefined;
    const step = typeof source.step === "number" && Number.isFinite(source.step) ? source.step : undefined;
    const scale = normalizeNonEmptyString(source.scale, "");
    if (from === undefined && to === undefined && step === undefined && !scale) {
      return null;
    }
    const normalizedAxis: Record<string, unknown> = {};
    if (from !== undefined) normalizedAxis.from = from;
    if (to !== undefined) normalizedAxis.to = to;
    if (step !== undefined) normalizedAxis.step = step;
    if (scale) normalizedAxis.scale = scale;
    return normalizedAxis;
  };

  const axisLimitsRaw = pickSection(axisSection.limits);
  const axisLimitsNormalized = {
    x: normalizeAxisLimitShape(axisLimitsRaw.x),
    y: normalizeAxisLimitShape(axisLimitsRaw.y),
  };
  const globalPreCommands = normalizeOriginCommandList(
    raw.preCommands ?? commandsSection.preCommands ?? commandsSection.beforeCommands,
  );
  const globalPostCommands = normalizeOriginCommandList(
    raw.postCommands ?? commandsSection.postCommands ?? commandsSection.afterCommands,
  );

  const normalized: Record<string, Record<string, unknown>> = {};
  if (
    importWorkbookLongName ||
    importColumnLongNames.length ||
    importColumnUnits.length ||
    importColumnComments.length ||
    importColumnDesignations.length ||
    importPreCommands.length ||
    importPostCommands.length
  ) {
    normalized.import = {};
    if (importWorkbookLongName) normalized.import.workbookLongName = importWorkbookLongName;
    if (importColumnLongNames.length || importColumnUnits.length || importColumnComments.length || importColumnDesignations.length) {
      normalized.import.columnLabels = {};
      const columnLabels = normalized.import.columnLabels as Record<string, unknown>;
      if (importColumnLongNames.length) columnLabels.longNames = importColumnLongNames;
      if (importColumnUnits.length) columnLabels.units = importColumnUnits;
      if (importColumnComments.length) columnLabels.comments = importColumnComments;
      if (importColumnDesignations.length) columnLabels.designations = importColumnDesignations;
    }
    if (importPreCommands.length) normalized.import.preCommands = importPreCommands;
    if (importPostCommands.length) normalized.import.postCommands = importPostCommands;
  }
  if (plotCommand || plotPreCommands.length || plotPostCommands.length) {
    normalized.plot = {};
    if (plotCommand) normalized.plot.command = plotCommand;
    if (plotPreCommands.length) normalized.plot.preCommands = plotPreCommands;
    if (plotPostCommands.length) normalized.plot.postCommands = plotPostCommands;
  }
  if (graphPreCommands.length || graphPostCommands.length) {
    normalized.graph = {};
    if (graphPreCommands.length) normalized.graph.preCommands = graphPreCommands;
    if (graphPostCommands.length) normalized.graph.postCommands = graphPostCommands;
  }
  if (styleCommands.length) {
    normalized.style = { commands: styleCommands };
  }
  if (axisCommands.length || axisLimitsNormalized.x || axisLimitsNormalized.y) {
    normalized.axis = { commands: axisCommands };
    if (axisLimitsNormalized.x || axisLimitsNormalized.y) {
      normalized.axis.limits = {};
      const limits = normalized.axis.limits as Record<string, unknown>;
      if (axisLimitsNormalized.x) limits.x = axisLimitsNormalized.x;
      if (axisLimitsNormalized.y) limits.y = axisLimitsNormalized.y;
    }
  }
  if (globalPreCommands.length || globalPostCommands.length) {
    normalized.commands = {};
    if (globalPreCommands.length) normalized.commands.preCommands = globalPreCommands;
    if (globalPostCommands.length) normalized.commands.postCommands = globalPostCommands;
  }

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeOriginCsvPayload(
  payload: unknown,
  plotDefaults: OriginPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
): Record<string, unknown> {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const csv = raw.csv && typeof raw.csv === "object" ? raw.csv as Record<string, unknown> : {};
  const workbook =
    raw.workbook && typeof raw.workbook === "object" ? raw.workbook as Record<string, unknown> : {};
  const sheet = raw.sheet && typeof raw.sheet === "object" ? raw.sheet as Record<string, unknown> : {};
  const plot = raw.plot && typeof raw.plot === "object" ? raw.plot as Record<string, unknown> : {};
  const capabilities = normalizeOriginCapabilitiesPayload(
    raw.capabilities ?? raw.originCapabilities,
  );

  const normalizedPlot = normalizeOriginPlotOptions(
    {
      plotCommand: plot.command ?? plot.plotCommand ?? raw.plotCommand,
      plotType: plot.type ?? plot.plotType ?? raw.plotType,
      postPlotCommands: plot.postCommands ?? plot.postPlotCommands ?? raw.postPlotCommands,
      lineWidth: plot.lineWidth ?? plot.linewidth ?? plot.line_width ?? raw.lineWidth ?? raw.linewidth ?? raw.line_width,
      xyPairs: plot.xyPairs ?? raw.xyPairs,
    },
    plotDefaults,
  );
  const rawPlotCommand = plot.command ?? plot.plotCommand ?? raw.plotCommand;
  if (typeof rawPlotCommand === "string" && rawPlotCommand.trim()) {
    normalizedPlot.plotCommand = rawPlotCommand.trim();
  }

  return {
    csvName: normalizeNonEmptyString(raw.csvName ?? csv.name, "origin.csv"),
    csvPath: normalizeOriginExePath(raw.csvPath ?? csv.path),
    csvText:
      typeof raw.csvText === "string"
        ? raw.csvText
        : typeof csv.text === "string"
          ? csv.text
          : "",
    importMode: normalizeNonEmptyString(raw.importMode, "new-book"),
    workbookKey: normalizeNonEmptyString(raw.workbookKey ?? workbook.key, ""),
    workbookName: normalizeNonEmptyString(
      raw.workbookName ?? workbook.longName ?? raw.seriesName ?? sheet.longName,
      "",
    ),
    sheetName: normalizeNonEmptyString(raw.sheetName ?? sheet.longName ?? sheet.name, ""),
    sheetShortName: normalizeNonEmptyString(raw.sheetShortName ?? sheet.name, ""),
    capabilities,
    skipPlot: plot.skip === true || plot.skipPlot === true || raw.skipPlot === true,
    ...normalizedPlot,
  };
}

function normalizeOriginCsvBatchPayload(
  payload: unknown,
  plotDefaults: OriginPlotOptions,
): Record<string, unknown>[] {
  const jobs = getPayloadProperty(payload, "jobs");
  if (!Array.isArray(jobs) || !jobs.length) return [];
  return jobs.map(job => normalizeOriginCsvPayload(job, plotDefaults));
}

export function registerOriginMainHandlers({
  conductorStore,
  dialog,
  ipcChannels,
  ipcMain,
  isWindows,
  logDetectionResult,
  originCsvScriptPath,
  originCsvWorkerPath,
  runtimeRootDir,
}: RegisterOriginMainHandlersOptions): OriginMainHandlers {
  let originDetectionCache: { createdAt: number; result: OriginDetectionResult } | null = null;
  let originDetectionPromise: Promise<OriginDetectionResult> | null = null;

  const getOriginExePathFromSettings = (): string | null => {
    const settings = conductorStore.getConductorSettings();
    return normalizeOriginExePath(settings?.originExePath);
  };

  const saveOriginExePathToSettings = (originExePath: unknown): string | null => {
    originDetectionCache = null;
    originDetectionPromise = null;
    const normalizedPath = normalizeOriginExePath(originExePath);
    const settings = conductorStore.patchConductorSettings({
      originExePath: normalizedPath,
    });
    return typeof settings.originExePath === "string" ? settings.originExePath : null;
  };

  const getOriginRuntimeCleanupPolicyFromSettings = (): Record<string, unknown> => {
    const settings = conductorStore.getConductorSettings();
    return {
      enabled: Boolean(settings?.originRuntimeCleanupEnabled),
      keepSuccessJobs: Number(settings?.originRuntimeKeepSuccessJobs),
      failedRetentionDays: Number(settings?.originRuntimeFailedRetentionDays),
    };
  };

  const getOriginPlotOptionsFromSettings = (): OriginPlotOptions => {
    const settings = conductorStore.getConductorSettings();
    return normalizeOriginPlotOptions({
      plotCommand: settings?.originPlotCommandDefault,
      plotType: settings?.originPlotTypeDefault,
      postPlotCommands: settings?.originPlotPostCommandsDefault,
      lineWidth: settings?.originPlotLineWidthDefault,
      xyPairs: settings?.originPlotXyPairsDefault,
    });
  };

  const detectOriginExecutablePathCached = async (): Promise<OriginDetectionResult> => {
    const now = Date.now();
    if (
      originDetectionCache &&
      now - originDetectionCache.createdAt < ORIGIN_DETECTION_CACHE_TTL_MS
    ) {
      return originDetectionCache.result;
    }

    if (!originDetectionPromise) {
      originDetectionPromise = Promise.resolve()
        .then(async () => {
          const result = await detectOriginExecutablePathDetailed();
          originDetectionCache = {
            createdAt: Date.now(),
            result,
          };
          return result;
        })
        .finally(() => {
          originDetectionPromise = null;
        });
    }

    return originDetectionPromise;
  };

  const runRuntimeCleanup = async ({
    force = false,
    clearAll = false,
  }: { clearAll?: boolean; force?: boolean } = {}): Promise<unknown> =>
    runOriginRuntimeCleanup({
      runtimeRootDir: runtimeRootDir(),
      policy: getOriginRuntimeCleanupPolicyFromSettings(),
      force,
      clearAll,
    });

  const handleOriginExeGet = async (): Promise<string | null> => {
    const configured = getOriginExePathFromSettings();
    if (configured) {
      try {
        return assertOriginExePath(configured);
      } catch {
        // Fall through to auto detection.
      }
    }

    const detectResult = await detectOriginExecutablePathCached();
    logDetectionResult?.("originExeGet", detectResult);
    if (detectResult.path) {
      return saveOriginExePathToSettings(detectResult.path);
    }

    return null;
  };

  const handleOriginExeSet = (_event: IpcMainInvokeEvent, payload: unknown): string | null => {
    const rawPath = getPayloadProperty(payload, "path") ?? payload;
    const validated = assertOriginExePath(rawPath);
    return saveOriginExePathToSettings(validated);
  };

  const handleOriginExePick = async (event: IpcMainInvokeEvent): Promise<string | null> => {
    if (!isWindows) return null;

    const win = BrowserWindow.fromWebContents(event.sender) ?? null;
    const pickedPath = await pickOriginExecutable({
      dialog,
      ownerWindow: win,
      defaultPath: getOriginExePathFromSettings(),
    });

    if (!pickedPath) return null;
    return saveOriginExePathToSettings(pickedPath);
  };

  const resolveOriginExePath = async (event: IpcMainInvokeEvent): Promise<string | null> => {
    const configured = getOriginExePathFromSettings();
    if (configured) {
      try {
        return assertOriginExePath(configured);
      } catch {
        // Fall through to auto detection + picker.
      }
    }

    const detectResult = await detectOriginExecutablePathCached();
    logDetectionResult?.("resolveOriginExePath", detectResult);
    if (detectResult.path) {
      return saveOriginExePathToSettings(detectResult.path);
    }

    return handleOriginExePick(event);
  };

  const resolveOriginExePathForHealthCheck = async (
    event: IpcMainInvokeEvent,
    payload: unknown,
  ): Promise<string> => {
    const rawPath = getPayloadProperty(payload, "path") ?? payload;
    if (typeof rawPath === "string" && rawPath.trim()) {
      const validated = assertOriginExePath(rawPath);
      return saveOriginExePathToSettings(validated) ?? validated;
    }

    const configured = await handleOriginExeGet();
    if (configured) {
      return configured;
    }

    const allowPick = Boolean(getPayloadProperty(payload, "allowPick"));
    if (allowPick) {
      const picked = await resolveOriginExePath(event);
      if (picked) return picked;
    }

    throw new Error("__ORIGIN_EXE_REQUIRED__");
  };

  const handleOriginHealthCheck = async (
    event: IpcMainInvokeEvent,
    payload: unknown,
  ): Promise<unknown> => {
    if (!isWindows) {
      throw new Error("Origin integration is only available on Windows desktop.");
    }

    const originExePath = await resolveOriginExePathForHealthCheck(event, payload);
    try {
      return await runOriginHealthCheck({
        originExePath,
        workerScriptPath: originCsvScriptPath,
        workerExecutablePath: originCsvWorkerPath,
        runtimeRootDir: runtimeRootDir(),
      });
    } finally {
      try {
        await runRuntimeCleanup();
      } catch (cleanupError) {
        console.warn("[origin-cleanup] Health check cleanup failed:", cleanupError);
      }
    }
  };

  const handleOriginRunCsv = async (
    event: IpcMainInvokeEvent,
    payload: unknown,
  ): Promise<unknown> => {
    if (!isWindows) {
      throw new Error("Origin integration is only available on Windows desktop.");
    }

    const plotDefaults = getOriginPlotOptionsFromSettings();
    const normalizedBatchJobs = normalizeOriginCsvBatchPayload(payload, plotDefaults);
    const normalizedPayload = normalizedBatchJobs.length
      ? null
      : normalizeOriginCsvPayload(payload, plotDefaults);
    const originExePath = await resolveOriginExePath(event);
    if (!originExePath) {
      throw new Error("__ORIGIN_EXE_REQUIRED__");
    }

    try {
      if (normalizedBatchJobs.length) {
        return await runOriginCsvBatchJob({
          jobs: normalizedBatchJobs,
          originExePath,
          workerScriptPath: originCsvScriptPath,
          workerExecutablePath: originCsvWorkerPath,
          runtimeRootDir: runtimeRootDir(),
        });
      }

      const csvPath = normalizeOriginExePath(normalizedPayload?.csvPath);
      const csvText = typeof normalizedPayload?.csvText === "string" ? normalizedPayload.csvText : "";
      if (!csvPath && !csvText.trim()) {
        throw new Error("CSV payload is missing.");
      }

      return await runOriginCsvJob({
        csvName: normalizedPayload?.csvName,
        csvPath,
        csvText,
        importMode: typeof normalizedPayload?.importMode === "string" ? normalizedPayload.importMode : "new-book",
        workbookKey: normalizedPayload?.workbookKey as string | undefined,
        workbookName: normalizedPayload?.workbookName as string | undefined,
        sheetName: normalizedPayload?.sheetName as string | undefined,
        sheetShortName: normalizedPayload?.sheetShortName as string | undefined,
        plotType: normalizedPayload?.plotType,
        xyPairs: normalizedPayload?.xyPairs,
        plotCommand: normalizedPayload?.plotCommand,
        postPlotCommands: normalizedPayload?.postPlotCommands,
        lineWidth: normalizedPayload?.lineWidth,
        capabilities: normalizedPayload?.capabilities,
        originExePath,
        workerScriptPath: originCsvScriptPath,
        workerExecutablePath: originCsvWorkerPath,
        runtimeRootDir: runtimeRootDir(),
      });
    } finally {
      try {
        await runRuntimeCleanup();
      } catch (cleanupError) {
        console.warn("[origin-cleanup] CSV cleanup failed:", cleanupError);
      }
    }
  };

  const handleOriginRuntimeCleanupRun = async (): Promise<unknown> => {
    if (!isWindows) {
      throw new Error("Origin integration is only available on Windows desktop.");
    }

    return runRuntimeCleanup({ force: true, clearAll: true });
  };

  ipcMain.handle(ipcChannels.originExeGet, handleOriginExeGet);
  ipcMain.handle(ipcChannels.originExeSet, handleOriginExeSet);
  ipcMain.handle(ipcChannels.originExePick, handleOriginExePick);
  ipcMain.handle(ipcChannels.originHealthCheck, handleOriginHealthCheck);
  ipcMain.handle(ipcChannels.originRunCsv, handleOriginRunCsv);
  ipcMain.handle(ipcChannels.originRuntimeCleanupRun, handleOriginRuntimeCleanupRun);

  return {
    dispose(): void {
      ipcMain.removeHandler(ipcChannels.originExeGet);
      ipcMain.removeHandler(ipcChannels.originExeSet);
      ipcMain.removeHandler(ipcChannels.originExePick);
      ipcMain.removeHandler(ipcChannels.originHealthCheck);
      ipcMain.removeHandler(ipcChannels.originRunCsv);
      ipcMain.removeHandler(ipcChannels.originRuntimeCleanupRun);
    },
    runRuntimeCleanup,
  };
}
