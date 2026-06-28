/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { runWhenGlobalIdle } from "src/cs/base/common/async";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  type ExplorerPaneInput,
  type ExplorerSelectionKind,
  type IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  createRawExplorerFiles,
  resolveExplorerSelectedFileId,
  type ExplorerFileEntry,
  type ExplorerRawFileInput,
  type ExplorerThumbnailFile,
  buildExplorerTree,
  type ExplorerTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import type { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";
import type { IChartService } from "src/cs/workbench/services/chart/common/chart";
import { getOriginOpenPlotOptions, type ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type {
  IPlotService,
  PlotCalculatedDataPrefetchPriority,
  PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import {
  type ISessionService,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
import {
  collectFileRecordBaseCurves,
  fileRecordSupportsSs,
  getFileRecordCurveType,
  getFileRecordDomain,
  getFileRecordXGroups,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import type {
  ITableService,
  TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  type ISliceService,
  type SliceFileState,
  type SliceUriTarget,
  type SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import type {
  IThumbnailPreviewService,
  ThumbnailPreviewTarget,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  isTemplateApplyPerformanceTraceEnabled,
  registerTemplateApplyPerformanceTraceTargetApi,
  type TemplateApplyPerformanceTraceChartTarget,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";

const RECENT_INTERACTIVE_CHART_TARGET_LIMIT = 16;

export type WorkbenchDomainBridgeSyncOptions = {
  readonly deferSecondaryWork?: boolean;
};

export type WorkbenchDomainBridgeOptions = {
  readonly chartService: IChartService;
  readonly calculationService: ICalculationService;
  readonly explorerService: IExplorerService;
  readonly layoutService: IWorkbenchLayoutService;
  readonly plotService: IPlotService;
  readonly sessionService: ISessionService;
  readonly settingsService: ISettingsService;
  readonly sliceService: ISliceService;
  readonly tableService: ITableService;
  readonly thumbnailPreviewService: IThumbnailPreviewService;
};

export type SessionExplorerFacts = {
  readonly chartDataFileIds: readonly string[];
  readonly rawExplorerFiles: readonly ExplorerFileEntry[];
  readonly sessionFileIds: readonly string[];
  readonly thumbnailFiles: readonly ExplorerThumbnailFile[];
};

export class WorkbenchDomainBridge extends Disposable {
  private readonly recentInteractiveChartTargetFileIds: string[] = [];

  constructor(
    private readonly options: WorkbenchDomainBridgeOptions,
  ) {
    super();

    this._register(this.options.settingsService.onDidChangeConductorSettings(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangePendingSourceFiles(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangeSelection(event => {
      this.prioritizeProcessingFile(event.selectedFileId, "active");
      this.scheduleInteractiveSync();
    }));
    this._register(this.options.explorerService.onDidChangeHoveredFile(event => {
      this.prioritizeProcessingFile(event.fileId, "hover");
    }));
    this._register(this.options.explorerService.onDidChangeVisibleFileIds(event => {
      this.prioritizeVisibleExplorerFiles(event.visibleFileIds, event.nearbyFileIds);
    }));
    this._register(this.options.plotService.onDidChangePlotState(() => this.scheduleSync()));
    this._register(this.options.sliceService.onDidChangeSliceState(() => this.scheduleInteractiveSync()));
    this._register(this.options.layoutService.onDidChangeWorkbenchNavigation(() => this.scheduleSync()));
    this._register(this.options.sessionService.onDidChangeSession(() => this.scheduleSync()));
    this._register({
      dispose: () => {
        this.cancelScheduledSync?.();
        this.cancelScheduledSync = null;
        this.cancelDeferredSecondarySync();
      },
    });
    if (isTemplateApplyPerformanceTraceEnabled()) {
      this._register({
        dispose: registerTemplateApplyPerformanceTraceTargetApi({
          getChartTargets: () => this.getPerformanceTraceChartTargets(),
          getSelectedChartTargetFileId: () => this.getPerformanceTraceSelectedChartTargetFileId(),
          selectChartTarget: (fileId, reveal = "force") => this.selectPerformanceTraceChartTarget(fileId, reveal),
          setHoveredChartTarget: fileId => this.setPerformanceTraceHoveredChartTarget(fileId),
        }),
      });
    }
  }

  private cancelScheduledSync: (() => void) | null = null;
  private cancelScheduledDeferredSecondarySync: (() => void) | null = null;
  private scheduledSyncKind: "frame" | "microtask" | null = null;

  public sync(options: WorkbenchDomainBridgeSyncOptions = {}): void {
    this.cancelScheduledSync?.();
    this.cancelScheduledSync = null;
    this.scheduledSyncKind = null;
    this.runSync(options);
  }

  private scheduleSync(): void {
    this.cancelDeferredSecondarySync();
    if (this.cancelScheduledSync) {
      return;
    }

    const run = (): void => {
      this.cancelScheduledSync = null;
      this.scheduledSyncKind = null;
      this.runSync();
    };
    this.scheduledSyncKind = "frame";
    if (typeof globalThis.requestAnimationFrame === "function") {
      const handle = globalThis.requestAnimationFrame(run);
      this.cancelScheduledSync = () => {
        globalThis.cancelAnimationFrame(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, 0);
    this.cancelScheduledSync = () => {
      globalThis.clearTimeout(handle);
    };
  }

  private scheduleInteractiveSync(): void {
    this.cancelDeferredSecondarySync();
    if (this.scheduledSyncKind === "microtask") {
      return;
    }

    this.cancelScheduledSync?.();
    let canceled = false;
    this.scheduledSyncKind = "microtask";
    this.cancelScheduledSync = () => {
      canceled = true;
    };
    const run = (): void => {
      if (canceled || this.scheduledSyncKind !== "microtask") {
        return;
      }

      this.cancelScheduledSync = null;
      this.scheduledSyncKind = null;
      this.runSync();
    };
    if (typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(run);
      return;
    }

    globalThis.setTimeout(run, 0);
  }

  private runSync({ deferSecondaryWork = false }: WorkbenchDomainBridgeSyncOptions = {}): void {
    this.cancelDeferredSecondarySync();
    if (this.trySyncCurrentUriTablePaneInput()) {
      return;
    }
    if (this.trySyncCurrentUriChartPaneInput({ deferSecondaryWork })) {
      return;
    }

    const snapshot = this.options.sessionService.getSnapshot();
    const endPerf = startPerf("workbenchDomainBridge.sync", {
      deferSecondaryWork,
      fileCount: Object.keys(snapshot.filesById).length,
      sessionVersion: snapshot.sessionVersion,
    });
    const sessionFacts = createSessionExplorerFacts(snapshot);
    this.pruneRecentInteractiveChartTargets(sessionFacts);
    const explorerSelection = reconcileExplorerDomainSelection(
      this.options.explorerService,
      sessionFacts,
      this.options.layoutService.activeWorkbenchMainPart,
    );
    const tableSource = createExplorerPaneTableSource(
      explorerSelection,
      getExplorerPaneTableSourceFiles(
        sessionFacts,
        this.options.explorerService.getPaneInput()?.files ?? [],
      ),
    );
    if (tableSource || !explorerSelection.selectedRawFileId) {
      this.options.tableService.open(tableSource);
    }

    if (deferSecondaryWork) {
      this.scheduleDeferredSecondarySync();
      endPerf({
        chartDataFileCount: sessionFacts.chartDataFileIds.length,
        deferredSecondaryWork: true,
        explorerFileCount: sessionFacts.rawExplorerFiles.length,
      });
      return;
    }

    this.syncSecondaryState(sessionFacts, explorerSelection);
    endPerf({
      chartDataFileCount: sessionFacts.chartDataFileIds.length,
      deferredSecondaryWork: false,
      explorerFileCount: sessionFacts.rawExplorerFiles.length,
    });
  }

  private trySyncCurrentUriTablePaneInput(): boolean {
    if (this.options.layoutService.activeWorkbenchMainPart !== "table") {
      return false;
    }

    const paneInput = this.options.explorerService.getPaneInput();
    if (paneInput?.mode !== "table") {
      return false;
    }

    const resourceIdentities = paneInput.files
      .filter(hasExplorerFileResource)
      .map(file => ({
        fileId: normalizeExplorerSelectionFileId(file.fileId),
        itemKey: getExplorerFileItemKey(file),
      }))
      .filter((identity): identity is ExplorerItemIdentity => Boolean(identity.fileId));
    if (!resourceIdentities.length) {
      return false;
    }

    const selectedFileId = resolveExplorerSelectedFileId(
      getExplorerSelectedFileId(this.options.explorerService) ??
        normalizeExplorerSelectionFileId(paneInput.selectedFileId),
      resourceIdentities.map(identity => identity.fileId),
    );
    const selectedItemKey = resolveExplorerSelectedItemKey(
      getExplorerSelectedItemKey(this.options.explorerService) ??
        normalizeExplorerSelectionItemKey(paneInput.selectedItemKey),
      selectedFileId,
      resourceIdentities,
    );
    const tableSource = createExplorerPaneTableSource({
      selectedRawFileId: selectedFileId,
      selectedRawItemKey: selectedItemKey,
    }, paneInput.files);
    if (!tableSource) {
      return false;
    }

    this.options.explorerService.select({
      candidateFileIds: resourceIdentities.map(identity => identity.fileId),
      candidateItemKeys: resourceIdentities.flatMap(identity => identity.itemKey ? [identity.itemKey] : []),
      fileId: selectedFileId,
      kind: "table",
      itemKey: selectedItemKey,
    });
    this.options.tableService.open(tableSource);
    return true;
  }

  private trySyncCurrentUriChartPaneInput({
    deferSecondaryWork = false,
  }: WorkbenchDomainBridgeSyncOptions = {}): boolean {
    if (this.options.layoutService.activeWorkbenchMainPart !== "chart") {
      return false;
    }

    const paneInput = this.options.explorerService.getPaneInput();
    if (paneInput?.mode !== "chart" || !paneInput.files.some(hasExplorerFileResource)) {
      return false;
    }

    const selectedFileId = resolveExplorerSelectedFileId(
      getExplorerSelectedFileId(this.options.explorerService) ??
        normalizeExplorerSelectionFileId(paneInput.selectedFileId),
      getExplorerPaneFileIds(paneInput.files.filter(hasExplorerFileResource)),
    );
    const target = getSliceUriTargetForChartFileId(
      this.options.sliceService,
      paneInput.files,
      selectedFileId,
    );
    if (!selectedFileId || !target) {
      return false;
    }

    if (deferSecondaryWork) {
      this.scheduleDeferredSecondarySync();
      return true;
    }

    const activePlotType = this.options.plotService.getState().activePlotType;
    const chartViewInput = createChartViewInput({
      activeFileId: selectedFileId,
      activePlotType,
      activeTarget: target,
      chartFileOptions: createExplorerChartFileOptions(selectedFileId, paneInput.files),
      hasChartData: true,
      showFileSelect: false,
      shouldMountCharts: false,
    });
    this.options.plotService.prefetchPlotDisplayModel({
      fileId: selectedFileId,
      plotType: activePlotType,
      target,
    }, "active");
    this.options.chartService.updateViewInput(chartViewInput);
    return true;
  }

  private scheduleDeferredSecondarySync(): void {
    this.cancelDeferredSecondarySync();
    let disposed = false;
    let frameHandle: number | null = null;
    let idleHandle: IDisposable | null = null;
    const run = (): void => {
      if (disposed) {
        return;
      }

      const currentIdleHandle = idleHandle;
      idleHandle = null;
      this.cancelScheduledDeferredSecondarySync = null;
      currentIdleHandle?.dispose();
      this.runDeferredSecondarySync();
    };

    if (
      typeof globalThis.requestAnimationFrame === "function" &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      frameHandle = globalThis.requestAnimationFrame(() => {
        frameHandle = null;
        if (disposed) {
          return;
        }

        idleHandle = runWhenGlobalIdle(run, 500);
      });
      this.cancelScheduledDeferredSecondarySync = () => {
        disposed = true;
        if (frameHandle !== null) {
          globalThis.cancelAnimationFrame(frameHandle);
        }
        idleHandle?.dispose();
      };
      return;
    }

    idleHandle = runWhenGlobalIdle(run, 500);
    this.cancelScheduledDeferredSecondarySync = () => {
      disposed = true;
      idleHandle?.dispose();
    };
  }

  private cancelDeferredSecondarySync(): void {
    this.cancelScheduledDeferredSecondarySync?.();
    this.cancelScheduledDeferredSecondarySync = null;
  }

  private runDeferredSecondarySync(): void {
    if (this.trySyncCurrentUriChartPaneInput()) {
      return;
    }

    const snapshot = this.options.sessionService.getSnapshot();
    const endPerf = startPerf("workbenchDomainBridge.deferredSync", {
      fileCount: Object.keys(snapshot.filesById).length,
      sessionVersion: snapshot.sessionVersion,
    });
    const sessionFacts = createSessionExplorerFacts(snapshot);
    const explorerSelection = resolveExplorerDomainSelection(
      this.options.explorerService,
      sessionFacts,
      this.options.explorerService.getPaneInput()?.files ?? [],
    );
    this.syncSecondaryState(sessionFacts, explorerSelection);
    endPerf({
      chartDataFileCount: sessionFacts.chartDataFileIds.length,
      explorerFileCount: sessionFacts.rawExplorerFiles.length,
    });
  }

  private syncSecondaryState(
    sessionFacts: SessionExplorerFacts,
    explorerSelection: ExplorerDomainSelection,
  ): void {
    const sliceState = this.options.sliceService.getState();
    const explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [];
    this.options.explorerService.updatePaneInput(this.getExplorerPaneInput(
      sessionFacts,
      sliceState,
    ));
    const chartViewInput = this.getChartViewInput(
      sessionFacts,
      explorerFiles,
      explorerSelection.selectedProcessedFileId,
    );
    if (chartViewInput.activeFileId && chartViewInput.hasChartData) {
      if (!chartViewInput.activeTarget) {
        this.options.calculationService.prioritizeCalculationFile(chartViewInput.activeFileId);
      }
      const plotType = chartViewInput.activePlotType ?? this.options.plotService.getState().activePlotType;
      const input = chartViewInput.activeTarget
        ? {
          fileId: chartViewInput.activeFileId,
          plotType,
          target: chartViewInput.activeTarget,
        }
        : {
          fileId: chartViewInput.activeFileId,
          plotType,
        };
      this.options.plotService.prefetchPlotDisplayModel(input, "active");
    }
    this.options.chartService.updateViewInput(chartViewInput);
  }

  private getExplorerPaneInput(
    sessionFacts: SessionExplorerFacts,
    sliceState: SliceState = this.options.sliceService.getState(),
  ): ExplorerPaneInput {
    const conductorSettings = this.options.settingsService.getConductorSettings();
    return createExplorerPaneInput({
      activePlotType: this.options.plotService.getState().activePlotType,
      explorerService: this.options.explorerService,
      mode: this.options.layoutService.activeWorkbenchMainPart,
      originOpenPlotOptions: getOriginOpenPlotOptions(conductorSettings),
      plotAxisSettings: conductorSettings?.plotAxisSettings,
      plotService: this.options.plotService,
      sessionFacts,
      sliceService: this.options.sliceService,
      sliceState,
    });
  }

  private getChartViewInput(
    sessionFacts: SessionExplorerFacts,
    explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [],
    activeFileId = resolveExplorerDomainSelection(
      this.options.explorerService,
      sessionFacts,
      explorerFiles,
    ).selectedProcessedFileId,
  ) {
    const chartActiveFileId = resolveExplorerSelectedFileId(
      activeFileId,
      getChartCandidateFileIds(this.options.sliceService, sessionFacts, explorerFiles),
    );
    const activeTarget = getSliceUriTargetForChartFileId(
      this.options.sliceService,
      explorerFiles,
      chartActiveFileId,
    );
    const hasActiveUriTarget = hasExplorerUriTargetForChartFileId(
      explorerFiles,
      chartActiveFileId,
    );
    const hasActiveChartData = Boolean(
      chartActiveFileId &&
        (
          activeTarget ||
          (!hasActiveUriTarget && sessionFacts.chartDataFileIds.includes(chartActiveFileId))
        ),
    );
    const chartFileOptions = createActiveChartFileOptions(
      chartActiveFileId,
      explorerFiles,
      sessionFacts.rawExplorerFiles,
    );
    return createChartViewInput({
      activeFileId: chartActiveFileId,
      activeTarget,
      activePlotType: this.options.plotService.getState().activePlotType,
      chartFileOptions,
      hasChartData: hasActiveChartData,
      showFileSelect: false,
      shouldMountCharts: false,
    });
  }

  private prioritizeProcessingFile(
    fileId: string | null,
    plotPriority: PlotCalculatedDataPrefetchPriority,
  ): void {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    const newlyRecentFileIds = this.rememberRecentInteractiveChartTarget(normalizedFileId);
    const explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [];
    const hasUriTarget = hasExplorerUriTargetForChartFileId(
      explorerFiles,
      normalizedFileId,
    );
    const activeTarget = getSliceUriTargetForChartFileId(
      this.options.sliceService,
      explorerFiles,
      normalizedFileId,
    );
    if (!hasUriTarget && !activeTarget) {
      this.options.calculationService.prioritizeCalculationFile(normalizedFileId);
    }
    this.prefetchPlotDisplayTargets([normalizedFileId], plotPriority, "interactiveTarget");
    this.prefetchRecentInteractiveChartTargets(newlyRecentFileIds);
  }

  private rememberRecentInteractiveChartTarget(fileId: string): readonly string[] {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return [];
    }

    const previousInteractiveFileId = this.recentInteractiveChartTargetFileIds[0] ?? null;
    const existingIndex = this.recentInteractiveChartTargetFileIds.indexOf(normalizedFileId);
    if (existingIndex >= 0) {
      this.recentInteractiveChartTargetFileIds.splice(existingIndex, 1);
    }
    this.recentInteractiveChartTargetFileIds.unshift(normalizedFileId);
    if (this.recentInteractiveChartTargetFileIds.length > RECENT_INTERACTIVE_CHART_TARGET_LIMIT) {
      this.recentInteractiveChartTargetFileIds.length = RECENT_INTERACTIVE_CHART_TARGET_LIMIT;
    }

    return previousInteractiveFileId && previousInteractiveFileId !== normalizedFileId
      ? [previousInteractiveFileId]
      : [];
  }

  private prefetchRecentInteractiveChartTargets(fileIds: readonly string[]): void {
    const recentFileIds = fileIds
      .map(fileId => String(fileId ?? "").trim())
      .filter(Boolean);
    if (!recentFileIds.length || this.options.layoutService.activeWorkbenchMainPart !== "chart") {
      return;
    }

    const explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [];
    this.prefetchPlotDisplayTargets(
      recentFileIds,
      "recent",
      "recentInteractiveTargets",
    );
    const thumbnailTargets = createThumbnailPreviewTargets(recentFileIds, explorerFiles);
    if (thumbnailTargets.length) {
      this.options.thumbnailPreviewService.prefetch(thumbnailTargets, "recent");
    }
  }

  private pruneRecentInteractiveChartTargets(sessionFacts: SessionExplorerFacts): void {
    const explorerFileIds = new Set(
      getExplorerPaneFileIds(
        (this.options.explorerService.getPaneInput()?.files ?? [])
          .filter(hasExplorerFileResource),
      ),
    );
    const sessionFactsFileIds = new Set([
      ...sessionFacts.rawExplorerFiles.map(file => normalizeExplorerSelectionFileId(file.fileId)).filter(Boolean),
      ...sessionFacts.chartDataFileIds.map(fileId => normalizeExplorerSelectionFileId(fileId)).filter(Boolean),
    ]);
    for (let index = this.recentInteractiveChartTargetFileIds.length - 1; index >= 0; index -= 1) {
      const fileId = this.recentInteractiveChartTargetFileIds[index]!;
      if (!sessionFactsFileIds.has(fileId) && !explorerFileIds.has(fileId)) {
        this.recentInteractiveChartTargetFileIds.splice(index, 1);
      }
    }
  }

  private prioritizeVisibleExplorerFiles(
    visibleFileIds: readonly string[],
    nearbyFileIds: readonly string[],
  ): void {
    if (this.options.layoutService.activeWorkbenchMainPart === "chart") {
      this.prefetchPlotDisplayTargets(visibleFileIds, "visible", "visibleExplorerFiles");
      this.prefetchPlotDisplayTargets(nearbyFileIds, "nearby", "nearbyExplorerFiles");
    }
    if (!shouldPrefetchExplorerThumbnails({
      activeWorkbenchMainPart: this.options.layoutService.activeWorkbenchMainPart,
      viewLayout: this.options.explorerService.viewLayout,
    })) {
      return;
    }

    const explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [];
    const visibleLegacyFileIds = filterNonUriExplorerFileIds(visibleFileIds, explorerFiles);
    const nearbyLegacyFileIds = filterNonUriExplorerFileIds(nearbyFileIds, explorerFiles);
    const visibleThumbnailTargets = createThumbnailPreviewTargets(visibleFileIds, explorerFiles);
    const nearbyThumbnailTargets = createThumbnailPreviewTargets(nearbyFileIds, explorerFiles);
    if (visibleLegacyFileIds.length) {
      this.options.calculationService.prioritizeCalculationFiles(visibleLegacyFileIds);
    }
    if (nearbyLegacyFileIds.length) {
      this.options.calculationService.prioritizeCalculationFiles(nearbyLegacyFileIds);
    }
    if (visibleThumbnailTargets.length) {
      this.options.thumbnailPreviewService.prefetch(visibleThumbnailTargets, "visible");
    }
    if (nearbyThumbnailTargets.length) {
      this.options.thumbnailPreviewService.prefetch(nearbyThumbnailTargets, "nearby");
    }
  }

  private prefetchPlotDisplayTargets(
    fileIds: readonly string[],
    priority: PlotCalculatedDataPrefetchPriority,
    source: string,
  ): void {
    if (this.options.layoutService.activeWorkbenchMainPart !== "chart") {
      return;
    }

    const normalizedFileIds = [...new Set(fileIds
      .map(fileId => String(fileId ?? "").trim())
      .filter(Boolean))];
    if (!normalizedFileIds.length) {
      return;
    }

    const plotType = this.options.plotService.getState().activePlotType;
    const endPerf = startPerf("workbenchDomainBridge.prefetchPlotDisplayTargets", {
      fileCount: normalizedFileIds.length,
      plotType,
      priority,
      source,
    }, { silent: true });
    const explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [];
    const inputs = normalizedFileIds.flatMap(fileId => {
      const hasUriTarget = hasExplorerUriTargetForChartFileId(explorerFiles, fileId);
      const target = getSliceUriTargetForChartFileId(this.options.sliceService, explorerFiles, fileId);
      if (hasUriTarget && !target) {
        return [];
      }

      if (target) {
        return {
          fileId,
          plotType,
          target,
        };
      }

      return {
        fileId,
        plotType,
      };
    });
    if (!inputs.length) {
      endPerf({
        requestedFileCount: 0,
      });
      return;
    }

    if (inputs.length === 1) {
      this.options.plotService.prefetchPlotDisplayModel(inputs[0]!, priority);
    } else {
      this.options.plotService.prefetchPlotDisplayModels(
        inputs,
        priority,
      );
    }
    endPerf({
      requestedFileCount: normalizedFileIds.length,
    });
  }

  private getPerformanceTraceChartTargets(): readonly TemplateApplyPerformanceTraceChartTarget[] {
    const currentPaneInput = this.options.explorerService.getPaneInput();
    if (currentPaneInput?.mode === "chart" && currentPaneInput.files.length) {
      return createPerformanceTraceChartTargets({
        expandedFolderKeys: this.options.explorerService.expandedFolderKeys,
        paneInput: currentPaneInput,
        selectedFileId: getExplorerSelectedFileId(this.options.explorerService) ?? currentPaneInput.selectedFileId,
        sliceService: this.options.sliceService,
      });
    }

    return [];
  }

  private selectPerformanceTraceChartTarget(fileId: string, reveal: boolean | "force"): string | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    const targets = this.getPerformanceTraceChartTargets();
    return this.options.explorerService.select({
      candidateFileIds: targets.map(target => target.fileId),
      fileId: normalizedFileId,
      kind: "chart",
    }, reveal);
  }

  private getPerformanceTraceSelectedChartTargetFileId(): string | null {
    return getExplorerSelectedFileId(this.options.explorerService);
  }

  private setPerformanceTraceHoveredChartTarget(fileId: string | null): string | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      this.options.explorerService.setHoveredFileId(null);
      return null;
    }

    this.options.explorerService.setHoveredFileId(normalizedFileId);
    return normalizedFileId;
  }
}

const createActiveChartFileOptions = (
  activeFileId: string | null,
  explorerFiles: readonly ExplorerFileEntry[] = [],
  rawExplorerFiles: SessionExplorerFacts["rawExplorerFiles"] = [],
): ChartFileOption[] => {
  if (!activeFileId) {
    return [];
  }

  const explorerResourceFile = explorerFiles.find(candidate =>
    normalizeExplorerSelectionFileId(candidate.fileId) === activeFileId &&
    hasExplorerFileResource(candidate)
  );
  if (explorerResourceFile) {
    return [{
      fileId: activeFileId,
      fileName: String(explorerResourceFile.fileName ?? activeFileId),
    }];
  }

  const rawFile = rawExplorerFiles.find(candidate =>
    normalizeExplorerSelectionFileId(candidate.fileId) === activeFileId
  );
  if (rawFile) {
    return [{
      fileId: activeFileId,
      fileName: String(rawFile.fileName ?? activeFileId),
    }];
  }

  const explorerFile = explorerFiles.find(candidate =>
    normalizeExplorerSelectionFileId(candidate.fileId) === activeFileId
  );
  if (!explorerFile) {
    return [];
  }

  return [{
    fileId: activeFileId,
    fileName: String(explorerFile.fileName ?? activeFileId),
  }];
};

export const createSessionExplorerFacts = (
  snapshot: SessionSnapshot,
): SessionExplorerFacts => {
  const files = getOrderedSessionFiles(snapshot);
  const rawInputs = files.flatMap(createSessionRawExplorerInputs);
  return {
    chartDataFileIds: files
      .filter(hasFileRecordChartData)
      .map(file => file.id),
    rawExplorerFiles: createRawExplorerFiles(rawInputs),
    sessionFileIds: files.map(file => file.id),
    thumbnailFiles: files
      .filter(hasFileRecordChartData)
      .map(createSessionThumbnailFile),
  };
};

const getOrderedSessionFiles = (
  snapshot: SessionSnapshot,
): FileRecord[] => {
  const files: FileRecord[] = [];
  const seen = new Set<string>();
  const pushFile = (fileId: unknown): void => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId || seen.has(normalizedFileId)) {
      return;
    }
    seen.add(normalizedFileId);

    const file = snapshot.filesById[normalizedFileId];
    if (file) {
      files.push(file);
    }
  };

  for (const fileId of snapshot.fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(snapshot.filesById)) {
    pushFile(fileId);
  }

  return files;
};

const createSessionRawExplorerInputs = (
  file: FileRecord,
): ExplorerRawFileInput[] => {
  const baseFile: ExplorerRawFileInput = {
    file: file.raw.file,
    fileId: file.id,
    fileName: file.name || file.raw.fileName,
    normalizedCsvPath: file.raw.normalizedCsvPath ?? null,
    relativePath: file.raw.relativePath ?? null,
    sourcePath: file.raw.filePath ?? null,
  };
  const tableIds = getOrderedSessionRawTableIds(file);
  if (!tableIds.length) {
    return [baseFile];
  }

  return tableIds.map((tableId): ExplorerRawFileInput => {
    const table = file.raw.tablesById[tableId]!;
    return {
      ...baseFile,
      itemKey: table.tableKey,
      sheetId: table.sheetId,
      sheetName: table.sheetName ?? null,
      sourceVersion: file.rawTableVersionsById[tableId] ?? 0,
      tableKey: table.tableKey,
    };
  });
};

const getOrderedSessionRawTableIds = (
  file: FileRecord,
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const pushTableId = (tableId: unknown): void => {
    const normalizedTableId = String(tableId ?? "").trim();
    if (!normalizedTableId || seen.has(normalizedTableId) || !file.raw.tablesById[normalizedTableId]) {
      return;
    }

    seen.add(normalizedTableId);
    result.push(normalizedTableId);
  };

  for (const tableId of file.raw.tableOrder) {
    pushTableId(tableId);
  }
  for (const tableId of Object.keys(file.raw.tablesById)) {
    pushTableId(tableId);
  }
  return result;
};

const hasFileRecordChartData = (file: FileRecord): boolean =>
  collectFileRecordBaseCurves(file).length > 0;

const createSessionThumbnailFile = (
  file: FileRecord,
): ExplorerThumbnailFile => {
  const domain = getFileRecordDomain(file);
  return {
    calculationCache: file.calculationCache,
    curveType: getFileRecordCurveType(file),
    domain: domain
      ? {
        x: domain.x,
        y: domain.y,
      }
      : undefined,
    fileId: file.id,
    fileName: file.name || file.raw.fileName,
    series: file.seriesOrder.map(seriesId => file.seriesById[seriesId]).filter(Boolean),
    supportsSs: fileRecordSupportsSs(file),
    xGroups: getFileRecordXGroups(file),
  };
};

const createExplorerChartFileOptions = (
  activeFileId: string | null,
  explorerFiles: readonly ExplorerFileEntry[],
): ChartFileOption[] => {
  if (!activeFileId) {
    return [];
  }

  const file = explorerFiles.find(candidate =>
    normalizeExplorerSelectionFileId(candidate.fileId) === activeFileId &&
    hasExplorerFileResource(candidate)
  );
  if (!file) {
    return [];
  }

  return [{
    fileId: activeFileId,
    fileName: String(file.fileName ?? activeFileId),
  }];
};

const getChartCandidateFileIds = (
  sliceService: Pick<ISliceService, "getUriResult">,
  sessionFacts: SessionExplorerFacts,
  explorerFiles: readonly ExplorerFileEntry[],
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (fileId: unknown): void => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId || seen.has(normalizedFileId)) {
      return;
    }

    seen.add(normalizedFileId);
    result.push(normalizedFileId);
  };

  for (const file of sessionFacts.rawExplorerFiles) {
    push(file.fileId);
  }
  for (const file of explorerFiles) {
    push(getExplorerFileChartTargetId(file));
    const target = getExplorerFileUriTarget(file);
    if (target && sliceService.getUriResult(target)) {
      push(file.fileId);
    }
  }
  return result;
};

const hasTraceChartTargetState = (
  chartState: TemplateApplyPerformanceTraceChartTarget["chartState"],
  hasChartData: boolean,
): boolean =>
  hasChartData ||
  chartState === "queued" ||
  chartState === "processing" ||
  chartState === "ready";

const createPerformanceTraceChartTargets = ({
  expandedFolderKeys,
  paneInput,
  selectedFileId,
  sliceService,
}: {
  readonly expandedFolderKeys: readonly string[];
  readonly paneInput: ExplorerPaneInput;
  readonly selectedFileId?: string | null;
  readonly sliceService: Pick<ISliceService, "getUriResult" | "getUriState">;
}): readonly TemplateApplyPerformanceTraceChartTarget[] => {
  const rowIndicesByFileId = createTraceRowIndicesByFileId(
    paneInput.files,
    expandedFolderKeys,
  );
  const normalizedSelectedFileId = normalizeExplorerSelectionFileId(selectedFileId);
  return paneInput.files
    .map((file, index) => {
      const fileId = normalizeExplorerSelectionFileId(file.fileId);
      if (!fileId) {
        return null;
      }

      const target = getExplorerFileUriTarget(file);
      const hasChartData = target
        ? Boolean(sliceService.getUriResult(target))
        : file.hasChartData === true;
      const chartState = target
        ? resolveChartState(
            resolveExplorerFileProcessingState(getSliceUriTargetState(sliceService, target)),
            hasChartData,
          )
        : file.chartState ?? (hasChartData ? "ready" : "none");
      if (!hasTraceChartTargetState(chartState, hasChartData)) {
        return null;
      }

      const fileName = String(file.fileName ?? fileId);
      return {
        chartState,
        fileId,
        fileName,
        hasChartData,
        index,
        label: fileName,
        rowIndex: rowIndicesByFileId.get(fileId) ?? index,
        selected: normalizedSelectedFileId === fileId,
        source: "trace-api",
      } satisfies TemplateApplyPerformanceTraceChartTarget;
    })
    .filter((target): target is TemplateApplyPerformanceTraceChartTarget => Boolean(target));
};

const createTraceRowIndicesByFileId = (
  files: readonly ExplorerFileEntry[],
  expandedFolderKeys: readonly string[],
): ReadonlyMap<string, number> => {
  const rowIndicesByFileId = new Map<string, number>();
  const expandedFolderKeySet = new Set(expandedFolderKeys);
  const shouldTreatFoldersAsExpanded = expandedFolderKeySet.size === 0;
  let rowIndex = 0;

  const visit = (nodes: readonly ExplorerTreeNode<ExplorerFileEntry>[]): void => {
    for (const node of nodes) {
      const currentRowIndex = rowIndex;
      rowIndex += 1;
      if (node.kind === "file") {
        const fileId = String(node.entry?.fileId ?? "").trim();
        if (fileId && !rowIndicesByFileId.has(fileId)) {
          rowIndicesByFileId.set(fileId, currentRowIndex);
        }
        continue;
      }

      if (
        node.children?.length &&
        (shouldTreatFoldersAsExpanded || expandedFolderKeySet.has(node.key))
      ) {
        visit(node.children);
      }
    }
  };

  visit(buildExplorerTree(files));
  return rowIndicesByFileId;
};

export const shouldPrefetchExplorerThumbnails = ({
  activeWorkbenchMainPart,
  viewLayout,
}: {
  readonly activeWorkbenchMainPart: WorkbenchMainPart;
  readonly viewLayout: IExplorerService["viewLayout"];
}): boolean =>
  activeWorkbenchMainPart === "chart" && viewLayout === "thumbnail";

type CreateExplorerPaneInputOptions = {
  readonly activePlotType: PlotType;
  readonly explorerService: IExplorerService;
  readonly mode: WorkbenchMainPart;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotService: Pick<IPlotService, "getCalculatedData">;
  readonly sessionFacts: SessionExplorerFacts;
  readonly sliceService?: Pick<ISliceService, "getUriResult" | "getUriState">;
  readonly sliceState: SliceState;
};

type ExplorerDomainSelection = {
  readonly selectedRawFileId: string | null;
  readonly selectedRawItemKey: string | null;
  readonly selectedProcessedFileId: string | null;
  readonly selectedProcessedItemKey: string | null;
};

type ExplorerItemIdentity = {
  readonly fileId: string;
  readonly itemKey: string | null;
};

type ExplorerDomainSelectionInput = {
  readonly rawSources: readonly ExplorerItemIdentity[];
};

type ExplorerSelectionState = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
  | "selectedProcessedItemKey"
  | "selectedRawFileId"
  | "selectedRawItemKey"
>;

const createExplorerDomainSelectionInput = (
  sessionFacts: SessionExplorerFacts,
  paneFiles: readonly ExplorerFileEntry[] = [],
): ExplorerDomainSelectionInput => ({
  rawSources: mergeExplorerItemIdentities(
    sessionFacts.rawExplorerFiles.flatMap(file => {
      const fileId = normalizeExplorerSelectionFileId(file.fileId);
      return fileId
        ? [{
            fileId,
            itemKey: getRawFileItemKey(file),
          }]
        : [];
    }),
    paneFiles.flatMap(file => {
      const fileId = normalizeExplorerSelectionFileId(file.fileId);
      return fileId && hasExplorerFileResource(file)
        ? [{
            fileId,
            itemKey: getExplorerFileItemKey(file),
          }]
        : [];
    }),
  ),
});

const mergeExplorerItemIdentities = (
  sessionSources: readonly ExplorerItemIdentity[],
  localSources: readonly ExplorerItemIdentity[],
): readonly ExplorerItemIdentity[] => {
  if (!localSources.length) {
    return sessionSources;
  }

  const result = [...sessionSources];
  const seen = new Set(result.map(getExplorerItemIdentityKey));
  for (const source of localSources) {
    const key = getExplorerItemIdentityKey(source);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(source);
  }
  return result;
};

const getExplorerItemIdentityKey = (
  source: ExplorerItemIdentity,
): string => `${source.fileId}\u0000${source.itemKey ?? ""}`;

export const resolveExplorerDomainSelection = (
  explorerService: ExplorerSelectionState,
  sessionFacts: SessionExplorerFacts,
  paneFiles: readonly ExplorerFileEntry[] = [],
): ExplorerDomainSelection => {
  const input = createExplorerDomainSelectionInput(sessionFacts, paneFiles);
  const selectedFileId = resolveExplorerSelectedFileId(
    getExplorerSelectedFileId(explorerService),
    input.rawSources.map(source => source.fileId),
  );
  const selectedItemKey = resolveExplorerSelectedItemKey(
    getExplorerSelectedItemKey(explorerService),
    selectedFileId,
    input.rawSources,
  );
  return {
    selectedProcessedFileId: selectedFileId,
    selectedProcessedItemKey: selectedItemKey,
    selectedRawFileId: selectedFileId,
    selectedRawItemKey: selectedItemKey,
  };
};

export const reconcileExplorerDomainSelection = (
  explorerService: IExplorerService,
  sessionFacts: SessionExplorerFacts,
  kind: ExplorerSelectionKind = "table",
): ExplorerDomainSelection => {
  const input = createExplorerDomainSelectionInput(
    sessionFacts,
    explorerService.getPaneInput()?.files ?? [],
  );
  const selectedFileId = reconcileExplorerSelectedFileId(
    explorerService,
    kind,
    getExplorerSelectedFileId(explorerService),
    input.rawSources,
    getExplorerSelectedItemKey(explorerService),
  );
  const selectedItemKey = resolveExplorerSelectedItemKey(
    getExplorerSelectedItemKey(explorerService),
    selectedFileId,
    input.rawSources,
  );

  return {
    selectedProcessedFileId: selectedFileId,
    selectedProcessedItemKey: selectedItemKey,
    selectedRawFileId: selectedFileId,
    selectedRawItemKey: selectedItemKey,
  };
};

export const createExplorerPaneInput = ({
  activePlotType,
  explorerService,
  mode,
  originOpenPlotOptions,
  plotAxisSettings,
  sessionFacts,
  sliceService,
  sliceState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
  const isChartMode = mode === "chart";
  const isThumbnailLayout = isChartMode && explorerService.viewLayout === "thumbnail";
  const selectionKind: ExplorerSelectionKind = isChartMode ? "chart" : "table";
  const rawExplorerFilesWithResourceRows = mergeExplorerPaneResourceFiles(
    sessionFacts.rawExplorerFiles,
    explorerService.getPaneInput()?.files ?? [],
  );
  const chartDataFileIds = mergeChartDataFileIds(
    sessionFacts.chartDataFileIds,
    rawExplorerFilesWithResourceRows,
    sliceService,
  );
  const chartBaseFiles = isThumbnailLayout
    ? filterExplorerFilesByChartDataIds(rawExplorerFilesWithResourceRows, chartDataFileIds)
    : rawExplorerFilesWithResourceRows;
  const files = applyChartExplorerStates(chartBaseFiles, {
      chartDataFileIds,
      isChartMode,
      sliceService,
      sliceState,
    });
  const fileIds = getExplorerPaneFileIds(files);
  const selectionFileIds = fileIds;
  const selectedFileId = resolveVisibleExplorerSelectedFileId(
    getExplorerSelectedFileId(explorerService),
    selectionFileIds,
  );
  const selectedItemKey = resolveVisibleExplorerSelectedItemKey(
    getExplorerSelectedItemKey(explorerService),
    selectedFileId,
    files,
  );
  return {
    activePlotType,
    fileTemplateSelectionsByFileId: sliceState.templateSelectionsByFileId,
    files,
    mode,
    originOpenPlotOptions,
    plotAxisSettings,
    quickAccessFiles: rawExplorerFilesWithResourceRows,
    selectedFileId,
    selectedItemKey,
    selectionKind,
    thumbnailFiles: sessionFacts.thumbnailFiles,
  };
};

const mergeChartDataFileIds = (
  chartDataFileIds: readonly string[],
  explorerFiles: readonly ExplorerFileEntry[],
  sliceService: Pick<ISliceService, "getUriResult"> | undefined,
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (fileId: unknown): void => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId || seen.has(normalizedFileId)) {
      return;
    }

    seen.add(normalizedFileId);
    result.push(normalizedFileId);
  };
  for (const fileId of chartDataFileIds) {
    push(fileId);
  }
  if (sliceService) {
    for (const file of explorerFiles) {
      const target = getExplorerFileUriTarget(file);
      if (target && sliceService.getUriResult(target)) {
        push(file.fileId);
      }
    }
  }
  return result;
};

const reconcileExplorerSelectedFileId = (
  explorerService: Pick<IExplorerService, "select">,
  kind: ExplorerSelectionKind,
  selectedFileId: string | null,
  rawSources: readonly ExplorerItemIdentity[],
  selectedItemKey: string | null,
): string | null => {
  const fileIds = rawSources.map(source => source.fileId);
  const nextSelectedFileId = resolveExplorerSelectedFileId(selectedFileId, fileIds);
  const nextSelectedItemKey = resolveExplorerSelectedItemKey(
    selectedItemKey,
    nextSelectedFileId,
    rawSources,
  );
  explorerService.select({
    candidateFileIds: fileIds,
    candidateItemKeys: rawSources.flatMap(source => source.itemKey ? [source.itemKey] : []),
    fileId: nextSelectedFileId,
    kind,
    itemKey: nextSelectedItemKey,
  });
  return nextSelectedFileId;
};

const getExplorerSelectedFileId = (
  explorerService: ExplorerSelectionState,
): string | null => {
  const normalizedRawFileId = normalizeExplorerSelectionFileId(explorerService.selectedRawFileId);
  if (normalizedRawFileId) {
    return normalizedRawFileId;
  }

  return normalizeExplorerSelectionFileId(explorerService.selectedProcessedFileId);
};

const getExplorerSelectedItemKey = (
  explorerService: ExplorerSelectionState,
): string | null => {
  const normalizedRawItemKey = normalizeExplorerSelectionItemKey(
    explorerService.selectedRawItemKey,
  );
  if (normalizedRawItemKey) {
    return normalizedRawItemKey;
  }

  return normalizeExplorerSelectionItemKey(explorerService.selectedProcessedItemKey);
};

const resolveVisibleExplorerSelectedFileId = (
  selectedFileId: string | null,
  fileIds: readonly string[],
): string | null => {
  const normalizedSelectedFileId = normalizeExplorerSelectionFileId(selectedFileId);
  return normalizedSelectedFileId && fileIds.includes(normalizedSelectedFileId)
    ? normalizedSelectedFileId
    : null;
};

const resolveVisibleExplorerSelectedItemKey = (
  selectedItemKey: string | null,
  selectedFileId: string | null,
  files: readonly ExplorerFileEntry[],
): string | null => {
  const normalizedFileId = normalizeExplorerSelectionFileId(selectedFileId);
  if (!normalizedFileId) {
    return null;
  }

  const itemKey = normalizeExplorerSelectionItemKey(selectedItemKey);
  if (
    itemKey &&
    files.some(file =>
      normalizeExplorerSelectionFileId(file.fileId) === normalizedFileId &&
      normalizeExplorerSelectionItemKey(file.itemKey) === itemKey)
  ) {
    return itemKey;
  }

  return files
    .map(file => ({
      fileId: normalizeExplorerSelectionFileId(file.fileId),
      itemKey: normalizeExplorerSelectionItemKey(file.itemKey),
    }))
    .find(source => source.fileId === normalizedFileId)?.itemKey ?? null;
};

const resolveExplorerSelectedItemKey = (
  selectedItemKey: string | null,
  selectedFileId: string | null,
  rawSources: readonly ExplorerItemIdentity[],
): string | null => {
  const normalizedFileId = normalizeExplorerSelectionFileId(selectedFileId);
  if (!normalizedFileId) {
    return null;
  }

  const normalizedItemKey = normalizeExplorerSelectionItemKey(selectedItemKey);
  if (
    normalizedItemKey &&
    rawSources.some(source =>
      source.fileId === normalizedFileId &&
      source.itemKey === normalizedItemKey)
  ) {
    return normalizedItemKey;
  }

  return rawSources.find(source => source.fileId === normalizedFileId)?.itemKey ?? null;
};

const normalizeExplorerSelectionFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const normalizeExplorerSelectionItemKey = (itemKey: unknown): string | null => {
  const normalized = String(itemKey ?? "").trim();
  return normalized || null;
};

const getRawFileItemKey = (
  file: { readonly itemKey?: string | null; readonly tableKey?: string | null },
): string | null =>
  normalizeExplorerSelectionItemKey(file.itemKey) ??
  normalizeExplorerSelectionItemKey(file.tableKey);

const getExplorerFileItemKey = (
  file: Pick<ExplorerFileEntry, "itemKey" | "sheetId">,
): string | null =>
  normalizeExplorerSelectionItemKey(file.itemKey) ??
  normalizeExplorerSelectionItemKey(file.sheetId);

const getExplorerPaneFileIds = (
  files: readonly { readonly fileId?: string | null }[],
): readonly string[] => {
  return files
    .map(file => String(file.fileId ?? "").trim())
    .filter(fileId => fileId.length > 0);
};

const filterExplorerFilesByChartDataIds = (
  files: readonly ExplorerFileEntry[],
  chartDataFileIds: readonly string[],
): ExplorerFileEntry[] => {
  const chartDataFileIdSet = new Set(
    chartDataFileIds
      .map(fileId => String(fileId ?? "").trim())
      .filter(Boolean),
  );
  if (!chartDataFileIdSet.size) {
    return [];
  }

  return files.filter(file => chartDataFileIdSet.has(String(file.fileId ?? "").trim()));
};

const mergeExplorerPaneResourceFiles = (
  sessionFiles: readonly ExplorerFileEntry[],
  currentFiles: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] => {
  const resourceFiles = currentFiles.filter(hasExplorerFileResource);
  if (!resourceFiles.length) {
    return sessionFiles as ExplorerFileEntry[];
  }

  const pendingResourceFiles = new Map<string, ExplorerFileEntry>();
  const unscopedResourceFilesByFileId = new Map<string, ExplorerFileEntry>();
  for (const file of resourceFiles) {
    const key = getExplorerPaneFileKey(file);
    if (!key || pendingResourceFiles.has(key)) {
      continue;
    }

    pendingResourceFiles.set(key, file);
    const fileId = normalizeExplorerSelectionFileId(file.fileId);
    if (fileId && !getExplorerFileItemKey(file) && !unscopedResourceFilesByFileId.has(fileId)) {
      unscopedResourceFilesByFileId.set(fileId, file);
    }
  }

  const result = sessionFiles.map(file => {
    const key = getExplorerPaneFileKey(file);
    const resourceFile = key ? pendingResourceFiles.get(key) : undefined;
    if (resourceFile) {
      pendingResourceFiles.delete(key);
      return resourceFile;
    }

    const fileId = normalizeExplorerSelectionFileId(file.fileId);
    const unscopedResourceFile = fileId ? unscopedResourceFilesByFileId.get(fileId) : undefined;
    if (unscopedResourceFile) {
      unscopedResourceFilesByFileId.delete(fileId);
      pendingResourceFiles.delete(getExplorerPaneFileKey(unscopedResourceFile));
      return unscopedResourceFile;
    }

    return file;
  });
  return [
    ...result,
    ...pendingResourceFiles.values(),
  ];
};

const getExplorerPaneFileKey = (file: ExplorerFileEntry): string => {
  const itemKey = getExplorerFileItemKey(file);
  if (itemKey) {
    return `item:${itemKey}`;
  }

  const fileId = normalizeExplorerSelectionFileId(file.fileId);
  return fileId ? `file:${fileId}` : `item:${String(file.itemKey ?? "")}`;
};

const hasExplorerFileResource = (file: ExplorerFileEntry): boolean =>
  Boolean(getExplorerFileResource(file));

const getExplorerFileChartTargetId = (
  file: ExplorerFileEntry,
): string | null =>
  normalizeExplorerSelectionFileId(file.fileId);

const getExplorerFileUriTarget = (
  file: ExplorerFileEntry,
): SliceUriTarget | null => {
  if (!file.resource) {
    return null;
  }

  const resource = URI.revive(file.resource);
  if (!resource) {
    return null;
  }

  return {
    resource,
    sheetId: normalizeExplorerSelectionItemKey(file.sheetId),
  };
};

const getSliceUriTargetState = (
  sliceService: Pick<ISliceService, "getUriState"> | undefined,
  target: SliceUriTarget,
): SliceFileState | undefined => {
  return sliceService?.getUriState(target);
};

const getSliceUriTargetForChartFileId = (
  sliceService: Pick<ISliceService, "getUriResult">,
  explorerFiles: readonly ExplorerFileEntry[],
  chartFileId: string | null,
): SliceUriTarget | null => {
  const normalizedChartFileId = normalizeExplorerSelectionFileId(chartFileId);
  if (!normalizedChartFileId) {
    return null;
  }

  for (const file of explorerFiles) {
    if (normalizeExplorerSelectionFileId(file.fileId) !== normalizedChartFileId) {
      continue;
    }
    const target = getExplorerFileUriTarget(file);
    if (target && sliceService.getUriResult(target)) {
      return target;
    }
  }
  return null;
};

const hasExplorerUriTargetForChartFileId = (
  explorerFiles: readonly ExplorerFileEntry[],
  chartFileId: string | null,
): boolean => {
  const normalizedChartFileId = normalizeExplorerSelectionFileId(chartFileId);
  if (!normalizedChartFileId) {
    return false;
  }

  return explorerFiles.some(file =>
    normalizeExplorerSelectionFileId(file.fileId) === normalizedChartFileId &&
    Boolean(getExplorerFileUriTarget(file))
  );
};

const filterNonUriExplorerFileIds = (
  fileIds: readonly string[],
  explorerFiles: readonly ExplorerFileEntry[],
): readonly string[] => {
  if (!explorerFiles.length) {
    return fileIds;
  }

  return fileIds.filter(fileId => !hasExplorerUriTargetForChartFileId(explorerFiles, fileId));
};

const createThumbnailPreviewTargets = (
  fileIds: readonly string[],
  explorerFiles: readonly ExplorerFileEntry[],
): readonly ThumbnailPreviewTarget[] => {
  const result: ThumbnailPreviewTarget[] = [];
  for (const fileId of fileIds) {
    const normalizedFileId = normalizeExplorerSelectionFileId(fileId);
    if (!normalizedFileId) {
      continue;
    }

    const file = explorerFiles.find(candidate =>
      normalizeExplorerSelectionFileId(candidate.fileId) === normalizedFileId
    );
    const target = file ? getExplorerFileUriTarget(file) : null;
    result.push(target
      ? {
          fileId: normalizedFileId,
          target,
        }
      : normalizedFileId);
  }
  return result;
};

const applyChartExplorerStates = (
  files: readonly ExplorerFileEntry[],
  {
    isChartMode,
    chartDataFileIds,
    sliceService,
    sliceState,
  }: {
    readonly chartDataFileIds: readonly string[];
    readonly isChartMode: boolean;
    readonly sliceService?: Pick<ISliceService, "getUriResult" | "getUriState">;
    readonly sliceState: SliceState;
  },
): ExplorerFileEntry[] => {
  if (!isChartMode) {
    return [...files];
  }

  const chartDataFileIdSet = new Set(
    chartDataFileIds
      .map(fileId => String(fileId ?? "").trim())
      .filter(Boolean),
  );
  return files.map(file => {
    const fileId = String(file.fileId ?? "").trim();
    const target = getExplorerFileUriTarget(file);
    const hasChartData = target
      ? Boolean(sliceService?.getUriResult(target))
      : chartDataFileIdSet.has(fileId);
    const ownerState = resolveExplorerFileProcessingState(
      (target ? getSliceUriTargetState(sliceService, target) : undefined) ??
      (fileId ? sliceState.fileStates.get(fileId) : undefined),
    );
    const chartState = resolveChartState(ownerState, hasChartData);
    const chartMessage = getChartStateMessage(ownerState);
    return {
      ...file,
      chartMessage,
      chartState,
      hasChartData,
    };
  });
};

type ExplorerFileProcessingState = SliceFileState;

const resolveExplorerFileProcessingState = (
  sliceState: SliceFileState | undefined,
): ExplorerFileProcessingState | undefined => {
  if (sliceState && sliceState.state !== "none") {
    return sliceState;
  }

  return undefined;
};

const getExplorerPaneTableSourceFiles = (
  sessionFacts: SessionExplorerFacts,
  currentFiles: readonly ExplorerFileEntry[],
): readonly ExplorerFileEntry[] =>
  mergeExplorerPaneResourceFiles(
    createRawExplorerFiles(sessionFacts.rawExplorerFiles),
    currentFiles,
  );

const resolveChartState = (
  applyState: ExplorerFileProcessingState | undefined,
  hasChartData: boolean,
): NonNullable<ExplorerFileEntry["chartState"]> => {
  if (hasChartData) {
    return "ready";
  }
  if (applyState?.state === "queued" || applyState?.state === "processing") {
    return applyState.state;
  }
  if (applyState?.state === "failed" || applyState?.state === "skipped") {
    return applyState.state;
  }

  return "none";
};

const getChartStateMessage = (
  applyState: ExplorerFileProcessingState | undefined,
): string | null => {
  if (applyState?.state === "failed" || applyState?.state === "skipped") {
    return applyState.message;
  }

  return null;
};

const createExplorerPaneTableSource = (
  selection: Pick<ExplorerDomainSelection, "selectedRawFileId" | "selectedRawItemKey">,
  files: readonly ExplorerFileEntry[],
): TableSource | null => {
  const fileId = normalizeExplorerSelectionFileId(selection.selectedRawFileId);
  if (!fileId) {
    return null;
  }

  const file = findExplorerFileBySelection(
    files,
    fileId,
    normalizeExplorerSelectionItemKey(selection.selectedRawItemKey),
  );
  const resource = getExplorerFileResource(file);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeExplorerSelectionItemKey(file?.sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const findExplorerFileBySelection = (
  files: readonly ExplorerFileEntry[],
  fileId: string,
  itemKey: string | null,
): ExplorerFileEntry | null => {
  const candidates = files.filter(file =>
    normalizeExplorerSelectionFileId(file.fileId) === fileId
  );
  if (!candidates.length) {
    return null;
  }

  if (itemKey) {
    return candidates.find(file =>
      normalizeExplorerSelectionItemKey(file.itemKey) === itemKey ||
      normalizeExplorerSelectionItemKey(file.sheetId) === itemKey
    ) ?? candidates[0] ?? null;
  }

  return candidates[0] ?? null;
};

const getExplorerFileResource = (file: ExplorerFileEntry | null): URI | null => {
  if (!file?.resource) {
    return null;
  }

  return URI.revive(file.resource) ?? null;
};
