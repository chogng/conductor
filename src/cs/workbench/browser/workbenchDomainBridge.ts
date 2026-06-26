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
  createChartExplorerFilesFromRecords,
  createRawExplorerFiles,
  resolveExplorerSelectedFileId,
  type ExplorerFileEntry,
  buildExplorerTree,
  type ExplorerTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  createRawTableStatusProjection,
} from "src/cs/workbench/contrib/files/common/rawTableStatusProjection";
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
import type { ISessionService, SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  createSessionReadModel,
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import {
  logSessionSnapshotTrace,
} from "src/cs/workbench/services/session/common/sessionTrace";
import type {
  ITableService,
  TableSource,
} from "src/cs/workbench/services/table/common/table";
import type {
  FileRecord,
  TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  ISliceService,
  SliceFileState,
  SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import {
  getRawTableRefsForFileIds,
  type TableModelQueueSnapshot,
  type TableModelRawTableQueueState,
  type ITableModelQueueService,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import type { IThumbnailPreviewService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
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
  readonly tableModelQueueService: ITableModelQueueService;
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
    this._register(this.options.tableModelQueueService.onDidChangeTableModelQueueState(() => this.scheduleSync()));
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
    const snapshot = this.options.sessionService.getSnapshot();
    this.pruneRecentInteractiveChartTargets(snapshot);
    const endPerf = startPerf("workbenchDomainBridge.sync", {
      deferSecondaryWork,
      fileCount: Object.keys(snapshot.filesById).length,
      sessionVersion: snapshot.sessionVersion,
    });
    const readModel = createSessionReadModel(snapshot);
    logSessionSnapshotTrace("workbenchDomainBridge.sync", snapshot, {
      hasChartData: readModel.hasChartData,
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
    }, {
      fileIds: readModel.processedFileIds,
    });
    const explorerSelection = reconcileExplorerDomainSelection(
      this.options.explorerService,
      readModel,
      this.options.layoutService.activeWorkbenchMainPart,
    );
    const tableSource = createRawTableSource(explorerSelection, snapshot.filesById);
    if (tableSource || !explorerSelection.selectedRawFileId) {
      this.options.tableService.open(tableSource);
    }

    if (deferSecondaryWork) {
      this.scheduleDeferredSecondarySync();
      endPerf({
        deferredSecondaryWork: true,
        processedFileCount: readModel.processedFileIds.length,
        rawFileCount: readModel.rawFiles.length,
      });
      return;
    }

    this.syncSecondaryProjection(snapshot, readModel, explorerSelection);
    endPerf({
      deferredSecondaryWork: false,
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
    });
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

      this.cancelScheduledDeferredSecondarySync = null;
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
    const snapshot = this.options.sessionService.getSnapshot();
    const endPerf = startPerf("workbenchDomainBridge.deferredSync", {
      fileCount: Object.keys(snapshot.filesById).length,
      sessionVersion: snapshot.sessionVersion,
    });
    const readModel = createSessionReadModel(snapshot);
    const explorerSelection = resolveExplorerDomainSelection(
      this.options.explorerService,
      readModel,
    );
    this.syncSecondaryProjection(snapshot, readModel, explorerSelection);
    endPerf({
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
    });
  }

  private syncSecondaryProjection(
    snapshot: SessionSnapshot,
    readModel: SessionReadModel,
    explorerSelection: ExplorerDomainSelection,
  ): void {
    const sliceState = this.options.sliceService.getState();
    this.options.explorerService.updatePaneInput(this.getExplorerPaneInput(
      snapshot,
      readModel,
      sliceState,
    ));
    const chartViewInput = this.getChartViewInput(
      snapshot,
      readModel,
      explorerSelection.selectedProcessedFileId,
    );
    if (chartViewInput.activeFileId && chartViewInput.hasChartData) {
      this.options.calculationService.prioritizeCalculationFile(chartViewInput.activeFileId);
      const plotType = chartViewInput.activePlotType ?? this.options.plotService.getState().activePlotType;
      const input = {
        fileId: chartViewInput.activeFileId,
        plotType,
        snapshot,
      };
      this.options.plotService.prefetchPlotDisplayModel(input, "active");
    }
    this.options.chartService.updateViewInput(chartViewInput);
  }

  private getExplorerPaneInput(
    snapshot: SessionSnapshot,
    readModel: SessionReadModel,
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
      readModel,
      snapshot,
      tableModelQueueSnapshot: this.options.tableModelQueueService.getQueueSnapshot(),
      sliceState,
    });
  }

  private getChartViewInput(
    snapshot: SessionSnapshot,
    readModel: SessionReadModel,
    activeFileId = resolveExplorerDomainSelection(
      this.options.explorerService,
      readModel,
    ).selectedProcessedFileId,
  ) {
    const chartActiveFileId = resolveExplorerSelectedFileId(
      activeFileId,
      readModel.rawFiles.flatMap(file => file.fileId ? [file.fileId] : []),
    );
    const hasActiveChartData = Boolean(
      chartActiveFileId &&
        readModel.processedFileIds.includes(chartActiveFileId),
    );
    const chartFileOptions = createActiveChartFileOptions(
      snapshot,
      chartActiveFileId,
    );
    return createChartViewInput({
      activeFileId: chartActiveFileId,
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
    this.options.calculationService.prioritizeCalculationFile(normalizedFileId);
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

    this.prefetchPlotDisplayTargets(
      recentFileIds,
      "recent",
      "recentInteractiveTargets",
    );
    this.options.thumbnailPreviewService.prefetch(recentFileIds, "recent");
  }

  private pruneRecentInteractiveChartTargets(snapshot: SessionSnapshot): void {
    for (let index = this.recentInteractiveChartTargetFileIds.length - 1; index >= 0; index -= 1) {
      if (!snapshot.filesById[this.recentInteractiveChartTargetFileIds[index]!]) {
        this.recentInteractiveChartTargetFileIds.splice(index, 1);
      }
    }
  }

  private prioritizeVisibleExplorerFiles(
    visibleFileIds: readonly string[],
    nearbyFileIds: readonly string[],
  ): void {
    const snapshot = this.options.sessionService.getSnapshot();
    this.options.tableModelQueueService.prioritizeRawTables(
      getRawTableRefsForFileIds(visibleFileIds, snapshot),
      "visible",
    );
    this.options.tableModelQueueService.prioritizeRawTables(
      getRawTableRefsForFileIds(nearbyFileIds, snapshot),
      "nearby",
    );
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

    this.options.calculationService.prioritizeCalculationFiles(visibleFileIds);
    this.options.calculationService.prioritizeCalculationFiles(nearbyFileIds);
    this.options.thumbnailPreviewService.prefetch(visibleFileIds, "visible");
    this.options.thumbnailPreviewService.prefetch(nearbyFileIds, "nearby");
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

    const snapshot = this.options.sessionService.getSnapshot();
    const plotType = this.options.plotService.getState().activePlotType;
    const endPerf = startPerf("workbenchDomainBridge.prefetchPlotDisplayTargets", {
      fileCount: normalizedFileIds.length,
      plotType,
      priority,
      source,
    }, { silent: true });
    const inputs = normalizedFileIds.map(fileId => ({
      fileId,
      plotType,
      snapshot,
    }));
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
    const snapshot = this.options.sessionService.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    const currentPaneInput = this.options.explorerService.getPaneInput();
    const paneInput = currentPaneInput?.mode === "chart"
      ? currentPaneInput
      : this.getExplorerPaneInput(snapshot, readModel);
    const rowIndicesByFileId = createTraceRowIndicesByFileId(
      paneInput.files,
      this.options.explorerService.expandedFolderKeys,
    );
    const selectedFileId = getExplorerSelectedFileId(this.options.explorerService) ?? paneInput.selectedFileId;
    return paneInput.files
      .map((file, index) => {
        const fileId = String(file.fileId ?? "").trim();
        if (!fileId) {
          return null;
        }

        const hasChartData = file.hasChartData === true || hasFileChartData(snapshot.filesById[fileId]);
        const chartState = file.chartState ?? (hasChartData ? "ready" : "none");
        if (!hasTraceChartTargetState(chartState, hasChartData)) {
          return null;
        }

        const fileName = String(file.fileName ?? snapshot.filesById[fileId]?.raw.fileName ?? fileId);
        return {
          chartState,
          fileId,
          fileName,
          hasChartData,
          index,
          label: fileName,
          rowIndex: rowIndicesByFileId.get(fileId) ?? index,
          selected: selectedFileId === fileId,
          source: "trace-api",
        } satisfies TemplateApplyPerformanceTraceChartTarget;
      })
      .filter((target): target is TemplateApplyPerformanceTraceChartTarget => Boolean(target));
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
  snapshot: SessionSnapshot,
  activeFileId: string | null,
): ChartFileOption[] => {
  if (!activeFileId) {
    return [];
  }

  const file = snapshot.filesById[activeFileId];
  if (!file) {
    return [];
  }

  return [{
    fileId: activeFileId,
    fileName: String(file.raw.fileName ?? activeFileId),
  }];
};

const hasTraceChartTargetState = (
  chartState: TemplateApplyPerformanceTraceChartTarget["chartState"],
  hasChartData: boolean,
): boolean =>
  hasChartData ||
  chartState === "queued" ||
  chartState === "processing" ||
  chartState === "ready";

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
  readonly readModel: SessionReadModel;
  readonly snapshot: SessionSnapshot;
  readonly tableModelQueueSnapshot?: TableModelQueueSnapshot;
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
  readonly processedFileIds: readonly string[];
};

type ExplorerSelectionState = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
  | "selectedProcessedItemKey"
  | "selectedRawFileId"
  | "selectedRawItemKey"
>;

const createExplorerDomainSelectionInput = (
  readModel: SessionReadModel,
  localFiles: readonly ExplorerFileEntry[] = [],
): ExplorerDomainSelectionInput => ({
  processedFileIds: readModel.processedFileIds,
  rawSources: mergeExplorerItemIdentities(
    readModel.rawFiles.flatMap(file => {
      const fileId = normalizeExplorerSelectionFileId(file.fileId);
      return fileId
        ? [{
            fileId,
            itemKey: getRawFileItemKey(file),
          }]
        : [];
    }),
    localFiles.flatMap(file => {
      const fileId = normalizeExplorerSelectionFileId(file.fileId);
      return file.localImport && fileId
        ? [{
            fileId,
            itemKey: normalizeExplorerSelectionItemKey(file.itemKey),
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
  readModel: SessionReadModel,
): ExplorerDomainSelection => {
  const input = createExplorerDomainSelectionInput(readModel);
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
  readModel: SessionReadModel,
  kind: ExplorerSelectionKind = "table",
): ExplorerDomainSelection => {
  const input = createExplorerDomainSelectionInput(
    readModel,
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
  readModel,
  snapshot,
  tableModelQueueSnapshot,
  sliceState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
  const rawFiles = readModel.rawFiles;
  const isChartMode = mode === "chart";
  const isThumbnailLayout = isChartMode && explorerService.viewLayout === "thumbnail";
  const selectionKind: ExplorerSelectionKind = isChartMode ? "chart" : "table";
  const rawExplorerFiles = applyTableModelQueueExplorerBadges(
    createRawExplorerFiles(rawFiles),
    snapshot,
    tableModelQueueSnapshot,
  );
  const rawStatusExplorerFiles = mergeExplorerPaneLocalImportFiles(
    applyRawTableStatusProjections(rawExplorerFiles, {
    sliceState,
    snapshot,
    }),
    explorerService.getPaneInput()?.files ?? [],
  );
  const chartBaseFiles = isThumbnailLayout
    ? applyRawTableStatusProjections(createChartExplorerFilesFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
      rawFiles,
    ), {
      sliceState,
      snapshot,
    })
    : rawStatusExplorerFiles;
  const files = applyChartExplorerStates(chartBaseFiles, {
      isChartMode,
      sliceState,
      snapshot,
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
    quickAccessFiles: rawStatusExplorerFiles,
    selectedFileId,
    selectedItemKey,
    selectionKind,
    thumbnailFiles: readModel.processedFiles,
  };
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

const getExplorerPaneFileIds = (
  files: readonly { readonly fileId?: string | null }[],
): readonly string[] => {
  return files
    .map(file => String(file.fileId ?? "").trim())
    .filter(fileId => fileId.length > 0);
};

const mergeExplorerPaneLocalImportFiles = (
  sessionFiles: readonly ExplorerFileEntry[],
  currentFiles: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] => {
  const localFiles = currentFiles.filter(file => file.localImport);
  if (!localFiles.length) {
    return sessionFiles as ExplorerFileEntry[];
  }

  const result = [...sessionFiles];
  const seen = new Set(result.map(getExplorerPaneFileKey));
  for (const file of localFiles) {
    const key = getExplorerPaneFileKey(file);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(file);
  }
  return result;
};

const getExplorerPaneFileKey = (file: ExplorerFileEntry): string => {
  const itemKey = normalizeExplorerSelectionItemKey(file.itemKey);
  if (itemKey) {
    return `item:${itemKey}`;
  }

  const fileId = normalizeExplorerSelectionFileId(file.fileId);
  return fileId ? `file:${fileId}` : `item:${String(file.itemKey ?? "")}`;
};

const applyTableModelQueueExplorerBadges = (
  files: readonly ExplorerFileEntry[],
  snapshot: SessionSnapshot,
  queueSnapshot: TableModelQueueSnapshot | undefined,
): ExplorerFileEntry[] => {
  if (!queueSnapshot?.rawTables.length) {
    return [...files];
  }

  const queueStatesByRefKey = createTableModelQueueStatesByRefKey(queueSnapshot);
  return files.map(file => applyTableModelQueueExplorerBadge(file, snapshot, queueStatesByRefKey));
};

const applyTableModelQueueExplorerBadge = (
  file: ExplorerFileEntry,
  snapshot: SessionSnapshot,
  queueStatesByRefKey: ReadonlyMap<string, TableModelRawTableQueueState>,
): ExplorerFileEntry => {
  if (file.badgeState?.kind !== "pending") {
    return file;
  }

  const fileId = String(file.fileId ?? "").trim();
  const fileRecord = fileId ? snapshot.filesById[fileId] : undefined;
  const match = findExplorerRawTable(file, fileRecord);
  if (!fileId || !match) {
    return file;
  }

  const queueState = queueStatesByRefKey.get(createRawTableRefKey(fileId, match.rawTableId));
  if (!queueState) {
    return file;
  }

  return {
    ...file,
    badgeState: {
      kind: "pending",
      queueState: queueState.state,
      source: "tableModel",
    },
  };
};

const applyRawTableStatusProjections = (
  files: readonly ExplorerFileEntry[],
  {
    sliceState,
    snapshot,
  }: {
    readonly sliceState: SliceState;
    readonly snapshot: SessionSnapshot;
  },
): ExplorerFileEntry[] =>
  files.map(file => {
    const fileId = String(file.fileId ?? "").trim();
    const fileRecord = fileId ? snapshot.filesById[fileId] : undefined;
    const rawTableId = findExplorerRawTable(file, fileRecord)?.rawTableId ?? null;
    return {
      ...file,
      rawTableStatus: createRawTableStatusProjection({
        file: fileRecord,
        rawTableId,
        sliceFileState: fileId ? sliceState.fileStates.get(fileId) : undefined,
      }),
    };
  });

const createTableModelQueueStatesByRefKey = (
  snapshot: TableModelQueueSnapshot,
): ReadonlyMap<string, TableModelRawTableQueueState> => {
  const statesByRefKey = new Map<string, TableModelRawTableQueueState>();
  for (const state of snapshot.rawTables) {
    const fileId = String(state.fileId ?? "").trim();
    const rawTableId = String(state.rawTableId ?? "").trim();
    if (!fileId || !rawTableId) {
      continue;
    }

    const key = createRawTableRefKey(fileId, rawTableId);
    const current = statesByRefKey.get(key);
    if (!current || state.state === "running") {
      statesByRefKey.set(key, state);
    }
  }

  return statesByRefKey;
};

const applyChartExplorerStates = (
  files: readonly ExplorerFileEntry[],
  {
    isChartMode,
    sliceState,
    snapshot,
  }: {
    readonly isChartMode: boolean;
    readonly sliceState: SliceState;
    readonly snapshot: SessionSnapshot;
  },
): ExplorerFileEntry[] => {
  if (!isChartMode) {
    return [...files];
  }

  return files.map(file => {
    const fileId = String(file.fileId ?? "").trim();
    const hasChartData = hasFileChartData(snapshot.filesById[fileId]);
    const ownerState = fileId ? resolveExplorerFileProcessingState(sliceState.fileStates.get(fileId)) : undefined;
    const chartState = resolveChartState(ownerState, hasChartData);
    const chartMessage = getChartStateMessage(ownerState);
    return {
      ...file,
      badgeState: file.badgeState,
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

const hasFileChartData = (
  file: FileRecord | undefined,
): boolean =>
  Boolean(file && Object.keys(file.curvesByKey ?? {}).length > 0);

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

const findExplorerRawTable = (
  file: ExplorerFileEntry,
  fileRecord: FileRecord | undefined,
): { readonly rawTableId: string; readonly table: TableRecord } | null => {
  if (!fileRecord) {
    return null;
  }

  const itemKey = String(file.itemKey ?? "").trim();
  if (itemKey) {
    const entry = findFileRecordTableByItemKey(fileRecord, itemKey);
    if (entry) {
      const [rawTableId, table] = entry;
      return {
        rawTableId,
        table,
      };
    }
  }

  const firstTableId = fileRecord.raw.tableOrder[0];
  const table = firstTableId ? fileRecord.raw.tablesById[firstTableId] ?? null : null;
  return firstTableId && table
    ? {
        rawTableId: firstTableId,
        table,
      }
    : null;
};

const createRawTableSource = (
  selection: Pick<ExplorerDomainSelection, "selectedRawFileId" | "selectedRawItemKey">,
  filesById: Readonly<Record<string, FileRecord>>,
): TableSource | null => {
  const fileId = normalizeExplorerSelectionFileId(selection.selectedRawFileId);
  if (!fileId) {
    return null;
  }

  const itemKey = normalizeExplorerSelectionItemKey(selection.selectedRawItemKey);
  const file = filesById[fileId];
  const resource = getRawTableResource(file);
  if (resource) {
    const selectedTable = itemKey ? findFileRecordTableByItemKey(file, itemKey) : null;
    const sheetId = selectedTable?.[1].sheetId ?? null;
    return {
      resource,
      ...(sheetId ? { sheetId } : {}),
    };
  }

  return null;
};

const findFileRecordTableByItemKey = (
  fileRecord: FileRecord | undefined,
  itemKey: string,
): [string, TableRecord] | null => {
  if (!fileRecord) {
    return null;
  }

  return Object.entries(fileRecord.raw.tablesById)
    .find(([rawTableId, candidate]) =>
      rawTableId === itemKey ||
      candidate.sheetId === itemKey ||
      candidate.tableKey === itemKey
    ) ?? null;
};

const getRawTableResource = (file: FileRecord | undefined): URI | null => {
  const filePath = String(file?.raw.filePath ?? "").trim();
  return filePath ? URI.file(filePath) : null;
};

const createRawTableRefKey = (
  fileId: string,
  rawTableId: string,
): string => `${fileId}\u0000${rawTableId}`;
