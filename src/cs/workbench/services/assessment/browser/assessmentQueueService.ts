/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IAssessmentQueueService,
  IAssessmentService,
  type AssessmentQueuePriority,
  type IAssessmentQueueService as IAssessmentQueueServiceType,
  type IAssessmentService as IAssessmentServiceType,
  type RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  IRawTableRowsReaderService,
  type IRawTableRowsReaderService as IRawTableRowsReaderServiceType,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type {
  FileRecord,
  RawTableRef,
  TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  ISessionService,
  type SessionSnapshot,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

const RAW_TABLE_ASSESSMENT_PREVIEW_ROWS = 256;
const RAW_TABLE_ASSESSMENT_BACKGROUND_COMMIT_BATCH_SIZE = 16;

export class AssessmentQueueService extends Disposable implements IAssessmentQueueServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly pendingBackgroundRefsByKey = new Map<string, RawTableRef>();
  private readonly pendingNearbyRefsByKey = new Map<string, RawTableRef>();
  private readonly pendingVisibleRefsByKey = new Map<string, RawTableRef>();
  private readonly preferredOrderByKey = new Map<string, number>();
  private readonly preferredPriorityByKey = new Map<string, AssessmentQueuePriority>();
  private disposed = false;
  private isAssessmentQueueRunning = false;
  private nextPreferredOrder = 0;

  public constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
    @IAssessmentService private readonly assessmentService: IAssessmentServiceType,
    @IRawTableRowsReaderService private readonly rawTableRowsReaderService: IRawTableRowsReaderServiceType,
  ) {
    super();
  }

  public override dispose(): void {
    this.disposed = true;
    this.pendingBackgroundRefsByKey.clear();
    this.pendingNearbyRefsByKey.clear();
    this.pendingVisibleRefsByKey.clear();
    this.preferredOrderByKey.clear();
    this.preferredPriorityByKey.clear();
    super.dispose();
  }

  public enqueueRawTables(refs: readonly RawTableRef[]): void {
    for (const ref of uniqueRawTableRefs(refs)) {
      const key = getRawTableRefKey(ref);
      if (this.hasPendingRawTableRef(key)) {
        continue;
      }

      const priority = this.preferredPriorityByKey.get(key) ?? "background";
      this.getQueueForPriority(priority).set(key, ref);
      this.reorderQueueForPriority(priority);
    }

    this.startAssessmentQueue();
  }

  public prioritizeRawTables(
    refs: readonly RawTableRef[],
    priority: AssessmentQueuePriority,
  ): void {
    for (const ref of uniqueRawTableRefs(refs)) {
      const key = getRawTableRefKey(ref);
      this.preferredPriorityByKey.set(key, priority);
      this.preferredOrderByKey.set(key, this.nextPreferredOrder);
      this.nextPreferredOrder += 1;
      this.movePendingRawTableRef(ref, key, priority);
    }

    this.startAssessmentQueue();
  }

  private startAssessmentQueue(): void {
    if (!this.isAssessmentQueueRunning) {
      void this.drainAssessmentQueue();
    }
  }

  private async drainAssessmentQueue(): Promise<void> {
    if (this.isAssessmentQueueRunning) {
      return;
    }

    this.isAssessmentQueueRunning = true;
    const assessments: RawTableAssessmentRecord[] = [];
    let hasCommittedAssessment = false;
    try {
      while (!this.disposed) {
        const ref = this.shiftPendingRawTableRef();
        if (!ref) {
          break;
        }

        const assessment = await this.assessRawTableRef(ref);
        if (!assessment || this.disposed) {
          continue;
        }

        assessments.push(assessment);
        const commitBatchSize = hasCommittedAssessment
          ? RAW_TABLE_ASSESSMENT_BACKGROUND_COMMIT_BATCH_SIZE
          : 1;
        if (assessments.length >= commitBatchSize) {
          this.sessionService.commitRawTableAssessments(assessments);
          assessments.length = 0;
          hasCommittedAssessment = true;
        }
      }

      if (!this.disposed && assessments.length > 0) {
        this.sessionService.commitRawTableAssessments(assessments);
      }
    } finally {
      this.isAssessmentQueueRunning = false;
      if (!this.disposed && this.hasPendingRawTableRefs()) {
        void this.drainAssessmentQueue();
      }
    }
  }

  private async assessRawTableRef(ref: RawTableRef): Promise<RawTableAssessmentRecord | null> {
    const snapshot = this.sessionService.getSnapshot();
    const file = snapshot.filesById[ref.fileId];
    if (!file) {
      return null;
    }

    const rawTableId = ref.rawTableId;
    const table = file.raw.tablesById[rawTableId];
    if (!table || hasCurrentAssessment(file, rawTableId)) {
      return null;
    }

    const rows = await readRowsForAssessment(file, table, this.rawTableRowsReaderService);
    if (!rows || this.disposed) {
      return null;
    }

    return this.assessmentService.assessRawTable({
      columnCount: table.columnCount,
      fileId: file.id,
      fileName: getAssessmentSourceName(file),
      rawTableId,
      rowCount: table.rowCount,
      rows,
      sourceRawTableVersion: file.rawTableVersionsById[rawTableId] ?? 0,
    });
  }

  private getQueueForPriority(
    priority: AssessmentQueuePriority,
  ): Map<string, RawTableRef> {
    switch (priority) {
      case "visible":
        return this.pendingVisibleRefsByKey;
      case "nearby":
        return this.pendingNearbyRefsByKey;
      case "background":
        return this.pendingBackgroundRefsByKey;
    }
  }

  private hasPendingRawTableRef(key: string): boolean {
    return this.pendingVisibleRefsByKey.has(key) ||
      this.pendingNearbyRefsByKey.has(key) ||
      this.pendingBackgroundRefsByKey.has(key);
  }

  private hasPendingRawTableRefs(): boolean {
    return this.pendingVisibleRefsByKey.size > 0 ||
      this.pendingNearbyRefsByKey.size > 0 ||
      this.pendingBackgroundRefsByKey.size > 0;
  }

  private movePendingRawTableRef(
    ref: RawTableRef,
    key: string,
    priority: AssessmentQueuePriority,
  ): void {
    const existing = this.deletePendingRawTableRef(key) ?? ref;
    this.getQueueForPriority(priority).set(key, existing);
    this.reorderQueueForPriority(priority);
  }

  private deletePendingRawTableRef(key: string): RawTableRef | null {
    for (const queue of [
      this.pendingVisibleRefsByKey,
      this.pendingNearbyRefsByKey,
      this.pendingBackgroundRefsByKey,
    ]) {
      const ref = queue.get(key);
      if (ref) {
        queue.delete(key);
        return ref;
      }
    }

    return null;
  }

  private shiftPendingRawTableRef(): RawTableRef | null {
    return shiftPendingRawTableRef(this.pendingVisibleRefsByKey) ??
      shiftPendingRawTableRef(this.pendingNearbyRefsByKey) ??
      shiftPendingRawTableRef(this.pendingBackgroundRefsByKey);
  }

  private reorderQueueForPriority(priority: AssessmentQueuePriority): void {
    const queue = this.getQueueForPriority(priority);
    if (queue.size <= 1) {
      return;
    }

    const entries = [...queue.entries()].sort((first, second) =>
      (this.preferredOrderByKey.get(first[0]) ?? Number.MAX_SAFE_INTEGER) -
      (this.preferredOrderByKey.get(second[0]) ?? Number.MAX_SAFE_INTEGER)
    );
    queue.clear();
    for (const [key, ref] of entries) {
      queue.set(key, ref);
    }
  }
}

export const getRawTableRefsForAssessmentEvent = (
  refs: readonly RawTableRef[] | undefined,
  fileIds: readonly string[] | undefined,
  rawTableIds: readonly string[] | undefined,
  snapshot: SessionSnapshot,
): RawTableRef[] => {
  if (refs?.length) {
    return uniqueRawTableRefs(refs);
  }

  const result: RawTableRef[] = [];
  const sourceFileIds = fileIds?.length ? fileIds : snapshot.fileOrder;
  for (const fileId of sourceFileIds) {
    const file = snapshot.filesById[fileId];
    if (!file) {
      continue;
    }

    const sourceRawTableIds = rawTableIds?.length
      ? rawTableIds
      : file.raw.tableOrder;
    for (const rawTableId of sourceRawTableIds) {
      if (file.raw.tablesById[rawTableId]) {
        result.push({ fileId: file.id, rawTableId });
      }
    }
  }

  return uniqueRawTableRefs(result);
};

const hasCurrentAssessment = (
  file: FileRecord,
  rawTableId: string,
): boolean =>
  file.assessmentsByRawTableId[rawTableId]?.sourceRawTableVersion ===
    (file.rawTableVersionsById[rawTableId] ?? 0);

const uniqueRawTableRefs = (
  refs: readonly RawTableRef[],
): RawTableRef[] => {
  const result: RawTableRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const fileId = String(ref.fileId ?? "").trim();
    const rawTableId = String(ref.rawTableId ?? "").trim();
    const key = `${fileId}\u0000${rawTableId}`;
    if (!fileId || !rawTableId || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ fileId, rawTableId });
  }

  return result;
};

const shiftPendingRawTableRef = (
  refsByKey: Map<string, RawTableRef>,
): RawTableRef | null => {
  const first = refsByKey.entries().next();
  if (first.done) {
    return null;
  }

  const [key, ref] = first.value;
  refsByKey.delete(key);
  return ref;
};

const getRawTableRefKey = (
  ref: RawTableRef,
): string => `${ref.fileId}\u0000${ref.rawTableId}`;

const readRowsForAssessment = (
  file: FileRecord,
  table: TableRecord,
  rawTableRowsReaderService: IRawTableRowsReaderServiceType,
) => rawTableRowsReaderService.readRawTableRows({
  fallbackFile: file.raw.file,
  fileName: file.raw.fileName,
  lastModified: file.raw.lastModified,
  maxRows: RAW_TABLE_ASSESSMENT_PREVIEW_ROWS,
  rowStore: table.rowStore ?? null,
});

const getAssessmentSourceName = (
  file: FileRecord,
): string => normalizeSourceName(file.raw.relativePath) ??
  normalizeSourceName(file.raw.filePath) ??
  file.raw.fileName;

const normalizeSourceName = (
  value: unknown,
): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

registerSingleton(IAssessmentQueueService, AssessmentQueueService, InstantiationType.Delayed);
