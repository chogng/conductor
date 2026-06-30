/*---------------------------------------------------------------------------------------------
 * 这文件不该存在，大杂烩，标记为legacy，接下来的改动，我们要逐步回收这里的逻辑到各自的service里，每次改动都要考虑到这个文件的逻辑，看看有没有可以回收的逻辑
 *--------------------------------------------------------------------------------------------*/

import { runWhenGlobalIdle } from "src/cs/base/common/async";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  type ExplorerPaneInput,
  type ExplorerResourceTarget,
  type ExplorerSelectionKind,
  type IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
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
import type {
  ITableService,
  TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  type ISliceService,
  type SliceFileState,
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

type ResourceSheetIdentity = {
  readonly resource: URI;
  readonly sheetId?: string | null;
};

export type WorkbenchDomainBridgeSyncOptions = {
  readonly deferSecondaryWork?: boolean;
};

export type WorkbenchDomainBridgeOptions = {
  readonly chartService: IChartService;
  readonly calculationService: ICalculationService;
  readonly explorerService: IExplorerService;
  readonly layoutService: IWorkbenchLayoutService;
  readonly plotService: IPlotService;
  readonly settingsService: ISettingsService;
  readonly sliceService: ISliceService;
  readonly tableService: ITableService;
  readonly thumbnailPreviewService: IThumbnailPreviewService;
};

export class WorkbenchDomainBridge extends Disposable {
  private readonly recentInteractiveChartTargetFileIds: string[] = [];

  constructor(
    private readonly options: WorkbenchDomainBridgeOptions,
  ) {
    super();

    this._register(this.options.settingsService.onDidChangeConductorSettings(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangePendingSourceFiles(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangeFiles(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangeSelection(event => {
      this.prioritizeProcessingFile(
        getExplorerFileIdForResourceTarget(
          this.options.explorerService.files,
          {
            resource: event.selectedResource,
            sheetId: event.selectedSheetId ?? null,
          },
        ),
        "active",
      );
      this.scheduleInteractiveSync();
    }));
    this._register(this.options.explorerService.onDidChangeHoveredResource(event => {
      this.prioritizeProcessingFile(
        getExplorerFileIdForResourceTarget(
          this.options.explorerService.files,
          event.target,
        ),
        "hover",
      );
    }));
    this._register(this.options.explorerService.onDidChangeVisibleTargets(event => {
      this.prioritizeVisibleExplorerTargets(event.visibleTargets, event.nearbyTargets);
    }));
    this._register(this.options.plotService.onDidChangePlotState(() => this.scheduleSync()));
    this._register(this.options.sliceService.onDidChangeResourceSliceResult(() => this.scheduleInteractiveSync()));
    this._register(this.options.sliceService.onDidChangeSliceState(() => this.scheduleInteractiveSync()));
    this._register(this.options.layoutService.onDidChangeWorkbenchNavigation(() => this.scheduleSync()));
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

    const explorerResourceFiles = getExplorerResourceFiles(this.options.explorerService.files);
    const endPerf = startPerf("workbenchDomainBridge.sync", {
      deferSecondaryWork,
      explorerFileCount: explorerResourceFiles.length,
    });
    this.pruneRecentInteractiveChartTargets();
    const explorerSelection = reconcileExplorerDomainSelection(
      this.options.explorerService,
      this.options.layoutService.activeWorkbenchMainPart,
    );
    const tableSource = createExplorerPaneTableSource(
      explorerSelection,
      explorerResourceFiles,
    );
    if (tableSource || !explorerSelection.selectedResource) {
      this.options.tableService.open(tableSource);
    }

    if (deferSecondaryWork) {
      this.scheduleDeferredSecondarySync();
      endPerf({
        deferredSecondaryWork: true,
        explorerFileCount: explorerResourceFiles.length,
      });
      return;
    }

    this.syncSecondaryState(explorerSelection);
    endPerf({
      deferredSecondaryWork: false,
      explorerFileCount: explorerResourceFiles.length,
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

    const explorerFiles = this.options.explorerService.files;
    const resourceIdentities = createExplorerResourceIdentities(explorerFiles);
    if (!resourceIdentities.length) {
      return false;
    }

    const selectedIdentity = resolveExplorerSelectedResourceIdentity(
      getExplorerSelectedResourceTarget(this.options.explorerService) ?? {
        resource: paneInput.selectedResource,
        sheetId: paneInput.selectedSheetId ?? null,
      },
      resourceIdentities,
    );
    const tableSource = createExplorerPaneTableSource(selectedIdentity, explorerFiles);
    if (!tableSource) {
      return false;
    }

    this.options.explorerService.select({
      kind: "table",
      candidateResources: resourceIdentities.map(toExplorerResourceTarget),
      resource: selectedIdentity?.resource ?? null,
      sheetId: selectedIdentity?.sheetId ?? null,
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
    const explorerFiles = this.options.explorerService.files;
    if (paneInput?.mode !== "chart" || !explorerFiles.some(hasExplorerFileResource)) {
      return false;
    }

    const selectedIdentity = resolveExplorerSelectedResourceIdentity(
      getExplorerSelectedResourceTarget(this.options.explorerService) ?? {
        resource: paneInput.selectedResource,
        sheetId: paneInput.selectedSheetId ?? null,
      },
      createExplorerResourceIdentities(explorerFiles.filter(hasExplorerFileResource)),
    );
    const selectedChartFileId = selectedIdentity?.fileId ?? null;
    const resourceIdentity = getSliceResourceForChartFileId(
      this.options.sliceService,
      explorerFiles,
      selectedChartFileId,
    );
    if (!selectedChartFileId || !resourceIdentity) {
      return false;
    }

    this.options.explorerService.select({
      candidateResources: createExplorerResourceIdentities(explorerFiles).map(toExplorerResourceTarget),
      kind: "chart",
      resource: selectedIdentity?.resource ?? null,
      sheetId: selectedIdentity?.sheetId ?? null,
    });

    if (deferSecondaryWork) {
      this.scheduleDeferredSecondarySync();
      return true;
    }

    const activePlotType = this.options.plotService.getState().activePlotType;
    const chartViewInput = createChartViewInput({
      activeFileId: selectedChartFileId,
      activePlotType,
      activeResource: resourceIdentity.resource,
      activeSheetId: resourceIdentity.sheetId ?? null,
      chartFileOptions: createExplorerChartFileOptions(selectedChartFileId, explorerFiles),
      hasChartData: true,
      showFileSelect: false,
      shouldMountCharts: false,
    });
    this.options.plotService.prefetchPlotDisplayModel({
      plotType: activePlotType,
      resource: resourceIdentity.resource,
      sheetId: resourceIdentity.sheetId ?? null,
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

    const explorerResourceFiles = getExplorerResourceFiles(this.options.explorerService.files);
    const endPerf = startPerf("workbenchDomainBridge.deferredSync", {
      explorerFileCount: explorerResourceFiles.length,
    });
    const explorerSelection = resolveExplorerDomainSelection(
      this.options.explorerService,
      this.options.explorerService.files,
    );
    this.syncSecondaryState(explorerSelection);
    endPerf({
      explorerFileCount: explorerResourceFiles.length,
    });
  }

  private syncSecondaryState(
    explorerSelection: ExplorerDomainSelection,
  ): void {
    const sliceState = this.options.sliceService.getState();
    const explorerFiles = this.options.explorerService.files;
    this.options.explorerService.updatePaneInput(this.getExplorerPaneInput(
      sliceState,
    ));
    const chartViewInput = this.getChartViewInput(
      explorerFiles,
      explorerSelection.chartFileId,
    );
    if (chartViewInput.activeFileId && chartViewInput.hasChartData) {
      if (!chartViewInput.activeResource) {
        this.options.calculationService.prioritizeCalculationFile(chartViewInput.activeFileId);
      }
      const plotType = chartViewInput.activePlotType ?? this.options.plotService.getState().activePlotType;
      const input = chartViewInput.activeResource
        ? {
          plotType,
          resource: chartViewInput.activeResource,
          sheetId: chartViewInput.activeSheetId ?? null,
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
    sliceState: SliceState = this.options.sliceService.getState(),
  ): ExplorerPaneInput {
    const conductorSettings = this.options.settingsService.getConductorSettings();
    return createExplorerPaneInput({
      activePlotType: this.options.plotService.getState().activePlotType,
      explorerService: this.options.explorerService,
      mode: this.options.layoutService.activeWorkbenchMainPart,
      originOpenPlotOptions: getOriginOpenPlotOptions(conductorSettings),
      plotAxisSettings: conductorSettings?.plotAxisSettings,
      sliceState,
    });
  }

  private getChartViewInput(
    explorerFiles = this.options.explorerService.files,
    activeFileId = resolveExplorerDomainSelection(
      this.options.explorerService,
      explorerFiles,
    ).chartFileId,
  ) {
    const chartActiveFileId = resolveChartSelectedFileId(
      activeFileId,
      getChartCandidateFileIds(this.options.sliceService, explorerFiles),
    );
    const activeResource = getSliceResourceForChartFileId(
      this.options.sliceService,
      explorerFiles,
      chartActiveFileId,
    );
    const hasActiveChartData = Boolean(
      chartActiveFileId && activeResource,
    );
    const chartFileOptions = createActiveChartFileOptions(
      chartActiveFileId,
      explorerFiles,
    );
    return createChartViewInput({
      activeFileId: chartActiveFileId,
      activeResource: activeResource?.resource ?? null,
      activeSheetId: activeResource?.sheetId ?? null,
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
    const explorerFiles = this.options.explorerService.files;
    const hasResource = hasExplorerResourceForChartFileId(
      explorerFiles,
      normalizedFileId,
    );
    const activeResource = getSliceResourceForChartFileId(
      this.options.sliceService,
      explorerFiles,
      normalizedFileId,
    );
    if (!hasResource && !activeResource) {
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

    const explorerFiles = this.options.explorerService.files;
    this.prefetchPlotDisplayTargets(
      recentFileIds,
      "recent",
      "recentInteractiveTargets",
    );
    const thumbnailTargets = createThumbnailPreviewTargetsForExplorerFileIds(recentFileIds, explorerFiles);
    if (thumbnailTargets.length) {
      this.options.thumbnailPreviewService.prefetch(thumbnailTargets, "recent");
    }
  }

  private pruneRecentInteractiveChartTargets(): void {
    const explorerFileIds = new Set(
      getExplorerPaneFileIds(
        this.options.explorerService.files
          .filter(hasExplorerFileResource),
      ),
    );
    for (let index = this.recentInteractiveChartTargetFileIds.length - 1; index >= 0; index -= 1) {
      const fileId = this.recentInteractiveChartTargetFileIds[index]!;
      if (!explorerFileIds.has(fileId)) {
        this.recentInteractiveChartTargetFileIds.splice(index, 1);
      }
    }
  }

  private prioritizeVisibleExplorerTargets(
    visibleTargets: readonly ExplorerResourceTarget[],
    nearbyTargets: readonly ExplorerResourceTarget[],
  ): void {
    if (this.options.layoutService.activeWorkbenchMainPart === "chart") {
      this.prefetchPlotDisplayResourceTargets(visibleTargets, "visible", "visibleExplorerTargets");
      this.prefetchPlotDisplayResourceTargets(nearbyTargets, "nearby", "nearbyExplorerTargets");
    }
    if (!shouldPrefetchExplorerThumbnails({
      activeWorkbenchMainPart: this.options.layoutService.activeWorkbenchMainPart,
      viewLayout: this.options.explorerService.viewLayout,
    })) {
      return;
    }

    const visibleThumbnailTargets = createThumbnailPreviewTargets(visibleTargets);
    const nearbyThumbnailTargets = createThumbnailPreviewTargets(nearbyTargets);
    if (visibleThumbnailTargets.length) {
      this.options.thumbnailPreviewService.prefetch(visibleThumbnailTargets, "visible");
    }
    if (nearbyThumbnailTargets.length) {
      this.options.thumbnailPreviewService.prefetch(nearbyThumbnailTargets, "nearby");
    }
  }

  private prefetchPlotDisplayResourceTargets(
    targets: readonly ExplorerResourceTarget[],
    priority: PlotCalculatedDataPrefetchPriority,
    source: string,
  ): void {
    if (this.options.layoutService.activeWorkbenchMainPart !== "chart") {
      return;
    }

    const inputs = createThumbnailPreviewTargets(targets).map(target => ({
      plotType: this.options.plotService.getState().activePlotType,
      resource: target.resource,
      sheetId: target.sheetId ?? null,
    }));
    if (!inputs.length) {
      return;
    }

    const endPerf = startPerf("workbenchDomainBridge.prefetchPlotDisplayTargets", {
      inputCount: inputs.length,
      priority,
      source,
    });
    this.options.plotService.prefetchPlotDisplayModels?.(inputs, priority);
    endPerf({
      inputCount: inputs.length,
      priority,
      source,
    });
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
    const explorerFiles = this.options.explorerService.files;
    const inputs = normalizedFileIds.flatMap(fileId => {
      const hasResource = hasExplorerResourceForChartFileId(explorerFiles, fileId);
      const resource = getSliceResourceForChartFileId(this.options.sliceService, explorerFiles, fileId);
      if (hasResource && !resource) {
        return [];
      }

      if (resource) {
        return {
          plotType,
          resource: resource.resource,
          sheetId: resource.sheetId ?? null,
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
    const visibleFiles = this.getPerformanceTraceVisibleChartFiles(currentPaneInput);
    if (currentPaneInput?.mode === "chart" && visibleFiles.length) {
      return createPerformanceTraceChartTargets({
        expandedFolderKeys: this.options.explorerService.expandedFolderKeys,
        files: visibleFiles,
        selectedTarget: getExplorerSelectedResourceTarget(this.options.explorerService) ?? {
          resource: currentPaneInput.selectedResource,
          sheetId: currentPaneInput.selectedSheetId ?? null,
        },
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
    const paneInput = this.options.explorerService.getPaneInput();
    const visibleFiles = this.getPerformanceTraceVisibleChartFiles(paneInput);
    const file = visibleFiles.find(candidate =>
      normalizeExplorerSelectionFileId(candidate.fileId) === normalizedFileId
    ) ?? null;
    const selectedTarget = getExplorerFileResourceIdentity(file);
    const acceptedTarget = this.options.explorerService.select({
      candidateResources: createExplorerResourceIdentities(visibleFiles).map(toExplorerResourceTarget),
      kind: "chart",
      resource: selectedTarget?.resource ?? null,
      sheetId: selectedTarget?.sheetId ?? null,
    }, reveal);
    const acceptedFileId = getExplorerFileIdForResourceTarget(visibleFiles, acceptedTarget);
    return acceptedFileId && targets.some(target => target.fileId === acceptedFileId)
      ? acceptedFileId
      : null;
  }

  private getPerformanceTraceSelectedChartTargetFileId(): string | null {
    const paneInput = this.options.explorerService.getPaneInput();
    const visibleFiles = this.getPerformanceTraceVisibleChartFiles(paneInput);
    return getExplorerFileIdForResourceTarget(
      visibleFiles,
      getExplorerSelectedResourceTarget(this.options.explorerService),
    );
  }

  private setPerformanceTraceHoveredChartTarget(fileId: string | null): string | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      this.options.explorerService.setHoveredResource(null);
      return null;
    }

    const paneInput = this.options.explorerService.getPaneInput();
    const visibleFiles = this.getPerformanceTraceVisibleChartFiles(paneInput);
    const file = visibleFiles.find(candidate =>
      normalizeExplorerSelectionFileId(candidate.fileId) === normalizedFileId
    ) ?? null;
    const target = getExplorerFileResourceIdentity(file);
    this.options.explorerService.setHoveredResource(target);
    return target ? normalizedFileId : null;
  }

  private getPerformanceTraceVisibleChartFiles(
    paneInput: ExplorerPaneInput | null | undefined,
  ): readonly ExplorerFileEntry[] {
    if (paneInput?.mode !== "chart") {
      return [];
    }

    const files = this.options.explorerService.files;
    if (this.options.explorerService.viewLayout !== "thumbnail") {
      return files;
    }

    return files.filter(file => isSliceChartTargetFile(file, this.options.sliceService));
  }
}

const createActiveChartFileOptions = (
  activeFileId: string | null,
  explorerFiles: readonly ExplorerFileEntry[] = [],
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
  sliceService: Pick<ISliceService, "getResourceResult">,
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

  for (const file of explorerFiles) {
    push(getExplorerFileChartTargetId(file));
    const resource = getExplorerFileResourceSheet(file);
    if (resource && sliceService.getResourceResult(resource.resource, resource.sheetId)) {
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

const isSliceChartTargetFile = (
  file: ExplorerFileEntry,
  sliceService: Pick<ISliceService, "getResourceResult" | "getResourceState">,
): boolean => {
  const resource = getExplorerFileResourceSheet(file);
  if (!resource) {
    const hasChartData = file.hasChartData === true;
    return hasTraceChartTargetState(
      file.chartState ?? (hasChartData ? "ready" : "none"),
      hasChartData,
    );
  }

  return Boolean(sliceService.getResourceResult(resource.resource, resource.sheetId)) ||
    isSliceChartTargetState(sliceService.getResourceState(resource.resource, resource.sheetId));
};

const createPerformanceTraceChartTargets = ({
  expandedFolderKeys,
  files,
  selectedTarget,
  sliceService,
}: {
  readonly expandedFolderKeys: readonly string[];
  readonly files: readonly ExplorerFileEntry[];
  readonly selectedTarget?: ExplorerResourceTarget | null;
  readonly sliceService: Pick<ISliceService, "getResourceResult" | "getResourceState">;
}): readonly TemplateApplyPerformanceTraceChartTarget[] => {
  const rowIndicesByFileId = createTraceRowIndicesByFileId(
    files,
    expandedFolderKeys,
  );
  const selectedResourceKey = getExplorerResourceIdentityKey(selectedTarget);
  return files
    .map((file, index) => {
      const fileId = normalizeExplorerSelectionFileId(file.fileId);
      if (!fileId) {
        return null;
      }

      const resource = getExplorerFileResourceSheet(file);
      const hasChartData = resource
        ? Boolean(sliceService.getResourceResult(resource.resource, resource.sheetId))
        : file.hasChartData === true;
      const chartState = resource
        ? resolveChartState(
            resolveExplorerFileProcessingState(getSliceResourceState(sliceService, resource)),
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
        selected: selectedResourceKey === getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)),
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
  readonly sliceState: SliceState;
};

type ExplorerDomainSelection = {
  readonly selectedResource: URI | null;
  readonly selectedSheetId: string | null;
  readonly tableFileId: string | null;
  readonly chartFileId: string | null;
};

type ExplorerResourceFileIdentity = {
  readonly fileId: string;
  readonly resource: URI;
  readonly sheetId: string | null;
};

type ExplorerDomainSelectionInput = {
  readonly rawSources: readonly ExplorerResourceFileIdentity[];
};

type ExplorerSelectionState = Pick<
  IExplorerService,
  | "selectedResource"
  | "selectedSheetId"
>;

const createExplorerDomainSelectionInput = (
  paneFiles: readonly ExplorerFileEntry[] = [],
): ExplorerDomainSelectionInput => ({
  rawSources: createExplorerResourceIdentities(paneFiles),
});

export const resolveExplorerDomainSelection = (
  explorerService: ExplorerSelectionState,
  paneFiles: readonly ExplorerFileEntry[] = [],
): ExplorerDomainSelection => {
  const input = createExplorerDomainSelectionInput(paneFiles);
  const selectedIdentity = resolveExplorerSelectedResourceIdentity(
    getExplorerSelectedResourceTarget(explorerService),
    input.rawSources,
  );
  return {
    chartFileId: selectedIdentity?.fileId ?? null,
    selectedResource: selectedIdentity?.resource ?? null,
    selectedSheetId: selectedIdentity?.sheetId ?? null,
    tableFileId: selectedIdentity?.fileId ?? null,
  };
};

export const reconcileExplorerDomainSelection = (
  explorerService: IExplorerService,
  kind: ExplorerSelectionKind = "table",
): ExplorerDomainSelection => {
  const input = createExplorerDomainSelectionInput(
    explorerService.files,
  );
  const selectedIdentity = reconcileExplorerSelectedResourceTarget(
    explorerService,
    kind,
    getExplorerSelectedResourceTarget(explorerService),
    input.rawSources,
  );

  return {
    chartFileId: selectedIdentity?.fileId ?? null,
    selectedResource: selectedIdentity?.resource ?? null,
    selectedSheetId: selectedIdentity?.sheetId ?? null,
    tableFileId: selectedIdentity?.fileId ?? null,
  };
};

export const createExplorerPaneInput = ({
  activePlotType,
  explorerService,
  mode,
  originOpenPlotOptions,
  plotAxisSettings,
  sliceState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
  const isChartMode = mode === "chart";
  const selectionKind: ExplorerSelectionKind = isChartMode ? "chart" : "table";
  const explorerResourceFiles = getExplorerResourceFiles(
    explorerService.files,
  );
  const selectedTarget = resolveVisibleExplorerSelectedResourceTarget(
    getExplorerSelectedResourceTarget(explorerService),
    explorerResourceFiles,
  );
  return {
    activePlotType,
    mode,
    originOpenPlotOptions,
    plotAxisSettings,
    selectedResource: selectedTarget?.resource ?? null,
    selectedSheetId: selectedTarget?.sheetId ?? null,
    selectionKind,
    templateSelections: sliceState.templateSelections,
  };
};

const reconcileExplorerSelectedResourceTarget = (
  explorerService: Pick<IExplorerService, "select">,
  kind: ExplorerSelectionKind,
  selectedTarget: ExplorerResourceTarget | null,
  rawSources: readonly ExplorerResourceFileIdentity[],
): ExplorerResourceFileIdentity | null => {
  const selectedIdentity = resolveExplorerSelectedResourceIdentity(
    selectedTarget,
    rawSources,
  );
  explorerService.select({
    candidateResources: rawSources.map(toExplorerResourceTarget),
    kind,
    resource: selectedIdentity?.resource ?? null,
    sheetId: selectedIdentity?.sheetId ?? null,
  });
  return selectedIdentity;
};

const getExplorerSelectedResourceTarget = (
  explorerService: ExplorerSelectionState,
): ExplorerResourceTarget | null => {
  if (!explorerService.selectedResource) {
    return null;
  }

  return {
    resource: explorerService.selectedResource,
    sheetId: explorerService.selectedSheetId ?? null,
  };
};

const createExplorerResourceIdentities = (
  paneFiles: readonly ExplorerFileEntry[] = [],
): readonly ExplorerResourceFileIdentity[] => {
  const result: ExplorerResourceFileIdentity[] = [];
  const seen = new Set<string>();
  for (const file of paneFiles) {
    const fileId = normalizeExplorerSelectionFileId(file.fileId);
    const target = getExplorerFileResourceIdentity(file);
    const key = getExplorerResourceIdentityKey(target);
    if (!fileId || !target?.resource || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      fileId,
      resource: target.resource,
      sheetId: target.sheetId ?? null,
    });
  }
  return result;
};

const resolveExplorerSelectedResourceIdentity = (
  selectedTarget: ExplorerResourceTarget | null | undefined,
  rawSources: readonly ExplorerResourceFileIdentity[],
): ExplorerResourceFileIdentity | null => {
  const selectedKey = getExplorerResourceIdentityKey(selectedTarget);
  if (selectedKey) {
    const selectedIdentity = rawSources.find(source =>
      getExplorerResourceIdentityKey(source) === selectedKey);
    if (selectedIdentity) {
      return selectedIdentity;
    }
  }

  return rawSources[0] ?? null;
};

const resolveVisibleExplorerSelectedResourceTarget = (
  selectedTarget: ExplorerResourceTarget | null,
  files: readonly ExplorerFileEntry[],
): ExplorerResourceTarget | null => {
  const selectedKey = getExplorerResourceIdentityKey(selectedTarget);
  if (!selectedKey) {
    return null;
  }

  const visibleTarget = createExplorerResourceIdentities(files)
    .find(identity => getExplorerResourceIdentityKey(identity) === selectedKey);
  return visibleTarget ? toExplorerResourceTarget(visibleTarget) : null;
};

const toExplorerResourceTarget = (
  identity: Pick<ExplorerResourceFileIdentity, "resource" | "sheetId">,
): ExplorerResourceTarget => ({
  resource: identity.resource,
  ...(identity.sheetId ? { sheetId: identity.sheetId } : {}),
});

const getExplorerFileIdForResourceTarget = (
  files: readonly ExplorerFileEntry[],
  target: ExplorerResourceTarget | null | undefined,
): string | null => {
  const targetKey = getExplorerResourceIdentityKey(target);
  if (!targetKey) {
    return null;
  }

  const file = files.find(candidate =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(candidate)) === targetKey);
  return normalizeExplorerSelectionFileId(file?.fileId);
};

const normalizeExplorerSelectionFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const resolveChartSelectedFileId = (
  activeFileId: string | null,
  candidateChartFileIds: readonly string[],
): string | null => {
  const candidates = candidateChartFileIds
    .map(normalizeExplorerSelectionFileId)
    .filter((fileId): fileId is string => Boolean(fileId));
  const normalizedActiveFileId = normalizeExplorerSelectionFileId(activeFileId);
  return normalizedActiveFileId && candidates.includes(normalizedActiveFileId)
    ? normalizedActiveFileId
    : candidates[0] ?? null;
};

const normalizeExplorerSelectionItemKey = (itemKey: unknown): string | null => {
  const normalized = String(itemKey ?? "").trim();
  return normalized || null;
};

const getExplorerPaneFileIds = (
  files: readonly { readonly fileId?: string | null }[],
): readonly string[] => {
  return files
    .map(file => String(file.fileId ?? "").trim())
    .filter(fileId => fileId.length > 0);
};

const getExplorerResourceFiles = (
  files: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] =>
  files.filter(hasExplorerFileResource);

const hasExplorerFileResource = (file: ExplorerFileEntry): boolean =>
  Boolean(getExplorerFileResource(file));

const getExplorerFileChartTargetId = (
  file: ExplorerFileEntry,
): string | null =>
  normalizeExplorerSelectionFileId(file.fileId);

const getExplorerFileResourceSheet = (
  file: ExplorerFileEntry,
): ResourceSheetIdentity | null => {
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

const getSliceResourceState = (
  sliceService: Pick<ISliceService, "getResourceState"> | undefined,
  resource: ResourceSheetIdentity | null,
): SliceFileState | undefined => {
  return resource ? sliceService?.getResourceState(resource.resource, resource.sheetId) : undefined;
};

const getSliceResourceForChartFileId = (
  sliceService: Pick<ISliceService, "getResourceResult">,
  explorerFiles: readonly ExplorerFileEntry[],
  chartFileId: string | null,
): ResourceSheetIdentity | null => {
  const normalizedChartFileId = normalizeExplorerSelectionFileId(chartFileId);
  if (!normalizedChartFileId) {
    return null;
  }

  for (const file of explorerFiles) {
    if (normalizeExplorerSelectionFileId(file.fileId) !== normalizedChartFileId) {
      continue;
    }
    const resource = getExplorerFileResourceSheet(file);
    if (resource && sliceService.getResourceResult(resource.resource, resource.sheetId)) {
      return resource;
    }
  }
  return null;
};

const hasExplorerResourceForChartFileId = (
  explorerFiles: readonly ExplorerFileEntry[],
  chartFileId: string | null,
): boolean => {
  const normalizedChartFileId = normalizeExplorerSelectionFileId(chartFileId);
  if (!normalizedChartFileId) {
    return false;
  }

  return explorerFiles.some(file =>
    normalizeExplorerSelectionFileId(file.fileId) === normalizedChartFileId &&
    Boolean(getExplorerFileResourceSheet(file))
  );
};

const createThumbnailPreviewTargets = (
  targets: readonly ExplorerResourceTarget[],
): readonly ThumbnailPreviewTarget[] =>
  targets
    .map(target => normalizeExplorerResourceSheet(target))
    .filter((resource): resource is ResourceSheetIdentity => Boolean(resource?.resource));

const createThumbnailPreviewTargetsForExplorerFileIds = (
  fileIds: readonly string[],
  explorerFiles: readonly ExplorerFileEntry[],
): readonly ThumbnailPreviewTarget[] => {
  const result: ResourceSheetIdentity[] = [];
  const seen = new Set<string>();
  for (const fileId of fileIds) {
    const normalizedFileId = normalizeExplorerSelectionFileId(fileId);
    if (!normalizedFileId) {
      continue;
    }

    const file = explorerFiles.find(candidate =>
      normalizeExplorerSelectionFileId(candidate.fileId) === normalizedFileId);
    const resource = file ? getExplorerFileResourceSheet(file) : null;
    const key = getExplorerResourceIdentityKey(resource);
    if (!resource || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(resource);
  }
  return result;
};

const normalizeExplorerResourceSheet = (
  target: ExplorerResourceTarget | null | undefined,
): ResourceSheetIdentity | null => {
  const resource = target?.resource ? URI.revive(target.resource) : null;
  if (!resource) {
    return null;
  }

  return {
    resource,
    sheetId: normalizeExplorerSelectionItemKey(target?.sheetId),
  };
};

const isSliceChartTargetState = (state: SliceFileState | undefined): boolean => {
  switch (state?.state) {
    case "queued":
    case "processing":
    case "ready":
      return true;
    default:
      return false;
  }
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

const resolveChartState = (
  applyState: ExplorerFileProcessingState | undefined,
  hasChartData: boolean,
): NonNullable<ExplorerFileEntry["chartState"]> => {
  if (hasChartData) {
    return "ready";
  }
  if (applyState?.state === "ready") {
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

const createExplorerPaneTableSource = (
  selection: Pick<ExplorerDomainSelection, "selectedResource" | "selectedSheetId"> | ExplorerResourceTarget | null,
  files: readonly ExplorerFileEntry[],
): TableSource | null => {
  const selectedTarget = selection && "selectedResource" in selection
    ? {
        resource: selection.selectedResource,
        sheetId: selection.selectedSheetId,
      }
    : selection;
  const selectedKey = getExplorerResourceIdentityKey(selectedTarget);
  if (!selectedKey) {
    return null;
  }

  const file = files.find(candidate =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(candidate)) === selectedKey
  ) ?? null;
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

const getExplorerFileResource = (file: ExplorerFileEntry | null): URI | null => {
  if (!file?.resource) {
    return null;
  }

  return URI.revive(file.resource) ?? null;
};
