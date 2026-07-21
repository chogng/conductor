/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { extUri } from "src/cs/base/common/resources";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { localize } from "src/cs/nls";
import {
  createExportCsvFile,
  type ExportCsvFile,
} from "src/cs/workbench/services/export/browser/csvExport";
import {
  createOriginCurveOptions,
} from "src/cs/workbench/services/export/common/exportModel";
import {
  runExportOriginZip,
  runOpenInOrigin,
} from "src/cs/workbench/services/export/browser/originExportService";
import {
  IExportService,
  type ExportResourceIdentity,
  type ExportState,
  type ExportViewState,
  type ExportViewStateInput,
  type OriginCanvasExportScope,
  type OriginCurveExportMode,
  type OriginExportPlanInput,
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
import {
  getXUnitMeta,
  getYUnitMeta,
} from "src/cs/workbench/services/plot/common/units";
import {
  ICalculationService,
  type CalculationResourceResult,
} from "src/cs/workbench/services/calculation/common/calculation";
import type { URI } from "src/cs/base/common/uri";
import {
  getOriginOpenPlotOptions,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";
import {
  IPlotService,
  type PlotAxisOverrides,
} from "src/cs/workbench/services/plot/common/plot";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";

type OriginExportFile = {
  readonly calculationCache?: unknown;
  readonly axisOverrides: PlotAxisOverrides;
  readonly curveType?: string;
  readonly fileName?: string;
  readonly legendLabels: Readonly<Record<string, string>>;
  readonly resource: URI;
  readonly series?: readonly OriginExportSeries[];
  readonly sheetId?: string | null;
  readonly xAxisRole?: string;
  readonly xGroups?: readonly OriginExportNumberArray[];
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly yLabel?: string;
  readonly yUnit?: string;
};

type OriginExportSeries = {
  readonly id?: string;
  readonly label?: string;
  readonly legendValue?: unknown;
  readonly name?: string;
};

type OriginExportNumberArray = readonly number[] | Float64Array;

type ResolvedOriginExportPlanInput = OriginExportPlanInput & {
  readonly results: readonly ResolvedOriginExportResult[];
};

type ResolvedOriginExportResult = {
  readonly axisOverrides: PlotAxisOverrides;
  readonly legendLabels: Readonly<Record<string, string>>;
  readonly result: CalculationResourceResult;
};

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
    selectedResources: [],
    selectedCurveKeys: [],
    selectedContentKeys: ["iv"],
  };
  private viewState: ExportViewState = createDefaultExportViewState();

  constructor(
    @ICalculationService private readonly calculationService: ICalculationService,
    @ISettingsService private readonly settingsService: ISettingsService,
    @IPlotService private readonly plotService: IPlotService,
    @INotificationService private readonly notificationService: INotificationService,
  ) {
    super();
    this._register(this.calculationService.onDidChangeResourceCalculationResult(() => {
      if (this.currentOriginExportPlanInput) {
        this.updateViewState(this.currentOriginExportPlanInput);
      }
    }));
  }

  getState(): ExportState {
    return this.state;
  }

  public getViewState(): ExportViewState {
    return this.projectExportViewState(this.viewState);
  }

  public updateViewState(input: ExportViewStateInput): ExportViewState {
    this.currentOriginExportPlanInput = input;
    this.reconcileSelectedResources(input.resources);
    const planInput = this.resolveOriginExportPlanInput(this.currentOriginExportPlanInput);
    const activeResult = this.resolveActiveOriginResult(planInput);
    const curveOptions = activeResult
      ? createOriginCurveOptions(
        activeResult.result,
        (seriesId, fallback, index) =>
          this.resolveOriginSeriesLabel(
            activeResult.result,
            activeResult.legendLabels,
            seriesId,
            fallback,
            index,
          ),
      )
      : [];
    this.syncSelectedCurveKeys(curveOptions.map(option => option.key));
    const viewState: ExportViewState = {
      curveOptions,
      hasMixedExportYScales: this.hasMixedOriginExportYScales(planInput),
      showFilteredCanvasKindSelect: this.state.canvasScope === "filtered",
    };
    this.viewState = viewState;
    this.onDidChangeExportViewStateEmitter.fire(viewState);
    return viewState;
  }

  private reconcileSelectedResources(
    availableResources: readonly ExportResourceIdentity[],
  ): void {
    const selectedResources = this.state.selectedResources.filter(selectedResource =>
      availableResources.some(availableResource =>
        isSameExportResource(availableResource, selectedResource)
      )
    );
    this.updateState({ selectedResources });
  }

  private hasMixedOriginExportYScales(
    input: ResolvedOriginExportPlanInput,
  ): boolean {
    const results = this.state.canvasScope === "filtered"
      ? input.results.filter(result => this.isOriginFilteredResult(result.result))
      : input.results;
    return new Set(
      results.map(result => result.axisOverrides.yScale === "log" ? "log" : "linear"),
    ).size > 1;
  }

  public buildOriginExportPlan(input: OriginExportPlanInput): OriginExportPlan {
    return this.buildOriginExportPlanForInput(this.resolveOriginExportPlanInput(input));
  }

  private buildOriginExportPlanForInput(input: ResolvedOriginExportPlanInput): OriginExportPlan {
    const files = this.resolveOriginExportFiles(input);
    if (!files.length) {
      throw new Error(localize("origin.selection.canvasRequired", "Please select at least one thumbnail first."));
    }

    const plan = buildOriginExportPlan(
      files,
      () => this.state.curveMode === "select" ? this.state.selectedCurveKeys : undefined,
      this.state.originMode,
      (file) => this.resolveOriginYScaleForFile(file as OriginExportFile),
      (file) => getXUnitMeta(this.resolveOriginXUnitForFile(file as OriginExportFile)).factor,
      (file) => getYUnitMeta(this.resolveOriginYUnitForFile(file as OriginExportFile)).factor,
      (file) => getYUnitMeta(this.resolveOriginYUnitForFile(file as OriginExportFile)).label,
      (file, series, index) =>
        this.resolveOriginCurveLabel(file as OriginExportFile, series, index),
      (file, axis) => this.resolveOriginAxisTitleForFile(file as OriginExportFile, axis),
      (file, y) =>
        this.resolveOriginYScaleForFile(file as OriginExportFile) === "log"
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
    const canvasScope = normalizeCanvasScope(resolveNext(value, this.state.canvasScope));
    const selectedResources = canvasScope === "selected" &&
      this.state.canvasScope !== "selected" &&
      this.state.selectedResources.length === 0
      ? this.getCurrentExportResource()
      : this.state.selectedResources;
    this.updateState({
      canvasScope,
      selectedResources,
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

  public toggleCanvasSelection(target: ExportResourceIdentity): void {
    const selectedTarget = normalizeExportResourceIdentity(target);
    if (!selectedTarget) {
      return;
    }

    const selectedResources = this.state.selectedResources.some(resource =>
      isSameExportResource(resource, selectedTarget))
      ? this.state.selectedResources.filter(resource =>
        !isSameExportResource(resource, selectedTarget))
      : [...this.state.selectedResources, selectedTarget];
    this.updateState({ selectedResources });
  }

  public updateCanvasSelection(
    targets: readonly ExportResourceIdentity[],
    selected: boolean,
  ): void {
    const normalizedTargets = targets.reduce<ExportResourceIdentity[]>((result, target) => {
      const normalizedTarget = normalizeExportResourceIdentity(target);
      if (
        normalizedTarget &&
        !result.some(existingTarget => isSameExportResource(existingTarget, normalizedTarget))
      ) {
        result.push(normalizedTarget);
      }
      return result;
    }, []);
    if (normalizedTargets.length === 0) {
      return;
    }

    const selectedResources = selected
      ? normalizedTargets.reduce<ExportResourceIdentity[]>((result, target) => {
        if (!result.some(existingTarget => isSameExportResource(existingTarget, target))) {
          result.push(target);
        }
        return result;
      }, [...this.state.selectedResources])
      : this.state.selectedResources.filter(resource =>
        !normalizedTargets.some(target => isSameExportResource(resource, target)));
    this.updateState({ selectedResources });
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
      buildPayloads: () => this.buildOriginExportPlanForInput(this.getCurrentOriginExportPlanInput()),
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
      buildPayloads: () => this.buildOriginExportPlanForInput(this.getCurrentOriginExportPlanInput()),
      notificationService: this.notificationService,
    });
  }

  private resolveOriginExportPlanInput(input: OriginExportPlanInput): ResolvedOriginExportPlanInput {
    const targets = this.resolveScopedOriginTargets(input);
    for (const target of targets) {
      this.calculationService.prioritizeResource(target.resource, target.sheetId);
    }
    const results = targets
      .map(target => this.calculationService.getResourceResult(target.resource, target.sheetId))
      .filter((result): result is CalculationResourceResult => result !== null)
      .map(result => ({
        axisOverrides: this.plotService.getAxisOverrides(result),
        legendLabels: this.plotService.getLegendLabels(result),
        result,
      }));
    return {
      ...input,
      results,
    };
  }

  private resolveScopedOriginTargets(
    input: OriginExportPlanInput,
  ): readonly ExportResourceIdentity[] {
    if (this.state.canvasScope === "selected") {
      return input.resources.filter(resource => this.state.selectedResources.some(selectedResource =>
        isSameExportResource(resource, selectedResource)));
    }
    if (this.state.canvasScope !== "current") {
      return input.resources;
    }
    if (!input.activeResource) {
      return [];
    }

    const activeTarget: ExportResourceIdentity = {
      resource: input.activeResource,
      sheetId: input.activeSheetId,
    };
    const matchedTarget = input.resources.find(target =>
      isSameExportResource(target, activeTarget)
    );
    return matchedTarget ? [matchedTarget] : [];
  }

  private getCurrentExportResource(): readonly ExportResourceIdentity[] {
    const input = this.currentOriginExportPlanInput;
    if (!input?.activeResource) {
      return [];
    }

    const activeTarget: ExportResourceIdentity = {
      resource: input.activeResource,
      sheetId: input.activeSheetId,
    };
    const matchedTarget = input.resources.find(resource =>
      isSameExportResource(resource, activeTarget));
    return matchedTarget ? [matchedTarget] : [];
  }

  private getCurrentOriginExportPlanInput(): ResolvedOriginExportPlanInput {
    return this.resolveOriginExportPlanInput(this.currentOriginExportPlanInput ?? {
      activeResource: null,
      resources: [],
    });
  }

  private resolveOriginExportFiles(input: ResolvedOriginExportPlanInput): OriginExportFile[] {
    const files = input.results.map(resolved =>
      this.createOriginExportFile(createExportCsvFile(resolved.result), resolved)
    );
    return this.state.canvasScope === "filtered"
      ? files.filter(file => this.isOriginFilteredCanvas(file))
      : files;
  }

  private createOriginExportFile(
    file: ExportCsvFile,
    resolved: ResolvedOriginExportResult,
  ): OriginExportFile {
    const xAxisRole = String(file.xAxisRole ?? "").trim();
    return {
      ...file,
      axisOverrides: resolved.axisOverrides,
      curveType: file.curveType ? String(file.curveType) : undefined,
      legendLabels: resolved.legendLabels,
      resource: resolved.result.resource,
      sheetId: resolved.result.sheetId ?? null,
      xAxisRole: xAxisRole || undefined,
    };
  }

  private resolveOriginCurveLabel(
    file: OriginExportFile | null | undefined,
    series: OriginExportSeries | null | undefined,
    index: number,
  ): string {
    const seriesId = String(series?.id ?? "");
    const fallback = this.resolveFallbackOriginCurveLabel(series, index);
    return file
      ? this.resolveOriginSeriesLabel(
        file,
        file.legendLabels,
        seriesId,
        fallback,
        index,
      )
      : fallback;
  }

  private resolveOriginSeriesLabel(
    target: Pick<OriginExportFile, "resource" | "sheetId"> | CalculationResourceResult,
    legendLabels: Readonly<Record<string, string>>,
    seriesId: string,
    fallback: string,
    index: number,
  ): string {
    const normalizedSeriesId = String(seriesId ?? "").trim();
    const plotLabel = normalizedSeriesId
      ? legendLabels[normalizedSeriesId]
      : undefined;
    if (plotLabel) {
      return plotLabel;
    }

    const series = "seriesById" in target && normalizedSeriesId
      ? target.seriesById[normalizedSeriesId]
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
    file: OriginExportFile | null | undefined,
  ): string {
    return file?.axisOverrides.xUnit ?? String(file?.xUnit ?? "V");
  }

  private resolveOriginYUnitForFile(
    file: OriginExportFile | null | undefined,
  ): string {
    return file?.axisOverrides.yUnit ?? String(file?.yUnit ?? "A");
  }

  private resolveOriginYScaleForFile(
    file: OriginExportFile | null | undefined,
  ): OriginYAxisScaleMode {
    return file?.axisOverrides.yScale === "log" ? "log" : "linear";
  }

  private resolveOriginAxisTitleForFile(
    file: OriginExportFile | null | undefined,
    axis: "x" | "y",
  ): string {
    if (axis === "x") {
      return String(file?.xLabel ?? "");
    }

    return String(file?.yLabel ?? "");
  }

  private resolveActiveOriginResult(
    input: ResolvedOriginExportPlanInput,
  ): ResolvedOriginExportResult | null {
    return input.activeResource
      ? input.results.find(({ result }) => isSameExportResource(result, {
        resource: input.activeResource!,
        sheetId: input.activeSheetId,
      })) ?? null
      : null;
  }

  private isOriginFilteredCanvas(file: OriginExportFile): boolean {
    const xAxisRole = String(file.xAxisRole ?? "").trim().toLowerCase();
    if (this.matchesOriginFilteredAxisRole(xAxisRole)) {
      return true;
    }

    const curveType = String(file.curveType ?? "").trim().toLowerCase();
    return Boolean(curveType && curveType.includes(this.state.filteredKind));
  }

  private isOriginFilteredResult(result: CalculationResourceResult): boolean {
    const xAxisRole = String(result.axis.xAxisRole ?? "").trim().toLowerCase();
    if (this.matchesOriginFilteredAxisRole(xAxisRole)) {
      return true;
    }

    return Object.values(result.curvesByKey).some(curve =>
      curve.curveGeneration === "base" &&
      curve.curveFamily === "iv" &&
      curve.ivMode === this.state.filteredKind
    );
  }

  private matchesOriginFilteredAxisRole(xAxisRole: string): boolean {
    return this.state.filteredKind === "transfer"
      ? xAxisRole === "vg"
      : xAxisRole === "vd";
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

const isSameExportResource = (
  first: ExportResourceIdentity,
  second: ExportResourceIdentity,
): boolean =>
  extUri.isEqual(first.resource, second.resource) &&
  normalizeExportSheetId(first.sheetId) === normalizeExportSheetId(second.sheetId);

const normalizeExportSheetId = (
  sheetId: string | null | undefined,
): string => String(sheetId ?? "").trim();

const normalizeExportResourceIdentity = (
  target: ExportResourceIdentity | null | undefined,
): ExportResourceIdentity | null => {
  if (!target?.resource) {
    return null;
  }

  const sheetId = normalizeExportSheetId(target.sheetId);
  return {
    resource: target.resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const resolveNext = <T,>(value: T | ((previous: T) => T), previous: T): T =>
  typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;

const createDefaultExportViewState = (): ExportViewState => ({
  curveOptions: [],
  hasMixedExportYScales: false,
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
    areExportResourceIdentityArraysEqual(current.selectedResources, next.selectedResources) &&
    areStringArraysEqual(current.selectedCurveKeys, next.selectedCurveKeys) &&
    areStringArraysEqual(current.selectedContentKeys, next.selectedContentKeys);

const areExportResourceIdentityArraysEqual = (
  first: readonly ExportResourceIdentity[],
  second: readonly ExportResourceIdentity[],
): boolean =>
  first.length === second.length &&
  first.every((resource, index) => isSameExportResource(resource, second[index]!));

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
