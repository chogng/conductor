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
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  createChartExplorerFilesFromRecords,
  createRawExplorerFiles,
  resolveExplorerSelectedFileId,
  toExplorerBadgeLabel,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import type { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import { createChartFileOptionsFromRecords } from "src/cs/workbench/services/chart/common/chartFileOptions";
import type { IChartService } from "src/cs/workbench/services/chart/common/chart";
import { getOriginOpenPlotOptions, type ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type { IPlotService, PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { ISessionService, SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  createSessionReadModel,
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
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

export type WorkbenchDomainBridgeOptions = {
  readonly chartService: IChartService;
  readonly assessmentQueueService: IAssessmentQueueService;
  readonly explorerService: IExplorerService;
  readonly layoutService: IWorkbenchLayoutService;
  readonly plotService: IPlotService;
  readonly sessionService: ISessionService;
  readonly settingsService: ISettingsService;
  readonly tableService: ITableService;
  readonly templateApplyWorkflowService: ITemplateApplyWorkflowService;
  readonly templateService: ITemplateService;
};

export class WorkbenchDomainBridge extends Disposable {
  constructor(
    private readonly options: WorkbenchDomainBridgeOptions,
  ) {
    super();

    this._register(this.options.settingsService.onDidChangeConductorSettings(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangePendingSourceFiles(() => this.scheduleSync()));
    this._register(this.options.explorerService.onDidChangeSelection(() => this.scheduleSync()));
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
  }

  private cancelScheduledSync: (() => void) | null = null;

  public sync(): void {
    this.cancelScheduledSync?.();
    this.cancelScheduledSync = null;
    this.runSync();
  }

  private scheduleSync(): void {
    if (this.cancelScheduledSync) {
      return;
    }

    const run = (): void => {
      this.cancelScheduledSync = null;
      this.runSync();
    };
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

  private runSync(): void {
    const snapshot = this.options.sessionService.getSnapshot();
    const endPerf = startPerf("workbenchDomainBridge.sync", {
      fileCount: Object.keys(snapshot.filesById).length,
      sessionVersion: snapshot.sessionVersion,
    });
    const readModel = createSessionReadModel(snapshot);
    const explorerSelection = reconcileExplorerSessionSelection(
      this.options.explorerService,
      readModel,
    );
    this.options.tableService.open(createRawTableSource(explorerSelection.selectedRawFileId));

    this.options.templateApplyWorkflowService.update(createTemplateApplyInput({
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
    this.options.chartService.updateViewInput(this.getChartViewInput(
      snapshot,
      readModel,
      explorerSelection.selectedProcessedFileId,
    ));
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
    const chartFileOptions = createChartFileOptionsFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
    );
    const chartActiveFileId = resolveExplorerSelectedFileId(
      activeFileId,
      chartFileOptions.map(option => option.fileId),
    );
    return createChartViewInput({
      activeFileId: chartActiveFileId,
      activePlotType: this.options.plotService.getState().activePlotType,
      chartFileOptions,
      processingStatus: this.options.templateApplyWorkflowService.processingStatus,
      showFileSelect: false,
      shouldMountCharts: false,
    });
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
  }
}

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
  return {
    selectedProcessedFileId: resolveExplorerSelectedFileId(
      explorerService.selectedProcessedFileId,
      input.rawFileIds,
    ),
    selectedRawFileId: resolveExplorerSelectedFileId(
      explorerService.selectedRawFileId,
      input.rawFileIds,
    ),
  };
};

export const reconcileExplorerSessionSelection = (
  explorerService: IExplorerService,
  readModel: SessionReadModel,
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  const selectedProcessedFileId = reconcileExplorerSelectedFileId(
    explorerService,
    "chart",
    explorerService.selectedProcessedFileId,
    input.rawFileIds,
  );
  const selectedRawFileId = reconcileExplorerSelectedFileId(
    explorerService,
    "table",
    explorerService.selectedRawFileId,
    input.rawFileIds,
  );

  return {
    selectedProcessedFileId,
    selectedRawFileId,
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
  const selectedFileId = resolveExplorerSelectedFileId(
    selectionKind === "chart"
      ? explorerService.selectedProcessedFileId
      : explorerService.selectedRawFileId,
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
      badgeState: resolveChartBadgeState(file, applyState),
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
  if (applyState?.state === "queued" || applyState?.state === "processing") {
    return applyState.state;
  }
  if (applyState?.state === "failed" || applyState?.state === "skipped") {
    return applyState.state;
  }
  if (applyState?.state === "ready" || hasChartData) {
    return "ready";
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

const resolveChartBadgeState = (
  file: ExplorerFileEntry,
  applyState: TemplateApplyFileState | undefined,
): ExplorerFileEntry["badgeState"] => {
  switch (applyState?.state) {
    case "queued":
    case "processing":
      return { kind: "pending" };
    case "failed":
    case "skipped":
      return { kind: "error", message: applyState.message };
    default:
      return file.badgeState;
  }
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
