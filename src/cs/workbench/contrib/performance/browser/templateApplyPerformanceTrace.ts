/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerformanceNow } from "src/cs/base/common/performance";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  IExplorerService,
  type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  buildExplorerTree,
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
  type ExplorerTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
  ISliceService,
  type ISliceService as ISliceServiceType,
  type SliceFileState,
} from "src/cs/workbench/services/slice/common/slice";
import {
  IViewsService,
  type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";

const TRACE_STORAGE_KEY = "conductor.templateApplyPerformanceTrace";
const TRACE_QUERY_KEY = "conductorTemplateApplyPerformanceTrace";
const TRACE_CONSOLE_STORAGE_KEY = "conductor.templateApplyPerformanceTrace.console";

export type TemplateApplyPerformanceTraceMeta = Record<string, unknown>;

export type TemplateApplyPerformanceTraceEvent = {
  readonly id: number;
  readonly meta: TemplateApplyPerformanceTraceMeta;
  readonly stage: string;
  readonly timeOrigin: number;
  readonly timestamp: number;
  readonly wallTime: number;
};

export type TemplateApplyPerformanceTraceChartTarget = {
  readonly chartState: "none" | "queued" | "processing" | "ready" | "failed" | "skipped";
  readonly fileId: string;
  readonly fileName: string;
  readonly hasChartData: boolean;
  readonly index: number;
  readonly label: string;
  readonly rowIndex: number;
  readonly selected: boolean;
  readonly source: "trace-api";
};

export type TemplateApplyPerformanceTraceTargetApi = {
  readonly getChartTargets: () => readonly TemplateApplyPerformanceTraceChartTarget[];
  readonly getSelectedChartTargetFileId: () => string | null;
  readonly selectChartTarget: (fileId: string, reveal?: boolean | "force") => string | null;
  readonly setHoveredChartTarget: (fileId: string | null) => string | null;
};

type TemplateApplyPerformanceTraceGlobal = {
  enabled: boolean;
  events: TemplateApplyPerformanceTraceEvent[];
  mark: (stage: string, meta?: TemplateApplyPerformanceTraceMeta) => TemplateApplyPerformanceTraceEvent | null;
  reset: () => void;
  targetApi?: TemplateApplyPerformanceTraceTargetApi;
};

type TraceGlobalTarget = typeof globalThis & {
  __conductorTemplateApplyPerformanceTrace?: TemplateApplyPerformanceTraceGlobal;
};

const isTruthyFlag = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on";
};

const readStorageFlag = (key: string): boolean => {
  try {
    return isTruthyFlag(globalThis.localStorage?.getItem(key));
  } catch {
    return false;
  }
};

const readQueryFlag = (): boolean => {
  try {
    const search = globalThis.location?.search ?? "";
    return isTruthyFlag(new URLSearchParams(search).get(TRACE_QUERY_KEY));
  } catch {
    return false;
  }
};

export const isTemplateApplyPerformanceTraceEnabled = (): boolean =>
  isTruthyFlag(import.meta.env?.VITE_TEMPLATE_APPLY_PERFORMANCE_TRACE) ||
  readQueryFlag() ||
  readStorageFlag(TRACE_STORAGE_KEY);

const shouldLogTraceToConsole = (): boolean =>
  readStorageFlag(TRACE_CONSOLE_STORAGE_KEY);

const getTimeOrigin = (): number => {
  const timeOrigin = Number(globalThis.performance?.timeOrigin);
  return Number.isFinite(timeOrigin) ? timeOrigin : Date.now() - getPerformanceNow();
};

const getTraceGlobal = (): TemplateApplyPerformanceTraceGlobal => {
  const target = globalThis as TraceGlobalTarget;
  const existing = target.__conductorTemplateApplyPerformanceTrace;
  if (existing) {
    existing.enabled = isTemplateApplyPerformanceTraceEnabled();
    return existing;
  }

  let nextId = 1;
  const trace: TemplateApplyPerformanceTraceGlobal = {
    enabled: isTemplateApplyPerformanceTraceEnabled(),
    events: [],
    mark: (stage, meta = {}) => {
      if (!trace.enabled) {
        return null;
      }

      const event: TemplateApplyPerformanceTraceEvent = {
        id: nextId,
        meta: {
          ...readRendererMemorySnapshot(),
          ...meta,
        },
        stage,
        timeOrigin: getTimeOrigin(),
        timestamp: getPerformanceNow(),
        wallTime: Date.now(),
      };
      nextId += 1;
      trace.events.push(event);
      if (shouldLogTraceToConsole()) {
        console.info("[template-apply-performance-trace]", stage, event.meta);
      }
      return event;
    },
    reset: () => {
      nextId = 1;
      trace.events.length = 0;
      trace.enabled = isTemplateApplyPerformanceTraceEnabled();
    },
  };
  target.__conductorTemplateApplyPerformanceTrace = trace;
  return trace;
};

export const markTemplateApplyPerformanceTrace = (
  stage: string,
  meta: TemplateApplyPerformanceTraceMeta = {},
): TemplateApplyPerformanceTraceEvent | null => getTraceGlobal().mark(stage, meta);

export const resetTemplateApplyPerformanceTrace = (): void => {
  getTraceGlobal().reset();
};

export const registerTemplateApplyPerformanceTraceTargetApi = (
  api: TemplateApplyPerformanceTraceTargetApi,
): (() => void) => {
  const trace = getTraceGlobal();
  trace.targetApi = api;
  return () => {
    if (trace.targetApi === api) {
      delete trace.targetApi;
    }
  };
};

const TemplateApplyPerformanceTraceContributionId =
  "workbench.contrib.performance.templateApplyTraceTargets";

export class TemplateApplyPerformanceTraceContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IExplorerService private readonly explorerService: IExplorerServiceType,
    @ISliceService private readonly sliceService: ISliceServiceType,
    @IViewsService private readonly viewsService: IViewsServiceType,
  ) {
    super();

    if (isTemplateApplyPerformanceTraceEnabled()) {
      this._register({
        dispose: registerTemplateApplyPerformanceTraceTargetApi({
          getChartTargets: () => this.getChartTargets(),
          getSelectedChartTargetFileId: () => this.getSelectedChartTargetFileId(),
          selectChartTarget: (fileId, reveal = "force") => this.selectChartTarget(fileId, reveal),
          setHoveredChartTarget: fileId => this.setHoveredChartTarget(fileId),
        }),
      });
    }
  }

  private getChartTargets(): readonly TemplateApplyPerformanceTraceChartTarget[] {
    const files = this.getVisibleChartFiles();
    const selectedKey = getExplorerResourceIdentityKey({
      resource: this.explorerService.selectedResource,
      sheetId: this.explorerService.selectedSheetId,
    });
    const rowIndicesByFileId = createTraceRowIndicesByFileId(
      files,
      this.explorerService.expandedFolderKeys,
    );
    return files
      .map((file, index) => {
        const fileId = normalizeTraceFileId(file.fileId);
        const resource = getExplorerFileResourceIdentity(file);
        if (!fileId || !resource) {
          return null;
        }

        const hasChartData = Boolean(
          this.sliceService.getResourceResult(resource.resource, resource.sheetId),
        );
        const chartState = resolveTraceChartState(
          this.sliceService.getResourceState(resource.resource, resource.sheetId),
          hasChartData,
        );
        if (!isTraceChartTargetState(chartState, hasChartData)) {
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
          selected: selectedKey === getExplorerResourceIdentityKey(resource),
          source: "trace-api",
        } satisfies TemplateApplyPerformanceTraceChartTarget;
      })
      .filter((target): target is TemplateApplyPerformanceTraceChartTarget => Boolean(target));
  }

  private getSelectedChartTargetFileId(): string | null {
    const selectedKey = getExplorerResourceIdentityKey({
      resource: this.explorerService.selectedResource,
      sheetId: this.explorerService.selectedSheetId,
    });
    if (!selectedKey) {
      return null;
    }

    const file = this.getVisibleChartFiles().find(candidate =>
      getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(candidate)) === selectedKey);
    return normalizeTraceFileId(file?.fileId);
  }

  private selectChartTarget(fileId: string, reveal: boolean | "force"): string | null {
    const normalizedFileId = normalizeTraceFileId(fileId);
    const file = normalizedFileId
      ? this.getVisibleChartFiles().find(candidate =>
          normalizeTraceFileId(candidate.fileId) === normalizedFileId)
      : null;
    const resource = getExplorerFileResourceIdentity(file);
    if (!normalizedFileId || !resource) {
      return null;
    }

    const selected = this.explorerService.select(
      resource.resource,
      reveal,
      resource.sheetId ?? null,
    );
    return getExplorerResourceIdentityKey(selected) === getExplorerResourceIdentityKey(resource)
      ? normalizedFileId
      : null;
  }

  private setHoveredChartTarget(fileId: string | null): string | null {
    const normalizedFileId = normalizeTraceFileId(fileId);
    if (!normalizedFileId) {
      this.explorerService.setHoveredResource(null);
      return null;
    }

    const file = this.getVisibleChartFiles().find(candidate =>
      normalizeTraceFileId(candidate.fileId) === normalizedFileId);
    const resource = getExplorerFileResourceIdentity(file);
    this.explorerService.setHoveredResource(resource);
    return resource ? normalizedFileId : null;
  }

  private getVisibleChartFiles(): readonly ExplorerFileEntry[] {
    const activePanelViewContainerId = this.viewsService.getViewContainerNavigationState(
      ViewContainerLocation.Panel,
    ).activeViewContainerId;
    if (activePanelViewContainerId !== ChartViewContainerId) {
      return [];
    }

    return this.explorerService.viewLayout === "thumbnail"
      ? this.explorerService.files.filter(file => {
          const resource = getExplorerFileResourceIdentity(file);
          return Boolean(
            resource && (
              this.sliceService.getResourceResult(resource.resource, resource.sheetId) ||
              isSliceTraceTargetState(
                this.sliceService.getResourceState(resource.resource, resource.sheetId),
              )
            ),
          );
        })
      : this.explorerService.files;
  }
}

function createTraceRowIndicesByFileId(
  files: readonly ExplorerFileEntry[],
  expandedFolderKeys: readonly string[],
): ReadonlyMap<string, number> {
  const rowIndicesByFileId = new Map<string, number>();
  const expandedFolderKeySet = new Set(expandedFolderKeys);
  const shouldTreatFoldersAsExpanded = expandedFolderKeySet.size === 0;
  let rowIndex = 0;

  const visit = (nodes: readonly ExplorerTreeNode<ExplorerFileEntry>[]): void => {
    for (const node of nodes) {
      const currentRowIndex = rowIndex;
      rowIndex += 1;
      if (node.kind === "file") {
        const fileId = normalizeTraceFileId(node.entry?.fileId);
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
}

function resolveTraceChartState(
  state: SliceFileState | undefined,
  hasChartData: boolean,
): TemplateApplyPerformanceTraceChartTarget["chartState"] {
  if (hasChartData || state?.state === "ready") {
    return "ready";
  }
  if (
    state?.state === "queued" ||
    state?.state === "processing" ||
    state?.state === "failed" ||
    state?.state === "skipped"
  ) {
    return state.state;
  }
  return "none";
}

function isTraceChartTargetState(
  state: TemplateApplyPerformanceTraceChartTarget["chartState"],
  hasChartData: boolean,
): boolean {
  return hasChartData ||
    state === "queued" ||
    state === "processing" ||
    state === "ready";
}

function isSliceTraceTargetState(state: SliceFileState | undefined): boolean {
  return state?.state === "queued" ||
    state?.state === "processing" ||
    state?.state === "ready";
}

function normalizeTraceFileId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

registerWorkbenchContribution2(
  TemplateApplyPerformanceTraceContributionId,
  TemplateApplyPerformanceTraceContribution,
  WorkbenchPhase.AfterRestored,
);

const readRendererMemorySnapshot = (): TemplateApplyPerformanceTraceMeta => {
  const memory = (globalThis.performance as Performance & {
    memory?: {
      jsHeapSizeLimit?: number;
      totalJSHeapSize?: number;
      usedJSHeapSize?: number;
    };
  } | undefined)?.memory;
  if (!memory) {
    return {};
  }

  return {
    jsHeapSizeLimit: Number(memory.jsHeapSizeLimit) || null,
    totalJSHeapSize: Number(memory.totalJSHeapSize) || null,
    usedJSHeapSize: Number(memory.usedJSHeapSize) || null,
  };
};
