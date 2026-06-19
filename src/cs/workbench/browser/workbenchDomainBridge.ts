/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
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
  toExplorerBadgeLabel,
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
import { createTemplateApplyInput } from "src/cs/workbench/services/template/browser/templateApplyInput";
import type {
  TemplateApplyFileState,
  ITemplateApplyWorkflowService,
  ITemplateService,
  TemplateState,
} from "src/cs/workbench/services/template/common/template";
import {
  createCurrentTemplateSelectionDisplay,
} from "src/cs/workbench/services/template/common/templateSelection";
import {
  getRawTableRefsForFileIds,
  type IAssessmentQueueService,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  assessFastImportBadge,
} from "src/cs/workbench/services/assessment/common/fileAssessment";
import type { IThumbnailPreviewService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  isTemplateApplyPerformanceTraceEnabled,
  registerTemplateApplyPerformanceTraceTargetApi,
  type TemplateApplyPerformanceTraceChartTarget,
} from "src/cs/workbench/contrib/files/browser/templateApplyPerformanceTrace";

const RECENT_INTERACTIVE_CHART_TARGET_LIMIT = 16;

export type WorkbenchDomainBridgeOptions = {
  readonly chartService: IChartService;
  readonly assessmentQueueService: IAssessmentQueueService;
  readonly calculationService: ICalculationService;
  readonly explorerService: IExplorerService;
  readonly layoutService: IWorkbenchLayoutService;
  readonly plotService: IPlotService;
  readonly sessionService: ISessionService;
  readonly settingsService: ISettingsService;
  readonly tableService: ITableService;
  readonly templateApplyWorkflowService: ITemplateApplyWorkflowService;
  readonly templateService: ITemplateService;
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
    this._register(this.options.plotService.onDidChangePlotState(() => this.scheduleSync()));
    this._register(this.options.templateApplyWorkflowService.onDidChangeProcessingStatus(() => this.scheduleSync()));
    this._register(this.options.templateApplyWorkflowService.onDidChangeFileStates(() => this.scheduleSync()));
    this._register(this.options.templateService.onDidChangeTemplateState(() => this.scheduleSync()));
    this._register(this.options.layoutService.onDidChangeWorkbenchNavigation(() => this.scheduleSync()));
    this._register(this.options.sessionService.onDidChangeSession(() => this.scheduleSync()));
    this._register({ dispose: () => this.cancelScheduledSync?.() });
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
  private scheduledSyncKind: "frame" | "microtask" | null = null;

  public sync(): void {
    this.cancelScheduledSync?.();
    this.cancelScheduledSync = null;
    this.scheduledSyncKind = null;
    this.runSync();
  }

  private scheduleSync(): void {
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

  private runSync(): void {
    const snapshot = this.options.sessionService.getSnapshot();
    this.pruneRecentInteractiveChartTargets(snapshot);
    const endPerf = startPerf("workbenchDomainBridge.sync", {
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
    const explorerSelection = reconcileExplorerSessionSelection(
      this.options.explorerService,
      readModel,
      this.options.layoutService.activeWorkbenchMainPart,
    );
    this.options.tableService.open(createRawTableSource(explorerSelection.selectedRawFileId));

    this.options.templateApplyWorkflowService.update(createTemplateApplyInput({
      activeFileId: explorerSelection.selectedProcessedFileId ?? explorerSelection.selectedRawFileId,
      hasPendingSourceFiles: this.options.explorerService.hasPendingSourceFiles,
      readModel,
      templateState: this.options.templateService.getState(),
    }));
    this.options.templateService.updateViewInput({
      rawFiles: readModel.rawFiles,
    });
    this.options.explorerService.updatePaneInput(this.getExplorerPaneInput(
      snapshot,
      readModel,
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
    endPerf({
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
    });
  }

  private getExplorerPaneInput(
    snapshot: SessionSnapshot,
    readModel: SessionReadModel,
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
      applyStatesByFileId: this.options.templateApplyWorkflowService.getFileApplyStates(),
      templateState: this.options.templateService.getState(),
    });
  }

  private getChartViewInput(
    snapshot: SessionSnapshot,
    readModel: SessionReadModel,
    activeFileId = resolveExplorerSessionSelection(
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
      processingStatus: this.options.templateApplyWorkflowService.processingStatus,
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
    this.options.templateApplyWorkflowService.prioritizeProcessingFile(normalizedFileId);
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
    this.options.assessmentQueueService.prioritizeRawTables(
      getRawTableRefsForFileIds(visibleFileIds, snapshot),
      "visible",
    );
    this.options.assessmentQueueService.prioritizeRawTables(
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
  readonly applyStatesByFileId?: ReadonlyMap<string, TemplateApplyFileState>;
  readonly templateState: TemplateState;
};

type ExplorerSessionSelection = {
  readonly selectedRawFileId: string | null;
  readonly selectedProcessedFileId: string | null;
};

type ExplorerSessionSelectionInput = {
  readonly rawFileIds: readonly string[];
  readonly processedFileIds: readonly string[];
};

type ExplorerSelectionState = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
  | "selectedRawFileId"
>;

const createExplorerSessionSelectionInput = (
  readModel: SessionReadModel,
): ExplorerSessionSelectionInput => ({
  processedFileIds: readModel.processedFileIds,
  rawFileIds: readModel.rawFiles.flatMap(file => file.fileId ? [file.fileId] : []),
});

export const resolveExplorerSessionSelection = (
  explorerService: ExplorerSelectionState,
  readModel: SessionReadModel,
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  const selectedFileId = resolveExplorerSelectedFileId(
    getExplorerSelectedFileId(explorerService),
    input.rawFileIds,
  );
  return {
    selectedProcessedFileId: selectedFileId,
    selectedRawFileId: selectedFileId,
  };
};

export const reconcileExplorerSessionSelection = (
  explorerService: IExplorerService,
  readModel: SessionReadModel,
  kind: ExplorerSelectionKind = "table",
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  const selectedFileId = reconcileExplorerSelectedFileId(
    explorerService,
    kind,
    getExplorerSelectedFileId(explorerService),
    input.rawFileIds,
  );

  return {
    selectedProcessedFileId: selectedFileId,
    selectedRawFileId: selectedFileId,
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
  applyStatesByFileId,
  templateState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
  const rawFiles = readModel.rawFiles;
  const isChartMode = mode === "chart";
  const isThumbnailLayout = isChartMode && explorerService.viewLayout === "thumbnail";
  const selectionKind: ExplorerSelectionKind = isChartMode ? "chart" : "table";
  const files = applyChartExplorerStates(isThumbnailLayout
    ? createChartExplorerFilesFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
      rawFiles,
    )
    : applyFastExplorerBadges(createRawExplorerFiles(rawFiles), snapshot), {
      applyStatesByFileId,
      isChartMode,
      snapshot,
    });
  const fileIds = getExplorerPaneFileIds(files);
  const selectionFileIds = fileIds;
  const selectedFileId = resolveVisibleExplorerSelectedFileId(
    getExplorerSelectedFileId(explorerService),
    selectionFileIds,
  );
  const currentTemplate = createCurrentTemplateSelectionDisplay({
    formName: templateState.formState.name,
    selectedTemplateId: templateState.selectedTemplateId,
  });
  return {
    activePlotType,
    currentTemplateLabel: currentTemplate.label,
    currentTemplateSelection: currentTemplate.selection,
    fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
    files,
    mode,
    originOpenPlotOptions,
    plotAxisSettings,
    selectedFileId,
    selectionKind,
    thumbnailFiles: readModel.processedFiles,
  };
};

const reconcileExplorerSelectedFileId = (
  explorerService: Pick<IExplorerService, "select">,
  kind: ExplorerSelectionKind,
  selectedFileId: string | null,
  fileIds: readonly string[],
): string | null => {
  const nextSelectedFileId = resolveExplorerSelectedFileId(selectedFileId, fileIds);
  explorerService.select({
    candidateFileIds: fileIds,
    fileId: nextSelectedFileId,
    kind,
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

const resolveVisibleExplorerSelectedFileId = (
  selectedFileId: string | null,
  fileIds: readonly string[],
): string | null => {
  const normalizedSelectedFileId = normalizeExplorerSelectionFileId(selectedFileId);
  return normalizedSelectedFileId && fileIds.includes(normalizedSelectedFileId)
    ? normalizedSelectedFileId
    : null;
};

const normalizeExplorerSelectionFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const getExplorerPaneFileIds = (
  files: readonly { readonly fileId?: string | null }[],
): readonly string[] => {
  return files
    .map(file => String(file.fileId ?? "").trim())
    .filter(fileId => fileId.length > 0);
};

const applyFastExplorerBadges = (
  files: readonly ExplorerFileEntry[],
  snapshot: SessionSnapshot,
): ExplorerFileEntry[] =>
  files.map(file => applyFastExplorerBadge(file, snapshot));

const applyChartExplorerStates = (
  files: readonly ExplorerFileEntry[],
  {
    applyStatesByFileId,
    isChartMode,
    snapshot,
  }: {
    readonly applyStatesByFileId?: ReadonlyMap<string, TemplateApplyFileState>;
    readonly isChartMode: boolean;
    readonly snapshot: SessionSnapshot;
  },
): ExplorerFileEntry[] => {
  if (!isChartMode) {
    return [...files];
  }

  return files.map(file => {
    const fileId = String(file.fileId ?? "").trim();
    const hasChartData = hasFileChartData(snapshot.filesById[fileId]);
    const applyState = fileId ? applyStatesByFileId?.get(fileId) : undefined;
    const chartState = resolveChartState(applyState, hasChartData);
    const chartMessage = getChartStateMessage(applyState);
    return {
      ...file,
      badgeState: file.badgeState,
      chartMessage,
      chartState,
      hasChartData,
    };
  });
};

const hasFileChartData = (
  file: FileRecord | undefined,
): boolean =>
  Boolean(file && Object.keys(file.curvesByKey ?? {}).length > 0);

const resolveChartState = (
  applyState: TemplateApplyFileState | undefined,
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
  applyState: TemplateApplyFileState | undefined,
): string | null => {
  if (applyState?.state === "failed" || applyState?.state === "skipped") {
    return applyState.message;
  }

  return null;
};

const applyFastExplorerBadge = (
  file: ExplorerFileEntry,
  snapshot: SessionSnapshot,
): ExplorerFileEntry => {
  if (file.badgeState?.kind !== "pending") {
    return file;
  }

  const fileId = String(file.fileId ?? "").trim();
  const fileRecord = fileId ? snapshot.filesById[fileId] : undefined;
  const table = findExplorerRawTable(file, fileRecord);
  const fastBadge = assessFastImportBadge({
    fileName: file.fileName ?? fileRecord?.raw.fileName,
    relativePath: file.relativePath ?? fileRecord?.raw.relativePath,
    rows: getFastBadgeRows(table),
    sheetName: table?.sheetName,
  });
  if (!fastBadge) {
    if (isUnhealthyRawTable(table)) {
      return {
        ...file,
        badgeState: {
          kind: "unknown",
          source: "fast",
        },
      };
    }
    return file;
  }

  const label = toExplorerBadgeLabel(fastBadge.curveType);
  if (!label) {
    return file;
  }
  if (isUnhealthyRawTable(table)) {
    return {
      ...file,
      badgeState: {
        kind: "unknown",
        source: "fast",
        suspectedType: fastBadge.curveTypeLabel,
      },
    };
  }

  return {
    ...file,
    badgeState: {
      confidence: "tentative",
      kind: "ready",
      label,
      message: fastBadge.reason,
      source: "fast",
    },
  };
};

const isUnhealthyRawTable = (
  table: TableRecord | null,
): boolean =>
  table?.health?.state === "decodeFailed" ||
  table?.health?.state === "parseFailed" ||
  table?.health?.state === "unsupported";

const findExplorerRawTable = (
  file: ExplorerFileEntry,
  fileRecord: FileRecord | undefined,
): TableRecord | null => {
  if (!fileRecord) {
    return null;
  }

  const sourceKey = String(file.sourceKey ?? "").trim();
  if (sourceKey) {
    const table = Object.values(fileRecord.raw.tablesById)
      .find(candidate => candidate.tableKey === sourceKey);
    if (table) {
      return table;
    }
  }

  const firstTableId = fileRecord.raw.tableOrder[0];
  return firstTableId ? fileRecord.raw.tablesById[firstTableId] ?? null : null;
};

const getFastBadgeRows = (
  table: TableRecord | null,
): readonly (readonly unknown[])[] | undefined => {
  if (isUnhealthyRawTable(table)) {
    return undefined;
  }

  const rowStore = table?.rowStore;
  return rowStore?.kind === "memory"
    ? rowStore.rows.slice(0, 4)
    : undefined;
};

const createRawTableSource = (fileId: string | null): TableSource | null => {
  const normalizedFileId = String(fileId ?? "").trim();
  return normalizedFileId ? { fileId: normalizedFileId } : null;
};
