/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  Disposable,
  toDisposable,
} from "src/cs/base/common/lifecycle";
import { getPerfNow, logPerf, startPerf } from "src/cs/workbench/common/perf";
import {
  type CalculationRecordsBackendOutput,
  type ICalculationRecordsBackend,
} from "src/cs/workbench/services/calculation/common/calculationRecordsBackend";
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

const CALCULATION_BACKGROUND_CHUNK_SIZE = 1;
const CALCULATION_BACKGROUND_DELAY_MS = 0;
const CALCULATION_INTERACTIVE_CHUNK_SIZE = 1;
const CALCULATION_INTERACTIVE_PRIORITY_LIMIT = 24;
const CALCULATION_WORKER_CONCURRENCY_LIMIT = 1;

type CalculationChunkResult = {
  readonly committedFileCount: number;
  readonly fileIds: readonly FileId[];
};

type CalculationChunkMode = "foreground" | "background";

type CalculationChunkInput = {
  readonly candidateFileCount: number;
  readonly fileIds: readonly FileId[];
  readonly filesById: Record<FileId, FileRecord>;
  readonly inputSignaturesByFileId: Readonly<Record<FileId, string>>;
  readonly interactivePriorityFileCount: number;
  readonly missingFileCount: number;
  readonly mode: CalculationChunkMode;
  readonly pendingBefore: number;
  readonly reason: string;
  readonly refreshedSignatureCount: number;
  readonly sessionVersion: number;
};

type CalculationRecordsByFile = ReturnType<typeof createCalculatedRecordsByFile>;

type CalculationWorkerSlot = {
  readonly activeWorkerCountBefore: number;
  readonly queuedWorkerCountBefore: number;
  readonly release: () => void;
  readonly workerWaitMs: number;
};

type PendingCalculationWorkerSlot = {
  readonly mode: CalculationChunkMode;
  readonly resolve: () => void;
};

const EMPTY_CALCULATION_CHUNK_RESULT: CalculationChunkResult = {
  committedFileCount: 0,
  fileIds: [],
};

export class CalculationService extends Disposable implements ICalculationService {
  public declare readonly _serviceBrand: undefined;

  private readonly inputSignaturesByFileId = new Map<FileId, string>();
  private interactivePriorityFileIds: FileId[] = [];
  private pendingFileIds: FileId[] = [];
  private scheduledCalculationHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  private isDisposed = false;
  private isBackgroundCalculationInFlight = false;
  private isInteractiveCalculationInFlight = false;
  private nextCalculationWorkerRequestId = 1;
  private activeCalculationWorkerCount = 0;
  private readonly pendingCalculationWorkerSlots: PendingCalculationWorkerSlot[] = [];

  constructor(
    private readonly calculationRecordsBackend: ICalculationRecordsBackend,
    @ISessionService private readonly sessionService: ISessionService,
  ) {
    super();

    this._register(this.calculationRecordsBackend);
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
      this.releasePendingCalculationWorkerSlots();
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

    const pendingFileCountBefore = this.pendingFileIds.length;
    const rememberedFileCount = this.rememberInteractivePriorityFiles(prioritizedFileIds);
    const prioritizedFileCount = this.prioritizeQueuedCalculationFiles(prioritizedFileIds);
    const interactiveResult = prioritizedFileCount > 0
      ? this.processInteractivePriorityCalculation("interactivePriority")
      : EMPTY_CALCULATION_CHUNK_RESULT;
    logPerf("calculationService.prioritizeCalculationFiles", {
      fileCount: prioritizedFileIds.length,
      fileIds: prioritizedFileIds,
      interactiveCommittedFileCount: interactiveResult.committedFileCount,
      interactiveCommittedFileIds: interactiveResult.fileIds,
      interactivePriorityFileCount: this.interactivePriorityFileIds.length,
      pendingFileCountAfter: this.pendingFileIds.length,
      pendingFileCountBefore,
      pendingFileCount: this.pendingFileIds.length,
      prioritizedFileCount,
      rememberedFileCount,
    });
    this.schedulePendingCalculation({
      allowInteractivePriority: prioritizedFileCount === 0 || this.calculationRecordsBackend.isSupported(),
    });
  }

  private update(event?: SessionChangeEvent): void {
    const snapshot = this.sessionService.getSnapshot();
    const candidateFileIds = getCalculationUpdateFileIds(event, snapshot);
    const endUpdatePerf = startPerf("calculationContribution.update", {
      candidateFileIds,
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
    const foregroundPriorityFileIds = this.getInteractivePriorityFiles(this.pendingFileIds);
    const foregroundResult = foregroundPriorityFileIds.length
      ? this.processInteractivePriorityCalculation(event?.reason ?? "initial")
      : EMPTY_CALCULATION_CHUNK_RESULT;
    this.schedulePendingCalculation({
      allowInteractivePriority: foregroundPriorityFileIds.length === 0 || this.calculationRecordsBackend.isSupported(),
    });
    endUpdatePerf({
      candidateFileCount: candidateFileIds.length,
      committedFileIds: foregroundResult.fileIds,
      committedFileCount: foregroundResult.committedFileCount,
      enqueuedFileCount: enqueueResult.enqueuedFileCount,
      enqueuedFileIds: fileIds,
      fileCount: fileIds.length,
      fileIds,
      foregroundFileIds: foregroundResult.fileIds,
      foregroundPriorityFileIds,
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
  }): CalculationChunkResult {
    const chunkInput = this.takePendingCalculationChunkInput({
      candidateFileCount,
      chunkSize,
      mode,
      reason,
    });
    if (!chunkInput) {
      return EMPTY_CALCULATION_CHUNK_RESULT;
    }

    const records = this.buildCalculatedRecordsOnMainThread(chunkInput, {
      worker: false,
    });
    return this.commitCalculatedRecords(chunkInput.fileIds, records);
  }

  private async processPendingCalculationChunkInWorker({
    candidateFileCount,
    chunkSize,
    mode,
    reason,
  }: {
    readonly candidateFileCount: number;
    readonly chunkSize: number;
    readonly mode: CalculationChunkMode;
    readonly reason: string;
  }): Promise<CalculationChunkResult> {
    const chunkInput = this.takePendingCalculationChunkInput({
      candidateFileCount,
      chunkSize,
      mode,
      reason,
    });
    if (!chunkInput) {
      return EMPTY_CALCULATION_CHUNK_RESULT;
    }

    if (chunkInput.fileIds.length !== 1) {
      const records = this.buildCalculatedRecordsOnMainThread(chunkInput, {
        worker: false,
        workerFallback: "multiFileChunk",
      });
      return this.commitCalculatedRecords(chunkInput.fileIds, records);
    }

    const [fileId] = chunkInput.fileIds;
    const file = chunkInput.filesById[fileId];
    const requestId = this.nextCalculationWorkerRequestId++;
    const endBuildPerf = this.startCalculationBuildPerf(chunkInput, {
      requestId,
      worker: true,
    });
    const workerSlot = await this.acquireCalculationWorkerSlot(chunkInput.mode);

    if (!workerSlot) {
      endBuildPerf({
        result: "disposed",
        worker: true,
        workerConcurrencyLimit: CALCULATION_WORKER_CONCURRENCY_LIMIT,
      });
      return EMPTY_CALCULATION_CHUNK_RESULT;
    }

    const workerSlotMetadata = this.createCalculationWorkerSlotMetadata(workerSlot);
    try {
      if (this.isDisposed) {
        endBuildPerf({
          result: "disposed",
          worker: true,
          ...workerSlotMetadata,
        });
        return EMPTY_CALCULATION_CHUNK_RESULT;
      }

      if (!this.isCurrentCalculationChunkInput(chunkInput)) {
        endBuildPerf({
          fileIds: chunkInput.fileIds,
          result: "staleBeforeWorker",
          worker: true,
          ...workerSlotMetadata,
        });
        return EMPTY_CALCULATION_CHUNK_RESULT;
      }

      const workerResult = await this.calculationRecordsBackend.calculateRecords({
        file,
        requestId,
        sessionVersion: chunkInput.sessionVersion,
      });

      if (this.isDisposed) {
        endBuildPerf({
          result: "disposed",
          worker: true,
          ...workerSlotMetadata,
        });
        return EMPTY_CALCULATION_CHUNK_RESULT;
      }

      if (this.isCurrentCalculationWorkerResult(chunkInput, workerResult, requestId)) {
        const records: CalculationRecordsByFile = {
          curvesByFileId: { [fileId]: [...workerResult.curves] },
          metricsByFileId: { [fileId]: [...workerResult.metrics] },
        };
        endBuildPerf({
          curveCount: countRecordArrayItems(records.curvesByFileId),
          fileIds: chunkInput.fileIds,
          metricCount: countRecordArrayItems(records.metricsByFileId),
          result: "worker",
          worker: true,
          ...workerSlotMetadata,
        });
        return this.commitCalculatedRecords(chunkInput.fileIds, records);
      }

      if (workerResult) {
        endBuildPerf({
          fileIds: chunkInput.fileIds,
          result: "staleWorkerResult",
          worker: true,
          ...workerSlotMetadata,
        });
        return EMPTY_CALCULATION_CHUNK_RESULT;
      }

      if (!this.isCurrentCalculationChunkInput(chunkInput)) {
        endBuildPerf({
          fileIds: chunkInput.fileIds,
          result: "staleWorkerFallbackSkipped",
          worker: true,
          ...workerSlotMetadata,
        });
        return EMPTY_CALCULATION_CHUNK_RESULT;
      }

      const records = createCalculatedRecordsByFile(
        chunkInput.filesById,
        chunkInput.fileIds,
      );
      endBuildPerf({
        curveCount: countRecordArrayItems(records.curvesByFileId),
        fileIds: chunkInput.fileIds,
        metricCount: countRecordArrayItems(records.metricsByFileId),
        result: "workerFallback",
        worker: false,
        workerFallback: true,
        ...workerSlotMetadata,
      });
      return this.commitCalculatedRecords(chunkInput.fileIds, records);
    } finally {
      workerSlot.release();
    }
  }

  private takePendingCalculationChunkInput({
    candidateFileCount,
    chunkSize,
    mode,
    reason,
  }: {
    readonly candidateFileCount: number;
    readonly chunkSize: number;
    readonly mode: CalculationChunkMode;
    readonly reason: string;
  }): CalculationChunkInput | null {
    if (chunkSize <= 0 || !this.pendingFileIds.length) {
      return null;
    }

    const pendingBefore = this.pendingFileIds.length;
    const chunkFileIds = this.takePendingFiles(chunkSize);
    const interactivePriorityFileCount = this.countInteractivePriorityFiles(chunkFileIds);
    this.removeInteractivePriorityFiles(chunkFileIds);
    const snapshot = this.sessionService.getSnapshot();
    const filesById: Record<FileId, FileRecord> = {};
    const inputSignaturesByFileId: Record<FileId, string> = {};
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
      inputSignaturesByFileId[fileId] = inputSignature;
      filesById[fileId] = file;
      fileIds.push(fileId);
    }

    if (!fileIds.length) {
      return null;
    }

    return {
      candidateFileCount,
      fileIds,
      filesById,
      inputSignaturesByFileId,
      interactivePriorityFileCount,
      missingFileCount,
      mode,
      pendingBefore,
      reason,
      refreshedSignatureCount,
      sessionVersion: snapshot.sessionVersion,
    };
  }

  private buildCalculatedRecordsOnMainThread(
    chunkInput: CalculationChunkInput,
    metadata: Record<string, unknown>,
  ): CalculationRecordsByFile {
    const endBuildPerf = this.startCalculationBuildPerf(chunkInput, metadata);
    const records = createCalculatedRecordsByFile(
      chunkInput.filesById,
      chunkInput.fileIds,
    );
    endBuildPerf({
      curveCount: countRecordArrayItems(records.curvesByFileId),
      fileIds: chunkInput.fileIds,
      metricCount: countRecordArrayItems(records.metricsByFileId),
    });
    return records;
  }

  private startCalculationBuildPerf(
    chunkInput: CalculationChunkInput,
    metadata: Record<string, unknown>,
  ): (metadata?: Record<string, unknown>) => void {
    return startPerf("calculationContribution.buildRecords", {
      candidateFileCount: chunkInput.candidateFileCount,
      chunkMode: chunkInput.mode,
      fileCount: chunkInput.fileIds.length,
      fileIds: chunkInput.fileIds,
      interactivePriorityFileCount: chunkInput.interactivePriorityFileCount,
      missingFileCount: chunkInput.missingFileCount,
      pendingFileCount: chunkInput.pendingBefore,
      reason: chunkInput.reason,
      refreshedSignatureCount: chunkInput.refreshedSignatureCount,
      sessionVersion: chunkInput.sessionVersion,
      ...metadata,
    });
  }

  private async acquireCalculationWorkerSlot(mode: CalculationChunkMode): Promise<CalculationWorkerSlot | null> {
    if (this.isDisposed) {
      return null;
    }

    const requestedAt = getPerfNow();
    const activeWorkerCountBefore = this.activeCalculationWorkerCount;
    const queuedWorkerCountBefore = this.pendingCalculationWorkerSlots.length;
    if (this.activeCalculationWorkerCount < CALCULATION_WORKER_CONCURRENCY_LIMIT) {
      this.activeCalculationWorkerCount += 1;
      return {
        activeWorkerCountBefore,
        queuedWorkerCountBefore,
        release: () => this.releaseCalculationWorkerSlot(),
        workerWaitMs: 0,
      };
    }

    await new Promise<void>(resolve => {
      this.pendingCalculationWorkerSlots.push({ mode, resolve });
    });
    if (this.isDisposed) {
      this.releaseCalculationWorkerSlot();
      return null;
    }

    return {
      activeWorkerCountBefore,
      queuedWorkerCountBefore,
      release: () => this.releaseCalculationWorkerSlot(),
      workerWaitMs: getPerfNow() - requestedAt,
    };
  }

  private releaseCalculationWorkerSlot(): void {
    this.activeCalculationWorkerCount = Math.max(0, this.activeCalculationWorkerCount - 1);
    if (this.isDisposed) {
      this.releasePendingCalculationWorkerSlots();
      return;
    }

    if (this.activeCalculationWorkerCount >= CALCULATION_WORKER_CONCURRENCY_LIMIT) {
      return;
    }

    const nextSlotIndex = this.pendingCalculationWorkerSlots.findIndex(slot => slot.mode === "foreground");
    const [nextSlot] = this.pendingCalculationWorkerSlots.splice(
      nextSlotIndex >= 0 ? nextSlotIndex : 0,
      1,
    );
    if (!nextSlot) {
      return;
    }

    this.activeCalculationWorkerCount += 1;
    nextSlot.resolve();
  }

  private releasePendingCalculationWorkerSlots(): void {
    const pendingSlots = this.pendingCalculationWorkerSlots.splice(0);
    for (const slot of pendingSlots) {
      slot.resolve();
    }
  }

  private createCalculationWorkerSlotMetadata(slot: CalculationWorkerSlot): Record<string, unknown> {
    return {
      activeWorkerCountBefore: slot.activeWorkerCountBefore,
      queuedWorkerCountBefore: slot.queuedWorkerCountBefore,
      workerConcurrencyLimit: CALCULATION_WORKER_CONCURRENCY_LIMIT,
      workerWaitMs: slot.workerWaitMs,
    };
  }

  private commitCalculatedRecords(
    fileIds: readonly FileId[],
    records: CalculationRecordsByFile,
  ): CalculationChunkResult {
    const commits: CommitCalculatedRecordsInput[] = fileIds.map(fileId => ({
      fileId,
      curves: records.curvesByFileId[fileId] ?? [],
      metrics: records.metricsByFileId[fileId] ?? [],
      replaceCurveGenerations: ["derived", "secondDerived"],
      replaceMetrics: true,
    }));

    this.sessionService.commitCalculatedRecordsBatch(commits);
    return { committedFileCount: fileIds.length, fileIds };
  }

  private isCurrentCalculationWorkerResult(
    chunkInput: CalculationChunkInput,
    result: CalculationRecordsBackendOutput | null,
    requestId: number,
  ): result is CalculationRecordsBackendOutput {
    if (!result || result.requestId !== requestId) {
      return false;
    }

    const [fileId] = chunkInput.fileIds;
    return (
      result.fileId === fileId &&
      result.sessionVersion === chunkInput.sessionVersion &&
      this.isCurrentCalculationChunkInput(chunkInput)
    );
  }

  private isCurrentCalculationChunkInput(chunkInput: CalculationChunkInput): boolean {
    const snapshot = this.sessionService.getSnapshot();
    for (const fileId of chunkInput.fileIds) {
      if (!snapshot.filesById[fileId]) {
        return false;
      }
      if (this.inputSignaturesByFileId.get(fileId) !== chunkInput.inputSignaturesByFileId[fileId]) {
        return false;
      }
    }
    return true;
  }

  private processInteractivePriorityCalculation(reason: string): CalculationChunkResult {
    if (!this.countInteractivePriorityFiles(this.pendingFileIds)) {
      return EMPTY_CALCULATION_CHUNK_RESULT;
    }

    this.cancelScheduledCalculation();
    if (this.calculationRecordsBackend.isSupported()) {
      void this.flushInteractivePriorityCalculation(reason);
      return EMPTY_CALCULATION_CHUNK_RESULT;
    }

    const result = this.processPendingCalculationChunk({
      candidateFileCount: this.pendingFileIds.length,
      chunkSize: CALCULATION_INTERACTIVE_CHUNK_SIZE,
      mode: "foreground",
      reason,
    });
    this.schedulePendingCalculation({ allowInteractivePriority: false });
    return result;
  }

  private schedulePendingCalculation(options: {
    readonly allowInteractivePriority?: boolean;
  } = {}): void {
    const allowInteractivePriority = options.allowInteractivePriority !== false;
    if (allowInteractivePriority && this.countInteractivePriorityFiles(this.pendingFileIds)) {
      this.processInteractivePriorityCalculation("interactivePriority");
      return;
    }

    if (
      this.isDisposed ||
      this.isBackgroundCalculationInFlight ||
      this.isInteractiveCalculationInFlight ||
      this.scheduledCalculationHandle !== null ||
      !this.pendingFileIds.length
    ) {
      return;
    }

    this.scheduledCalculationHandle = globalThis.setTimeout(() => {
      this.scheduledCalculationHandle = null;
      void this.flushPendingCalculation();
    }, CALCULATION_BACKGROUND_DELAY_MS);
  }

  private async flushInteractivePriorityCalculation(reason: string): Promise<void> {
    if (
      this.isDisposed ||
      this.isInteractiveCalculationInFlight ||
      !this.countInteractivePriorityFiles(this.pendingFileIds)
    ) {
      return;
    }

    this.isInteractiveCalculationInFlight = true;
    const pendingFileIds = [...this.pendingFileIds];
    const interactivePriorityFileIds = this.getInteractivePriorityFiles(pendingFileIds);
    const endFlushPerf = startPerf("calculationContribution.flushInteractivePriority", {
      chunkSize: CALCULATION_INTERACTIVE_CHUNK_SIZE,
      interactivePriorityFileCount: interactivePriorityFileIds.length,
      interactivePriorityFileIds,
      pendingFileIds,
      pendingFileCount: this.pendingFileIds.length,
      worker: true,
    });
    try {
      const result = await this.processPendingCalculationChunkInWorker({
        candidateFileCount: this.pendingFileIds.length,
        chunkSize: CALCULATION_INTERACTIVE_CHUNK_SIZE,
        mode: "foreground",
        reason,
      });
      endFlushPerf({
        committedFileIds: result.fileIds,
        committedFileCount: result.committedFileCount,
        remainingFileCount: this.pendingFileIds.length,
        remainingFileIds: [...this.pendingFileIds],
      });
    } finally {
      this.isInteractiveCalculationInFlight = false;
      if (this.countInteractivePriorityFiles(this.pendingFileIds)) {
        void this.flushInteractivePriorityCalculation("interactivePriority");
      } else {
        this.schedulePendingCalculation();
      }
    }
  }

  private async flushPendingCalculation(): Promise<void> {
    if (
      this.isDisposed ||
      this.isBackgroundCalculationInFlight ||
      this.isInteractiveCalculationInFlight ||
      !this.pendingFileIds.length
    ) {
      return;
    }

    if (this.countInteractivePriorityFiles(this.pendingFileIds)) {
      this.processInteractivePriorityCalculation("interactivePriority");
      return;
    }

    this.isBackgroundCalculationInFlight = true;
    const pendingFileIds = [...this.pendingFileIds];
    const interactivePriorityFileIds = this.getInteractivePriorityFiles(pendingFileIds);
    const endFlushPerf = startPerf("calculationContribution.flushPending", {
      chunkSize: CALCULATION_BACKGROUND_CHUNK_SIZE,
      interactivePriorityFileCount: interactivePriorityFileIds.length,
      interactivePriorityFileIds,
      pendingFileIds,
      pendingFileCount: this.pendingFileIds.length,
      worker: true,
    });
    try {
      const result = await this.processPendingCalculationChunkInWorker({
        candidateFileCount: this.pendingFileIds.length,
        chunkSize: CALCULATION_BACKGROUND_CHUNK_SIZE,
        mode: "background",
        reason: "pending",
      });
      endFlushPerf({
        committedFileIds: result.fileIds,
        committedFileCount: result.committedFileCount,
        remainingFileCount: this.pendingFileIds.length,
        remainingFileIds: [...this.pendingFileIds],
      });
    } finally {
      this.isBackgroundCalculationInFlight = false;
      this.schedulePendingCalculation();
    }
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
    return this.getInteractivePriorityFiles(fileIds).length;
  }

  private getInteractivePriorityFiles(fileIds: readonly FileId[]): FileId[] {
    const prioritizedFileIds = normalizeFileIds(fileIds);
    if (!prioritizedFileIds.length || !this.interactivePriorityFileIds.length) {
      return [];
    }

    const interactivePriorityFileIds = new Set(this.interactivePriorityFileIds);
    return prioritizedFileIds.filter(fileId => interactivePriorityFileIds.has(fileId));
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
	    case "sliceRunChanged":
	    case "filesRemoved":
    case "sessionCleared":
    case "metricInputsChanged":
      return true;
    case "curvesChanged":
      return hasBaseCurveChange(event);
    case "rawTablesChanged":
    case "calculatedRecordsChanged":
    case "metricsChanged":
      return false;
  }
  return false;
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
