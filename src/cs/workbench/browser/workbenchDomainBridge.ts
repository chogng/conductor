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
    this._register(this.options.explorerService.onDidChangeSelection(event => {
      this.prioritizeProcessingFile(
        getExplorerFileIdForResourceTarget(
          this.options.explorerService.getPaneInput()?.files ?? [],
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
          this.options.explorerService.getPaneInput()?.files ?? [],
          event.target,
        ),
        "hover",
      );
    }));
    this._register(this.options.explorerService.onDidChangeVisibleFileIds(event => {
      this.prioritizeVisibleExplorerFiles(event.visibleFileIds, event.nearbyFileIds);
    }));
    this._register(this.options.plotService.onDidChangePlotState(() => this.scheduleSync()));
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

    const explorerResourceFiles = getExplorerResourceFiles(
      this.options.explorerService.getPaneInput()?.files ?? [],
    );
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

    const resourceIdentities = createExplorerResourceIdentities(paneInput.files);
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
    const tableSource = createExplorerPaneTableSource(selectedIdentity, paneInput.files);
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
    if (paneInput?.mode !== "chart" || !paneInput.files.some(hasExplorerFileResource)) {
      return false;
    }

    const selectedIdentity = resolveExplorerSelectedResourceIdentity(
      getExplorerSelectedResourceTarget(this.options.explorerService) ?? {
        resource: paneInput.selectedResource,
        sheetId: paneInput.selectedSheetId ?? null,
      },
      createExplorerResourceIdentities(paneInput.files.filter(hasExplorerFileResource)),
    );
    const selectedChartFileId = selectedIdentity?.fileId ?? null;
    const target = getSliceUriTargetForChartFileId(
      this.options.sliceService,
      paneInput.files,
      selectedChartFileId,
    );
    if (!selectedChartFileId || !target) {
      return false;
    }

    this.options.explorerService.select({
      candidateResources: createExplorerResourceIdentities(paneInput.files).map(toExplorerResourceTarget),
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
      activeTarget: target,
      chartFileOptions: createExplorerChartFileOptions(selectedChartFileId, paneInput.files),
      hasChartData: true,
      showFileSelect: false,
      shouldMountCharts: false,
    });
    this.options.plotService.prefetchPlotDisplayModel({
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

    const explorerResourceFiles = getExplorerResourceFiles(
      this.options.explorerService.getPaneInput()?.files ?? [],
    );
    const endPerf = startPerf("workbenchDomainBridge.deferredSync", {
      explorerFileCount: explorerResourceFiles.length,
    });
    const explorerSelection = resolveExplorerDomainSelection(
      this.options.explorerService,
      this.options.explorerService.getPaneInput()?.files ?? [],
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
    const explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [];
    this.options.explorerService.updatePaneInput(this.getExplorerPaneInput(
      sliceState,
    ));
    const chartViewInput = this.getChartViewInput(
      explorerFiles,
      explorerSelection.chartFileId,
    );
    if (chartViewInput.activeFileId && chartViewInput.hasChartData) {
      if (!chartViewInput.activeTarget) {
        this.options.calculationService.prioritizeCalculationFile(chartViewInput.activeFileId);
      }
      const plotType = chartViewInput.activePlotType ?? this.options.plotService.getState().activePlotType;
      const input = chartViewInput.activeTarget
        ? {
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
    sliceState: SliceState = this.options.sliceService.getState(),
  ): ExplorerPaneInput {
    const conductorSettings = this.options.settingsService.getConductorSettings();
    return createExplorerPaneInput({
      activePlotType: this.options.plotService.getState().activePlotType,
      explorerService: this.options.explorerService,
      mode: this.options.layoutService.activeWorkbenchMainPart,
      originOpenPlotOptions: getOriginOpenPlotOptions(conductorSettings),
      plotAxisSettings: conductorSettings?.plotAxisSettings,
      sliceService: this.options.sliceService,
      sliceState,
    });
  }

  private getChartViewInput(
    explorerFiles = this.options.explorerService.getPaneInput()?.files ?? [],
    activeFileId = resolveExplorerDomainSelection(
      this.options.explorerService,
      explorerFiles,
    ).chartFileId,
  ) {
    const chartActiveFileId = resolveChartSelectedFileId(
      activeFileId,
      getChartCandidateFileIds(this.options.sliceService, explorerFiles),
    );
    const activeTarget = getSliceUriTargetForChartFileId(
      this.options.sliceService,
      explorerFiles,
      chartActiveFileId,
    );
    const hasActiveChartData = Boolean(
      chartActiveFileId && activeTarget,
    );
    const chartFileOptions = createActiveChartFileOptions(
      chartActiveFileId,
      explorerFiles,
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

  private pruneRecentInteractiveChartTargets(): void {
    const explorerFileIds = new Set(
      getExplorerPaneFileIds(
        (this.options.explorerService.getPaneInput()?.files ?? [])
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
    const visibleCalculationFileIds = filterFileIdsWithoutUriTargets(visibleFileIds, explorerFiles);
    const nearbyCalculationFileIds = filterFileIdsWithoutUriTargets(nearbyFileIds, explorerFiles);
    const visibleThumbnailTargets = createThumbnailPreviewTargets(visibleFileIds, explorerFiles);
    const nearbyThumbnailTargets = createThumbnailPreviewTargets(nearbyFileIds, explorerFiles);
    if (visibleCalculationFileIds.length) {
      this.options.calculationService.prioritizeCalculationFiles(visibleCalculationFileIds);
    }
    if (nearbyCalculationFileIds.length) {
      this.options.calculationService.prioritizeCalculationFiles(nearbyCalculationFileIds);
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
    const file = paneInput?.files.find(candidate =>
      normalizeExplorerSelectionFileId(candidate.fileId) === normalizedFileId
    ) ?? null;
    const selectedTarget = getExplorerFileResourceIdentity(file);
    const acceptedTarget = this.options.explorerService.select({
      candidateResources: createExplorerResourceIdentities(paneInput?.files ?? []).map(toExplorerResourceTarget),
      kind: "chart",
      resource: selectedTarget?.resource ?? null,
      sheetId: selectedTarget?.sheetId ?? null,
    }, reveal);
    const acceptedFileId = getExplorerFileIdForResourceTarget(paneInput?.files ?? [], acceptedTarget);
    return acceptedFileId && targets.some(target => target.fileId === acceptedFileId)
      ? acceptedFileId
      : null;
  }

  private getPerformanceTraceSelectedChartTargetFileId(): string | null {
    return getExplorerFileIdForResourceTarget(
      this.options.explorerService.getPaneInput()?.files ?? [],
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
    const file = paneInput?.files.find(candidate =>
      normalizeExplorerSelectionFileId(candidate.fileId) === normalizedFileId
    ) ?? null;
    const target = getExplorerFileResourceIdentity(file);
    this.options.explorerService.setHoveredResource(target);
    return target ? normalizedFileId : null;
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
  sliceService: Pick<ISliceService, "getUriResult">,
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
  selectedTarget,
  sliceService,
}: {
  readonly expandedFolderKeys: readonly string[];
  readonly paneInput: ExplorerPaneInput;
  readonly selectedTarget?: ExplorerResourceTarget | null;
  readonly sliceService: Pick<ISliceService, "getUriResult" | "getUriState">;
}): readonly TemplateApplyPerformanceTraceChartTarget[] => {
  const rowIndicesByFileId = createTraceRowIndicesByFileId(
    paneInput.files,
    expandedFolderKeys,
  );
  const selectedResourceKey = getExplorerResourceIdentityKey(selectedTarget);
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
  readonly sliceService?: Pick<ISliceService, "getUriResult" | "getUriState">;
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
    explorerService.getPaneInput()?.files ?? [],
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
  sliceService,
  sliceState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
  const isChartMode = mode === "chart";
  const isThumbnailLayout = isChartMode && explorerService.viewLayout === "thumbnail";
  const selectionKind: ExplorerSelectionKind = isChartMode ? "chart" : "table";
  const explorerResourceFiles = getExplorerResourceFiles(
    explorerService.getPaneInput()?.files ?? [],
  );
  const chartDataFileIds = mergeChartDataFileIds(
    explorerResourceFiles,
    sliceService,
  );
  const chartBaseFiles = isThumbnailLayout
    ? filterExplorerFilesByChartDataIds(explorerResourceFiles, chartDataFileIds)
    : explorerResourceFiles;
  const files = applyChartExplorerStates(chartBaseFiles, {
    chartDataFileIds,
    isChartMode,
    sliceService,
  });
  const selectedTarget = resolveVisibleExplorerSelectedResourceTarget(
    getExplorerSelectedResourceTarget(explorerService),
    files,
  );
  return {
    activePlotType,
    files,
    mode,
    originOpenPlotOptions,
    plotAxisSettings,
    quickAccessFiles: explorerResourceFiles,
    selectedResource: selectedTarget?.resource ?? null,
    selectedSheetId: selectedTarget?.sheetId ?? null,
    selectionKind,
    templateSelections: sliceState.templateSelections,
    thumbnailFiles: createExplorerThumbnailFiles(files),
  };
};

const createExplorerThumbnailFiles = (
  files: readonly ExplorerFileEntry[],
): readonly ExplorerThumbnailFile[] =>
  files
    .filter(file => file.hasChartData === true)
    .map(file => ({
      curveFilterField: null,
      curveFilterKey: null,
      fileId: file.fileId,
      fileName: file.fileName,
    }));

const mergeChartDataFileIds = (
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

const filterFileIdsWithoutUriTargets = (
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
    result.push(target ?? normalizedFileId);
  }
  return result;
};

const applyChartExplorerStates = (
  files: readonly ExplorerFileEntry[],
  {
    isChartMode,
    chartDataFileIds,
    sliceService,
  }: {
    readonly chartDataFileIds: readonly string[];
    readonly isChartMode: boolean;
    readonly sliceService?: Pick<ISliceService, "getUriResult" | "getUriState">;
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
      target ? getSliceUriTargetState(sliceService, target) : undefined,
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
