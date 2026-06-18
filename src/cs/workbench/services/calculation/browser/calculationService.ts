/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  Disposable,
  toDisposable,
} from "src/cs/base/common/lifecycle";
import { logPerf, startPerf } from "src/cs/workbench/common/perf";
import {
  createCalculatedRecordsByFile,
  createCalculatedRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import {
  ISessionService,
  type CommitCalculatedRecordsInput,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type { FileId, FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

const CALCULATION_FOREGROUND_CHUNK_SIZE = 1;
const CALCULATION_BACKGROUND_CHUNK_SIZE = 2;
const CALCULATION_BACKGROUND_DELAY_MS = 0;
const CALCULATION_INTERACTIVE_PRIORITY_LIMIT = 24;

export class CalculationService extends Disposable implements ICalculationService {
  public declare readonly _serviceBrand: undefined;

  private readonly inputSignaturesByFileId = new Map<FileId, string>();
  private interactivePriorityFileIds: FileId[] = [];
  private pendingFileIds: FileId[] = [];
  private scheduledCalculationHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  private isDisposed = false;

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(event => {
      if (shouldUpdateCalculationForSessionChange(event)) {
        this.update(event);
      }
    }));
    this._register(toDisposable(() => {
      this.isDisposed = true;
      this.cancelScheduledCalculation();
      this.clearPendingFiles();
      this.clearInteractivePriorityFiles();
    }));
    this.update();
  }

  public prioritizeCalculationFile(fileId: FileId | null | undefined): void {
    this.prioritizeCalculationFiles([fileId]);
  }

  public prioritizeCalculationFiles(fileIds: readonly (FileId | null | undefined)[]): void {
    const prioritizedFileIds = normalizeFileIds(fileIds);
    if (!prioritizedFileIds.length) {
      return;
    }

    const rememberedFileCount = this.rememberInteractivePriorityFiles(prioritizedFileIds);
    const prioritizedFileCount = this.prioritizeQueuedCalculationFiles(prioritizedFileIds);
    logPerf("calculationService.prioritizeCalculationFiles", {
      fileCount: prioritizedFileIds.length,
      interactivePriorityFileCount: this.interactivePriorityFileIds.length,
      pendingFileCount: this.pendingFileIds.length,
      prioritizedFileCount,
      rememberedFileCount,
    });
    this.schedulePendingCalculation();
  }

  private update(event?: SessionChangeEvent): void {
    const snapshot = this.sessionService.getSnapshot();
    const endUpdatePerf = startPerf("calculationContribution.update", {
      fileCount: Object.keys(snapshot.filesById).length,
      reason: event?.reason ?? "initial",
      sessionVersion: snapshot.sessionVersion,
    });
    this.removeStaleSignatures(snapshot);

    if (event?.reason === "sessionCleared") {
      this.inputSignaturesByFileId.clear();
      this.clearPendingFiles();
      this.clearInteractivePriorityFiles();
      this.cancelScheduledCalculation();
      endUpdatePerf({ result: "sessionCleared" });
      return;
    }

    if (event?.reason === "filesRemoved") {
      const removedFileIds = normalizeFileIds(event.fileIds ?? []);
      for (const fileId of removedFileIds) {
        this.inputSignaturesByFileId.delete(fileId);
      }
      this.removePendingFiles(removedFileIds);
      this.removeInteractivePriorityFiles(removedFileIds);
      endUpdatePerf({
        removedFileCount: removedFileIds.length,
        result: "filesRemoved",
      });
      return;
    }

    const fileIds: FileId[] = [];
    const candidateFileIds = getCalculationUpdateFileIds(event, snapshot);
    for (const fileId of candidateFileIds) {
      const file = snapshot.filesById[fileId];
      if (!file) {
        this.inputSignaturesByFileId.delete(fileId);
        continue;
      }

      const inputSignature = createCalculatedRecordsInputSignature(
        { [fileId]: file },
        [fileId],
      );
      if (inputSignature === this.inputSignaturesByFileId.get(fileId)) {
        continue;
      }

      this.inputSignaturesByFileId.set(fileId, inputSignature);
      fileIds.push(fileId);
    }

    if (!fileIds.length) {
      endUpdatePerf({
        candidateFileCount: candidateFileIds.length,
        result: "unchanged",
      });
      return;
    }

    const enqueueResult = this.enqueuePendingFiles(fileIds);
    const pendingFileCountAfterEnqueue = this.pendingFileIds.length;
    const interactivePriorityFileCountAfterEnqueue = this.interactivePriorityFileIds.length;
    const foregroundResult = this.processPendingCalculationChunk({
      candidateFileCount: candidateFileIds.length,
      chunkSize: CALCULATION_FOREGROUND_CHUNK_SIZE,
      mode: "foreground",
      reason: event?.reason ?? "initial",
    });
    this.schedulePendingCalculation();
    endUpdatePerf({
      candidateFileCount: candidateFileIds.length,
      committedFileCount: foregroundResult.committedFileCount,
      enqueuedFileCount: enqueueResult.enqueuedFileCount,
      fileCount: fileIds.length,
      interactiveEnqueuedFileCount: enqueueResult.interactiveEnqueuedFileCount,
      interactivePriorityFileCount: interactivePriorityFileCountAfterEnqueue,
      pendingFileCountAfterEnqueue,
      pendingFileCount: this.pendingFileIds.length,
      result: this.pendingFileIds.length ? "queued" : "committed",
    });
  }

  private processPendingCalculationChunk({
    candidateFileCount,
    chunkSize,
    mode,
    reason,
  }: {
    readonly candidateFileCount: number;
    readonly chunkSize: number;
    readonly mode: "foreground" | "background";
    readonly reason: string;
  }): { committedFileCount: number } {
    if (chunkSize <= 0 || !this.pendingFileIds.length) {
      return { committedFileCount: 0 };
    }

    const pendingBefore = this.pendingFileIds.length;
    const chunkFileIds = this.takePendingFiles(chunkSize);
    const interactivePriorityFileCount = this.countInteractivePriorityFiles(chunkFileIds);
    this.removeInteractivePriorityFiles(chunkFileIds);
    const snapshot = this.sessionService.getSnapshot();
    const filesById: Record<FileId, FileRecord> = {};
    const fileIds: FileId[] = [];
    let missingFileCount = 0;
    let refreshedSignatureCount = 0;

    for (const fileId of chunkFileIds) {
      const file = snapshot.filesById[fileId];
      if (!file) {
        this.inputSignaturesByFileId.delete(fileId);
        missingFileCount += 1;
        continue;
      }

      const inputSignature = createCalculatedRecordsInputSignature(
        { [fileId]: file },
        [fileId],
      );
      if (inputSignature !== this.inputSignaturesByFileId.get(fileId)) {
        this.inputSignaturesByFileId.set(fileId, inputSignature);
        refreshedSignatureCount += 1;
      }
      filesById[fileId] = file;
      fileIds.push(fileId);
    }

    if (!fileIds.length) {
      return { committedFileCount: 0 };
    }

    const endBuildPerf = startPerf("calculationContribution.buildRecords", {
      candidateFileCount,
      chunkMode: mode,
      fileCount: fileIds.length,
      interactivePriorityFileCount,
      missingFileCount,
      pendingFileCount: pendingBefore,
      reason,
      refreshedSignatureCount,
      sessionVersion: snapshot.sessionVersion,
    });
    const { curvesByFileId, metricsByFileId } = createCalculatedRecordsByFile(
      filesById,
      fileIds,
    );
    endBuildPerf({
      curveCount: countRecordArrayItems(curvesByFileId),
      metricCount: countRecordArrayItems(metricsByFileId),
    });
    const commits: CommitCalculatedRecordsInput[] = fileIds.map(fileId => ({
      fileId,
      curves: curvesByFileId[fileId] ?? [],
      metrics: metricsByFileId[fileId] ?? [],
      replaceCurveGenerations: ["derived", "secondDerived"],
      replaceMetrics: true,
    }));

    this.sessionService.commitCalculatedRecordsBatch(commits);
    return { committedFileCount: fileIds.length };
  }

  private schedulePendingCalculation(): void {
    if (this.isDisposed || this.scheduledCalculationHandle !== null || !this.pendingFileIds.length) {
      return;
    }

    this.scheduledCalculationHandle = globalThis.setTimeout(() => {
      this.scheduledCalculationHandle = null;
      const endFlushPerf = startPerf("calculationContribution.flushPending", {
        chunkSize: CALCULATION_BACKGROUND_CHUNK_SIZE,
        interactivePriorityFileCount: this.countInteractivePriorityFiles(this.pendingFileIds),
        pendingFileCount: this.pendingFileIds.length,
      });
      const result = this.processPendingCalculationChunk({
        candidateFileCount: this.pendingFileIds.length,
        chunkSize: CALCULATION_BACKGROUND_CHUNK_SIZE,
        mode: "background",
        reason: "pending",
      });
      endFlushPerf({
        committedFileCount: result.committedFileCount,
        remainingFileCount: this.pendingFileIds.length,
      });
      this.schedulePendingCalculation();
    }, CALCULATION_BACKGROUND_DELAY_MS);
  }

  private cancelScheduledCalculation(): void {
    if (this.scheduledCalculationHandle === null) {
      return;
    }

    globalThis.clearTimeout(this.scheduledCalculationHandle);
    this.scheduledCalculationHandle = null;
  }

  private enqueuePendingFiles(fileIds: readonly FileId[]): {
    readonly enqueuedFileCount: number;
    readonly interactiveEnqueuedFileCount: number;
  } {
    const prioritizedFileIds = normalizeFileIds(fileIds);
    if (!prioritizedFileIds.length) {
      return {
        enqueuedFileCount: 0,
        interactiveEnqueuedFileCount: 0,
      };
    }

    const interactiveEnqueuedFileCount = this.countInteractivePriorityFiles(prioritizedFileIds);
    const prioritizedFileIdSet = new Set(prioritizedFileIds);
    this.pendingFileIds = this.orderByInteractivePriority([
      ...prioritizedFileIds,
      ...this.pendingFileIds.filter(fileId => !prioritizedFileIdSet.has(fileId)),
    ]);
    return {
      enqueuedFileCount: prioritizedFileIds.length,
      interactiveEnqueuedFileCount,
    };
  }

  private prioritizeQueuedCalculationFiles(fileIds: readonly FileId[]): number {
    const prioritizedFileIds = normalizeFileIds(fileIds);
    if (!prioritizedFileIds.length || !this.pendingFileIds.length) {
      return 0;
    }

    const pendingFileIdSet = new Set(this.pendingFileIds);
    const queuedPriorityFileIds = prioritizedFileIds.filter(fileId => pendingFileIdSet.has(fileId));
    if (!queuedPriorityFileIds.length) {
      return 0;
    }

    this.pendingFileIds = this.orderByInteractivePriority(this.pendingFileIds);
    return queuedPriorityFileIds.length;
  }

  private rememberInteractivePriorityFiles(fileIds: readonly FileId[]): number {
    const prioritizedFileIds = normalizeFileIds(fileIds);
    if (!prioritizedFileIds.length) {
      return 0;
    }

    const prioritizedFileIdSet = new Set(prioritizedFileIds);
    this.interactivePriorityFileIds = [
      ...prioritizedFileIds,
      ...this.interactivePriorityFileIds.filter(fileId => !prioritizedFileIdSet.has(fileId)),
    ].slice(0, CALCULATION_INTERACTIVE_PRIORITY_LIMIT);
    return prioritizedFileIds.length;
  }

  private orderByInteractivePriority(fileIds: readonly FileId[]): FileId[] {
    const queuedFileIds = normalizeFileIds(fileIds);
    if (!queuedFileIds.length || !this.interactivePriorityFileIds.length) {
      return queuedFileIds;
    }

    const priorityIndexesByFileId = new Map(
      this.interactivePriorityFileIds.map((fileId, index) => [fileId, index]),
    );
    const priorityEntries: Array<FileId | null> = this.interactivePriorityFileIds.map(() => null);
    const rest: FileId[] = [];
    for (const fileId of queuedFileIds) {
      const priorityIndex = priorityIndexesByFileId.get(fileId);
      if (priorityIndex === undefined) {
        rest.push(fileId);
        continue;
      }
      priorityEntries[priorityIndex] = fileId;
    }
    return [
      ...priorityEntries.filter((fileId): fileId is FileId => Boolean(fileId)),
      ...rest,
    ];
  }

  private countInteractivePriorityFiles(fileIds: readonly FileId[]): number {
    const prioritizedFileIds = normalizeFileIds(fileIds);
    if (!prioritizedFileIds.length || !this.interactivePriorityFileIds.length) {
      return 0;
    }

    const interactivePriorityFileIds = new Set(this.interactivePriorityFileIds);
    return prioritizedFileIds.reduce(
      (count, fileId) => count + (interactivePriorityFileIds.has(fileId) ? 1 : 0),
      0,
    );
  }

  private takePendingFiles(count: number): FileId[] {
    return this.pendingFileIds.splice(0, count);
  }

  private removePendingFiles(fileIds: readonly FileId[]): void {
    const removedFileIds = new Set(normalizeFileIds(fileIds));
    if (!removedFileIds.size) {
      return;
    }

    this.pendingFileIds = this.pendingFileIds.filter(fileId => !removedFileIds.has(fileId));
  }

  private removeInteractivePriorityFiles(fileIds: readonly FileId[]): void {
    const removedFileIds = new Set(normalizeFileIds(fileIds));
    if (!removedFileIds.size) {
      return;
    }

    this.interactivePriorityFileIds = this.interactivePriorityFileIds.filter(fileId => !removedFileIds.has(fileId));
  }

  private clearPendingFiles(): void {
    this.pendingFileIds = [];
  }

  private clearInteractivePriorityFiles(): void {
    this.interactivePriorityFileIds = [];
  }

  private removeStaleSignatures(snapshot: SessionSnapshot): void {
    const liveFileIds = new Set(getSnapshotFileIds(snapshot));
    for (const fileId of this.inputSignaturesByFileId.keys()) {
      if (!liveFileIds.has(fileId)) {
        this.inputSignaturesByFileId.delete(fileId);
      }
    }
    this.removePendingFiles(
      this.pendingFileIds.filter(fileId => !liveFileIds.has(fileId)),
    );
    this.removeInteractivePriorityFiles(
      this.interactivePriorityFileIds.filter(fileId => !liveFileIds.has(fileId)),
    );
  }
}

export const shouldUpdateCalculationForSessionChange = (
  event: SessionChangeEvent,
): boolean => {
  switch (event.reason) {
    case "templateRunChanged":
    case "filesRemoved":
    case "sessionCleared":
    case "metricInputsChanged":
      return true;
    case "curvesChanged":
      return hasBaseCurveChange(event);
    case "rawTablesChanged":
    case "assessmentChanged":
    case "calculatedRecordsChanged":
    case "metricsChanged":
      return false;
  }
};

const hasBaseCurveChange = (event: SessionChangeEvent): boolean => {
  const curveKeys = event.curveKeys ?? [];
  return curveKeys.length === 0 || curveKeys.some(curveKey => curveKey.startsWith("base:"));
};

const getCalculationUpdateFileIds = (
  event: SessionChangeEvent | undefined,
  snapshot: SessionSnapshot,
): readonly FileId[] => {
  const eventFileIds = normalizeFileIds(event?.fileIds ?? []);
  return event && eventFileIds.length > 0
    ? eventFileIds.filter(fileId => Boolean(snapshot.filesById[fileId]))
    : getSnapshotFileIds(snapshot);
};

const getSnapshotFileIds = (snapshot: SessionSnapshot): readonly FileId[] =>
  normalizeFileIds([
    ...snapshot.fileOrder,
    ...Object.keys(snapshot.filesById),
  ]);

const normalizeFileIds = (fileIds: readonly unknown[]): FileId[] => {
  const seen = new Set<FileId>();
  const result: FileId[] = [];
  for (const fileId of fileIds) {
    const normalized = String(fileId ?? "").trim() as FileId;
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const countRecordArrayItems = <T,>(
  record: Readonly<Record<string, readonly T[] | undefined>>,
): number =>
  Object.values(record).reduce((total, items) => total + (items?.length ?? 0), 0);
