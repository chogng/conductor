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
import type { IOriginMainService } from "./originMainService.js";

type OriginIpcChannels = {
  readonly originExeGet: string;
  readonly originExeSet: string;
  readonly originExePick: string;
  readonly originHealthCheck: string;
  readonly originRunCsv: string;
  readonly originRuntimeCleanupRun: string;
};

export type OriginMainHandlers = IDisposable & {
  runRuntimeCleanup(options?: { clearAll?: boolean; force?: boolean }): Promise<unknown>;
};

export type RegisterOriginMainHandlersOptions = {
  readonly dialog: Dialog;
  readonly ipcChannels: OriginIpcChannels;
  readonly ipcMain: IpcMain;
  readonly isWindows: boolean;
  readonly logDetectionResult?: (context: string, result: OriginDetectionResult) => void;
  readonly originMainService: IOriginMainService;
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

function assertOriginCapabilitiesBoolean(value: unknown, fieldPath: string): void {
  if (value == null) return;
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Origin capabilities at '${fieldPath}': expected boolean.`);
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
    ["legend", "advancedCommands", "commands", "postCommands"],
    "capabilities.style",
  );
  const styleLegend = assertOriginCapabilitiesAllowedKeys(
    styleSection.legend,
    ["fontSize"],
    "capabilities.style.legend",
  );
  const axisSection = assertOriginCapabilitiesAllowedKeys(
    root.axis,
    [
      "appearance",
      "range",
      "scale",
      "title",
      "spacing",
      "frame",
      "advancedCommands",
      "commands",
      "postCommands",
      "limits",
    ],
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
  const axisRange = assertOriginCapabilitiesAllowedKeys(
    axisSection.range,
    ["x", "y"],
    "capabilities.axis.range",
  );
  const axisScale = assertOriginCapabilitiesAllowedKeys(
    axisSection.scale,
    ["x", "y"],
    "capabilities.axis.scale",
  );
  const axisTitle = assertOriginCapabilitiesAllowedKeys(
    axisSection.title,
    ["x", "y"],
    "capabilities.axis.title",
  );
  const axisSpacing = assertOriginCapabilitiesAllowedKeys(
    axisSection.spacing,
    ["tickLabelOffset", "axisTitleGap"],
    "capabilities.axis.spacing",
  );
  const axisFrame = assertOriginCapabilitiesAllowedKeys(
    axisSection.frame,
    ["xOpposite", "yOpposite"],
    "capabilities.axis.frame",
  );
  const axisAppearance = assertOriginCapabilitiesAllowedKeys(
    axisSection.appearance,
    ["x", "y"],
    "capabilities.axis.appearance",
  );
  const axisAppearanceX = assertOriginCapabilitiesAllowedKeys(
    axisAppearance.x,
    ["showGrid", "showMajorTicks", "showMinorTicks"],
    "capabilities.axis.appearance.x",
  );
  const axisAppearanceY = assertOriginCapabilitiesAllowedKeys(
    axisAppearance.y,
    ["showGrid", "showMajorTicks", "showMinorTicks"],
    "capabilities.axis.appearance.y",
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
  const axisXRange = assertOriginCapabilitiesAllowedKeys(
    axisRange.x,
    ["from", "to", "step"],
    "capabilities.axis.range.x",
  );
  const axisYRange = assertOriginCapabilitiesAllowedKeys(
    axisRange.y,
    ["from", "to", "step"],
    "capabilities.axis.range.y",
  );
  const axisXScale = assertOriginCapabilitiesAllowedKeys(
    axisScale.x,
    ["mode"],
    "capabilities.axis.scale.x",
  );
  const axisYScale = assertOriginCapabilitiesAllowedKeys(
    axisScale.y,
    ["mode"],
    "capabilities.axis.scale.y",
  );
  const axisXTitle = assertOriginCapabilitiesAllowedKeys(
    axisTitle.x,
    ["text", "fontSize"],
    "capabilities.axis.title.x",
  );
  const axisYTitle = assertOriginCapabilitiesAllowedKeys(
    axisTitle.y,
    ["text", "fontSize"],
    "capabilities.axis.title.y",
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
  for (const [range, fieldPath] of [
    [axisXRange, "capabilities.axis.range.x"],
    [axisYRange, "capabilities.axis.range.y"],
  ] as const) {
    assertOriginCapabilitiesNumber(range.from, `${fieldPath}.from`);
    assertOriginCapabilitiesNumber(range.to, `${fieldPath}.to`);
    assertOriginCapabilitiesNumber(range.step, `${fieldPath}.step`);
  }
  assertOriginCapabilitiesString(axisXScale.mode, "capabilities.axis.scale.x.mode");
  assertOriginCapabilitiesString(axisYScale.mode, "capabilities.axis.scale.y.mode");
  assertOriginCapabilitiesString(axisXTitle.text, "capabilities.axis.title.x.text");
  assertOriginCapabilitiesNumber(axisXTitle.fontSize, "capabilities.axis.title.x.fontSize");
  assertOriginCapabilitiesString(axisYTitle.text, "capabilities.axis.title.y.text");
  assertOriginCapabilitiesNumber(axisYTitle.fontSize, "capabilities.axis.title.y.fontSize");
  assertOriginCapabilitiesNumber(styleLegend.fontSize, "capabilities.style.legend.fontSize");
  assertOriginCapabilitiesNumber(axisSpacing.tickLabelOffset, "capabilities.axis.spacing.tickLabelOffset");
  assertOriginCapabilitiesNumber(axisSpacing.axisTitleGap, "capabilities.axis.spacing.axisTitleGap");
  assertOriginCapabilitiesBoolean(axisFrame.xOpposite, "capabilities.axis.frame.xOpposite");
  assertOriginCapabilitiesBoolean(axisFrame.yOpposite, "capabilities.axis.frame.yOpposite");
  for (const [appearance, fieldPath] of [
    [axisAppearanceX, "capabilities.axis.appearance.x"],
    [axisAppearanceY, "capabilities.axis.appearance.y"],
  ] as const) {
    assertOriginCapabilitiesBoolean(appearance.showGrid, `${fieldPath}.showGrid`);
    assertOriginCapabilitiesBoolean(appearance.showMajorTicks, `${fieldPath}.showMajorTicks`);
    assertOriginCapabilitiesBoolean(appearance.showMinorTicks, `${fieldPath}.showMinorTicks`);
  }

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
    [styleSection.advancedCommands, "capabilities.style.advancedCommands"],
    [styleSection.commands, "capabilities.style.commands"],
    [styleSection.postCommands, "capabilities.style.postCommands"],
    [axisSection.advancedCommands, "capabilities.axis.advancedCommands"],
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
  const styleAdvancedCommands = normalizeOriginCommandList(
    styleSection.advancedCommands ?? styleSection.commands ?? styleSection.postCommands,
  );
  const axisAdvancedCommands = normalizeOriginCommandList(
    axisSection.advancedCommands ?? axisSection.commands ?? axisSection.postCommands,
  );
  const normalizeAxisSideRecord = (
    value: unknown,
    keys: readonly string[],
    valuePredicate: (value: unknown, key: string) => unknown,
  ): Record<string, Record<string, unknown>> => {
    const source = pickSection(value);
    const next: Record<string, Record<string, unknown>> = {};
    for (const axisName of ["x", "y"] as const) {
      const axisSource = pickSection(source[axisName]);
      const axisNext: Record<string, unknown> = {};
      for (const key of keys) {
        const normalizedValue = valuePredicate(axisSource[key], key);
        if (normalizedValue !== undefined) {
          axisNext[key] = normalizedValue;
        }
      }
      if (Object.keys(axisNext).length) {
        next[axisName] = axisNext;
      }
    }
    return next;
  };
  const axisAppearanceRaw = pickSection(axisSection.appearance);
  const axisAppearanceNormalized = normalizeAxisSideRecord(
    axisAppearanceRaw,
    ["showGrid", "showMajorTicks", "showMinorTicks"],
    value => typeof value === "boolean" ? value : undefined,
  );
  const axisRangeNormalized = normalizeAxisSideRecord(
    axisSection.range,
    ["from", "to", "step"],
    value => typeof value === "number" && Number.isFinite(value) ? value : undefined,
  );
  const axisScaleNormalized = normalizeAxisSideRecord(
    axisSection.scale,
    ["mode"],
    value => typeof value === "string" && value.trim() ? value.trim() : undefined,
  );
  const axisTitleNormalized = normalizeAxisSideRecord(
    axisSection.title,
    ["text", "fontSize"],
    (value, key) => {
      if (key === "text") {
        return typeof value === "string" && value.trim() ? value.trim() : undefined;
      }
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    },
  );
  const axisSpacingSource = pickSection(axisSection.spacing);
  const axisSpacingNormalized: Record<string, number> = {};
  for (const key of ["tickLabelOffset", "axisTitleGap"] as const) {
    const value = axisSpacingSource[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      axisSpacingNormalized[key] = value;
    }
  }
  const axisFrameSource = pickSection(axisSection.frame);
  const axisFrameNormalized: Record<string, boolean> = {};
  for (const key of ["xOpposite", "yOpposite"] as const) {
    const value = axisFrameSource[key];
    if (typeof value === "boolean") {
      axisFrameNormalized[key] = value;
    }
  }
  const styleLegendSource = pickSection(styleSection.legend);
  const styleLegendNormalized: Record<string, number> = {};
  const legendFontSize = styleLegendSource.fontSize;
  if (typeof legendFontSize === "number" && Number.isFinite(legendFontSize)) {
    styleLegendNormalized.fontSize = legendFontSize;
  }

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
  for (const axisName of ["x", "y"] as const) {
    const legacyAxis = normalizeAxisLimitShape(axisLimitsRaw[axisName]);
    if (!legacyAxis) {
      continue;
    }
    const { scale, ...range } = legacyAxis;
    if (Object.keys(range).length && !axisRangeNormalized[axisName]) {
      axisRangeNormalized[axisName] = range;
    }
    if (typeof scale === "string" && scale && !axisScaleNormalized[axisName]) {
      axisScaleNormalized[axisName] = { mode: scale };
    }
  }
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
  if (styleAdvancedCommands.length || Object.keys(styleLegendNormalized).length) {
    normalized.style = {};
    if (Object.keys(styleLegendNormalized).length) {
      normalized.style.legend = styleLegendNormalized;
    }
    if (styleAdvancedCommands.length) {
      normalized.style.advancedCommands = styleAdvancedCommands;
    }
  }
  if (
    axisAdvancedCommands.length ||
    Object.keys(axisAppearanceNormalized).length ||
    Object.keys(axisRangeNormalized).length ||
    Object.keys(axisScaleNormalized).length ||
    Object.keys(axisTitleNormalized).length ||
    Object.keys(axisSpacingNormalized).length ||
    Object.keys(axisFrameNormalized).length
  ) {
    normalized.axis = {};
    if (axisAdvancedCommands.length) {
      normalized.axis.advancedCommands = axisAdvancedCommands;
    }
    if (Object.keys(axisAppearanceNormalized).length) {
      normalized.axis.appearance = axisAppearanceNormalized;
    }
    if (Object.keys(axisRangeNormalized).length) {
      normalized.axis.range = axisRangeNormalized;
    }
    if (Object.keys(axisScaleNormalized).length) {
      normalized.axis.scale = axisScaleNormalized;
    }
    if (Object.keys(axisTitleNormalized).length) {
      normalized.axis.title = axisTitleNormalized;
    }
    if (Object.keys(axisSpacingNormalized).length) {
      normalized.axis.spacing = axisSpacingNormalized;
    }
    if (Object.keys(axisFrameNormalized).length) {
      normalized.axis.frame = axisFrameNormalized;
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
      symbolShape: plot.symbolShape ?? plot.symbol ?? plot.symbol_shape ?? raw.symbolShape ?? raw.symbol ?? raw.symbol_shape,
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
  dialog,
  ipcChannels,
  ipcMain,
  isWindows,
  logDetectionResult,
  originMainService,
  originCsvScriptPath,
  originCsvWorkerPath,
  runtimeRootDir,
}: RegisterOriginMainHandlersOptions): OriginMainHandlers {
  let originDetectionCache: { createdAt: number; result: OriginDetectionResult } | null = null;
  let originDetectionPromise: Promise<OriginDetectionResult> | null = null;

  const getOriginExePathFromSettings = (): string | null => {
    return originMainService.getOriginExePath();
  };

  const saveOriginExePathToSettings = async (originExePath: unknown): Promise<string | null> => {
    originDetectionCache = null;
    originDetectionPromise = null;
    const normalizedPath = normalizeOriginExePath(originExePath);
    return originMainService.setOriginExePath(normalizedPath);
  };

  const getOriginRuntimeCleanupPolicyFromSettings = (): Record<string, unknown> => {
    return originMainService.getRuntimeCleanupPolicy();
  };

  const getOriginPlotOptionsFromSettings = (): OriginPlotOptions => {
    return originMainService.getPlotOptions();
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

  const handleOriginExeSet = async (_event: IpcMainInvokeEvent, payload: unknown): Promise<string | null> => {
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
      return (await saveOriginExePathToSettings(validated)) ?? validated;
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
        symbolShape: normalizedPayload?.symbolShape,
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
