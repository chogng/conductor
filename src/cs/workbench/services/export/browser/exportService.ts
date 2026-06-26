/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { localize } from "src/cs/nls";
import {
  createExportProcessedFilesFromSession,
} from "src/cs/workbench/services/export/browser/csvExport";
import {
  createOriginCurveOptions,
  createOriginCurveOptionsFromRecord,
} from "src/cs/workbench/services/export/common/exportModel";
import {
  runExportOriginZip,
  runOpenInOrigin,
} from "src/cs/workbench/services/export/browser/originExportService";
import {
  IExportService,
  type ExportState,
  type ExportViewState,
  type ExportViewStateInput,
  type OriginCanvasExportScope,
  type OriginCurveExportMode,
  type OriginExportAxisSettings,
  type OriginExportPlanInput,
  type OriginExportScopeModel,
  type OriginFilteredCanvasKind,
} from "src/cs/workbench/services/export/common/export";
import {
  buildOriginExportPlan,
  isOriginExportMode,
  type OriginExportContentKey,
  type OriginExportMode,
  type OriginExportPlan,
  type OriginYAxisScaleMode,
} from "src/cs/workbench/services/export/common/originExport";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
import { getFileRecordAxisProjection } from "src/cs/workbench/services/session/common/sessionRecordProjection";
import type {
  ProcessedEntry,
  ProcessedSeries,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  getXUnitMeta,
  getYUnitMeta,
} from "src/cs/workbench/services/plot/common/units";
import {
  ISessionService,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  getOriginOpenPlotOptions,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";
import { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";

type OriginExportFile = {
  readonly calculationCache?: unknown;
  readonly curveType?: string;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly series?: ProcessedEntry["series"];
  readonly xAxisRole?: string;
  readonly xGroups?: ProcessedEntry["xGroups"];
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly yLabel?: string;
  readonly yUnit?: string;
  readonly [key: string]: unknown;
};

type OriginExportSeries = NonNullable<OriginExportFile["series"]>[number];

export class BrowserExportService extends Disposable implements IExportService {
  public declare readonly _serviceBrand: undefined;

  private readonly originBusyRef = { current: false };
  private readonly onDidChangeExportStateEmitter = this._register(new Emitter<ExportState>());
  public readonly onDidChangeExportState = this.onDidChangeExportStateEmitter.event;
  private readonly onDidChangeExportViewStateEmitter = this._register(new Emitter<ExportViewState>());
  public readonly onDidChangeExportViewState = this.onDidChangeExportViewStateEmitter.event;
  private currentOriginExportPlanInput: OriginExportPlanInput | null = null;

  private state: ExportState = {
    originMode: "merged",
    canvasScope: "current",
    filteredKind: "output",
    curveMode: "all",
    selectedCurveKeys: [],
    selectedContentKeys: ["iv"],
  };
  private viewState: ExportViewState = createDefaultExportViewState();

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
    @ISettingsService private readonly settingsService: ISettingsService,
    @IPlotService private readonly plotService: IPlotService,
    @INotificationService private readonly notificationService: INotificationService,
  ) {
    super();
  }

  getState(): ExportState {
    return this.state;
  }

  public getViewState(): ExportViewState {
    return this.projectExportViewState(this.viewState);
  }

  public updateViewState(input: ExportViewStateInput): ExportViewState {
    const planInput = this.createOriginExportPlanInput(input);
    this.currentOriginExportPlanInput = planInput;
    const curveOptions = input.activeFileRecord
      ? createOriginCurveOptionsFromRecord(
        input.activeFileRecord,
        (fileId, seriesId, fallback, index) =>
          this.resolveOriginSeriesLabel(input.snapshot, fileId, seriesId, fallback, index),
      )
      : input.activeFile
      ? createOriginCurveOptions(
        input.activeFile,
        (file, series, index) =>
          this.resolveProcessedSeriesLabel(input.snapshot, file, series, index),
      )
      : [];
    this.syncSelectedCurveKeys(curveOptions.map(option => option.key));
    const exportScope = this.createOriginExportScopeModel(planInput);
    const viewState: ExportViewState = {
      curveOptions,
      hasMixedExportYScales: exportScope.hasMixedYScales,
      scopedFileIds: [...exportScope.fileIds],
      showFilteredCanvasKindSelect: this.state.canvasScope === "filtered",
    };
    this.viewState = viewState;
    this.onDidChangeExportViewStateEmitter.fire(viewState);
    return viewState;
  }

  public createOriginExportScopeModel(input: OriginExportPlanInput): OriginExportScopeModel {
    const files = this.resolveOriginExportFiles(input);
    return {
      fileIds: files
        .map((file) => String(file?.fileId ?? "").trim())
        .filter(Boolean),
      hasMixedYScales: new Set(
        files.map((file) => this.resolveOriginYScaleForFile(input.axisSettings, file)),
      ).size > 1,
    };
  }

  public buildOriginExportPlan(input: OriginExportPlanInput): OriginExportPlan {
    const files = this.resolveOriginExportFiles(input);
    if (!files.length) {
      throw new Error(localize("origin.selection.canvasRequired", "Please select at least one thumbnail first."));
    }

    const plan = buildOriginExportPlan(
      files,
      this.createSelectedOriginSeriesIdsByFile(files),
      this.state.originMode,
      (file) => this.resolveOriginYScaleForFile(input.axisSettings, file),
      (file) => getXUnitMeta(this.resolveOriginXUnitForFile(input.axisSettings, file)).factor,
      (file) => getYUnitMeta(this.resolveOriginYUnitForFile(input.axisSettings, file)).factor,
      (file) => getYUnitMeta(this.resolveOriginYUnitForFile(input.axisSettings, file)).label,
      (file, series, index) =>
        this.resolveOriginCurveLabel(input, file as OriginExportFile, series, index),
      (file, axis) => this.resolveOriginAxisTitleForFile(input, file as OriginExportFile, axis),
      (file, y) =>
        this.resolveOriginYScaleForFile(input.axisSettings, file as OriginExportFile) === "log"
          ? Math.abs(y)
          : y,
      this.state.selectedContentKeys,
    );
    if (!plan.payloads.length) {
      throw new Error(localize("origin.selection.curveRequired", "Please select a curve first."));
    }
    return plan;
  }

  setOriginMode(mode: OriginExportMode): void {
    this.updateState({
      originMode: isOriginExportMode(mode) ? mode : "merged",
    });
  }

  readonly setCanvasScope = (
    value: OriginCanvasExportScope | ((previous: OriginCanvasExportScope) => OriginCanvasExportScope),
  ): void => {
    this.updateState({
      canvasScope: normalizeCanvasScope(resolveNext(value, this.state.canvasScope)),
    });
  };

  readonly setFilteredKind = (
    value: OriginFilteredCanvasKind | ((previous: OriginFilteredCanvasKind) => OriginFilteredCanvasKind),
  ): void => {
    this.updateState({
      filteredKind: normalizeFilteredKind(resolveNext(value, this.state.filteredKind)),
    });
  };

  setCurveMode(mode: OriginCurveExportMode): void {
    this.updateState({
      curveMode: mode === "select" ? "select" : "all",
    });
  }

  public setSelectedCurveKeys(curveKeys: readonly string[]): void {
    this.updateState({
      selectedCurveKeys: normalizeCurveKeys(curveKeys),
    });
  }

  public syncSelectedCurveKeys(availableCurveKeys: readonly string[]): void {
    const available = normalizeCurveKeys(availableCurveKeys);
    const availableSet = new Set(available);
    const selected = this.state.selectedCurveKeys.length > 0
      ? this.state.selectedCurveKeys.filter(key => availableSet.has(key))
      : available;
    this.updateState({
      selectedCurveKeys: selected,
    });
  }

  readonly setContentKeys = (
    value: readonly OriginExportContentKey[] | ((previous: readonly OriginExportContentKey[]) => readonly OriginExportContentKey[]),
  ): void => {
    this.updateState({
      selectedContentKeys: normalizeContentKeys(resolveNext(value, this.state.selectedContentKeys)),
    });
  };

  openInOrigin(): Promise<void> {
    return runOpenInOrigin({
      buildCsvExportRequest: buildCsvExportRequest,
      buildPayloads: () => this.buildOriginExportPlan(this.getCurrentOriginExportPlanInput()),
      originAxisSettings: this.settingsService.getConductorSettings()?.plotAxisSettings,
      originBusyRef: this.originBusyRef,
      originChartXRange: null,
      originChartYRange: null,
      notificationService: this.notificationService,
      originOpenPlotOptions: getOriginOpenPlotOptions(this.settingsService.getConductorSettings()),
    });
  }

  exportOriginZip(): Promise<void> {
    return runExportOriginZip({
      buildCsvExportRequest: buildCsvExportRequest,
      buildPayloads: () => this.buildOriginExportPlan(this.getCurrentOriginExportPlanInput()),
      notificationService: this.notificationService,
    });
  }

  private createOriginExportPlanInput(input: ExportViewStateInput): OriginExportPlanInput {
    return {
      activeFileId: input.activeFileId,
      axisSettings: this.getAxisSettings(input.snapshot),
      snapshot: input.snapshot,
    };
  }

  private getCurrentOriginExportPlanInput(): OriginExportPlanInput {
    if (this.currentOriginExportPlanInput) {
      return this.currentOriginExportPlanInput;
    }

    const snapshot = this.sessionService.getSnapshot();
    return {
      activeFileId: null,
      axisSettings: this.getAxisSettings(snapshot),
      snapshot,
    };
  }

  private getAxisSettings(snapshot: SessionSnapshot): OriginExportAxisSettings {
    return this.plotService.getFileAxisSettings(snapshot);
  }

  private resolveOriginExportFiles(input: OriginExportPlanInput): OriginExportFile[] {
    const processedFiles = createExportProcessedFilesFromSession(
      input.snapshot.filesById,
      input.snapshot.fileOrder,
    ).map((file) => this.createOriginExportFile(file));
    if (!processedFiles.length) {
      return [];
    }

    if (this.state.canvasScope === "all") {
      return processedFiles;
    }

    if (this.state.canvasScope === "filtered") {
      return processedFiles.filter((file) => this.isOriginFilteredCanvas(file));
    }

    const activeFileId = String(input.activeFileId ?? "").trim();
    const activeFile = activeFileId
      ? processedFiles.find((file) => String(file.fileId ?? "") === activeFileId)
      : null;
    return activeFile ? [activeFile] : [];
  }

  private createOriginExportFile(file: ProcessedEntry): OriginExportFile {
    const xAxisRole = String(file.xAxisRole ?? "").trim();
    return {
      ...file,
      curveType: file.curveType ? String(file.curveType) : undefined,
      xAxisRole: xAxisRole || undefined,
    };
  }

  private createSelectedOriginSeriesIdsByFile(
    files: readonly OriginExportFile[],
  ): Record<string, string[]> {
    if (this.state.curveMode !== "select") {
      return {};
    }

    const selectedByFile: Record<string, string[]> = {};
    const selectedCurveKeys = new Set(this.state.selectedCurveKeys);
    for (const file of files) {
      const fileId = String(file.fileId ?? "").trim();
      if (!fileId) {
        continue;
      }
      selectedByFile[fileId] = (Array.isArray(file.series) ? file.series : [])
        .map((series) => String(series.id ?? "").trim())
        .filter((seriesId) => Boolean(seriesId) && selectedCurveKeys.has(seriesId));
    }
    return selectedByFile;
  }

  private resolveOriginCurveLabel(
    input: OriginExportPlanInput,
    file: OriginExportFile | null | undefined,
    series: OriginExportSeries | null | undefined,
    index: number,
  ): string {
    const seriesId = String(series?.id ?? "");
    const fallback = this.resolveFallbackOriginCurveLabel(series, index);
    const fileId = String(file?.fileId ?? "");
    return this.resolveOriginSeriesLabel(input.snapshot, fileId, seriesId, fallback, index);
  }

  private resolveProcessedSeriesLabel(
    snapshot: SessionSnapshot,
    file: ProcessedEntry,
    series: ProcessedSeries,
    index: number,
  ): string {
    const fileId = String(file?.fileId ?? "");
    const seriesId = String(series?.id ?? "");
    const fallback = this.resolveFallbackOriginCurveLabel(series, index);
    return this.resolveOriginSeriesLabel(snapshot, fileId, seriesId, fallback, index);
  }

  private resolveOriginSeriesLabel(
    snapshot: SessionSnapshot,
    fileId: string,
    seriesId: string,
    fallback: string,
    index: number,
  ): string {
    const normalizedFileId = String(fileId ?? "").trim();
    const normalizedSeriesId = String(seriesId ?? "").trim();
    const plotLabel = normalizedFileId && normalizedSeriesId
      ? this.plotService.getLegendLabels(normalizedFileId)[normalizedSeriesId]
      : undefined;
    if (plotLabel) {
      return plotLabel;
    }

    const series = normalizedFileId && normalizedSeriesId
      ? snapshot.filesById[normalizedFileId]?.seriesById[normalizedSeriesId]
      : undefined;
    return String(
      series?.labelOverride ??
        series?.legendValue ??
        series?.name ??
        fallback ??
        `Series ${index + 1}`,
    );
  }

  private resolveFallbackOriginCurveLabel(
    series: OriginExportSeries | null | undefined,
    index: number,
  ): string {
    const legendValue = String(series?.legendValue ?? "").trim();
    if (legendValue) {
      return legendValue;
    }

    const name = String(series?.name ?? series?.label ?? "").trim();
    return name || `Series ${index + 1}`;
  }

  private resolveOriginXUnitForFile(
    axisSettings: OriginExportAxisSettings | undefined,
    file: OriginExportFile | null | undefined,
  ): string {
    const fileId = String(file?.fileId ?? "").trim();
    if (!fileId) {
      return String(file?.xUnit ?? "V");
    }

    return axisSettings?.xUnitByFileId?.[fileId] ?? String(file?.xUnit ?? "V");
  }

  private resolveOriginYUnitForFile(
    axisSettings: OriginExportAxisSettings | undefined,
    file: OriginExportFile | null | undefined,
  ): string {
    const fileId = String(file?.fileId ?? "").trim();
    if (!fileId) {
      return String(file?.yUnit ?? "A");
    }

    return axisSettings?.yUnitByFileId?.[fileId] ?? String(file?.yUnit ?? "A");
  }

  private resolveOriginYScaleForFile(
    axisSettings: OriginExportAxisSettings | undefined,
    file: OriginExportFile | null | undefined,
  ): OriginYAxisScaleMode {
    const fileId = String(file?.fileId ?? "").trim();
    if (!fileId) {
      return "linear";
    }

    return axisSettings?.yScaleByFileId?.[fileId] === "log" ? "log" : "linear";
  }

  private resolveOriginAxisTitleForFile(
    input: OriginExportPlanInput,
    file: OriginExportFile | null | undefined,
    axis: "x" | "y",
  ): string {
    const record = this.resolveOriginFileRecord(input, file);
    const axisProjection = record ? getFileRecordAxisProjection(record) : undefined;
    if (axis === "x") {
      return String(
        axisProjection?.xLabel ??
          file?.xLabel ??
          "",
      );
    }

    return String(
      axisProjection?.yLabel ??
        file?.yLabel ??
        "",
    );
  }

  private resolveOriginFileRecord(
    input: OriginExportPlanInput,
    file: OriginExportFile | null | undefined,
  ): FileRecord | undefined {
    const fileId = String(file?.fileId ?? "").trim();
    return fileId ? input.snapshot.filesById[fileId] : undefined;
  }

  private isOriginFilteredCanvas(file: OriginExportFile): boolean {
    const targetFamily = this.state.filteredKind;
    const xAxisRole = String(file.xAxisRole ?? "").trim().toLowerCase();
    if (targetFamily === "transfer" && xAxisRole === "vg") {
      return true;
    }
    if (targetFamily === "output" && xAxisRole === "vd") {
      return true;
    }

    const curveType = String(file.curveType ?? "").trim().toLowerCase();
    return Boolean(curveType && curveType.includes(targetFamily));
  }

  private updateState(updates: Partial<ExportState>): void {
    const nextState = {
      ...this.state,
      ...updates,
    };
    if (isSameExportState(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    this.onDidChangeExportStateEmitter.fire(nextState);
  }

  private projectExportViewState(viewState: ExportViewState): ExportViewState {
    const showFilteredCanvasKindSelect = this.state.canvasScope === "filtered";
    return viewState.showFilteredCanvasKindSelect === showFilteredCanvasKindSelect
      ? viewState
      : {
        ...viewState,
        showFilteredCanvasKindSelect,
      };
  }
}

const resolveNext = <T,>(value: T | ((previous: T) => T), previous: T): T =>
  typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;

const createDefaultExportViewState = (): ExportViewState => ({
  curveOptions: [],
  hasMixedExportYScales: false,
  scopedFileIds: [],
  showFilteredCanvasKindSelect: false,
});

const buildCsvExportRequest = (): null => null;

const normalizeCanvasScope = (scope: OriginCanvasExportScope): OriginCanvasExportScope =>
  scope === "all" || scope === "selected" || scope === "filtered"
    ? scope
    : "current";

const normalizeFilteredKind = (kind: OriginFilteredCanvasKind): OriginFilteredCanvasKind =>
  kind === "transfer" ? "transfer" : "output";

const normalizeContentKeys = (
  keys: readonly OriginExportContentKey[],
): readonly OriginExportContentKey[] => {
  const result: OriginExportContentKey[] = [];
  const allowed = new Set<OriginExportContentKey>(["iv", "metrics", "gm", "gds", "ss", "vth"]);
  const seen = new Set<OriginExportContentKey>();
  for (const key of keys) {
    if (!allowed.has(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result.length ? result : ["iv"];
};

const isSameExportState = (current: ExportState, next: ExportState): boolean =>
  current.originMode === next.originMode &&
    current.canvasScope === next.canvasScope &&
    current.filteredKind === next.filteredKind &&
    current.curveMode === next.curveMode &&
    areStringArraysEqual(current.selectedCurveKeys, next.selectedCurveKeys) &&
    areStringArraysEqual(current.selectedContentKeys, next.selectedContentKeys);

const normalizeCurveKeys = (
  curveKeys: readonly string[],
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const curveKey of curveKeys) {
    const key = String(curveKey ?? "").trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result;
};

const areStringArraysEqual = (
  first: readonly string[],
  second: readonly string[],
): boolean =>
  first.length === second.length &&
  first.every((value, index) => value === second[index]);

registerSingleton(IExportService, BrowserExportService, InstantiationType.Delayed);
