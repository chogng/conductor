/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  TABLE_FACTS_RULE_VERSION,
  type RawTableFactsRecord,
} from "src/cs/workbench/services/template/common/tableFacts";
import {
  IRawTableFactsQueueService,
  IRawTableFactsService,
  type IRawTableFactsQueueService as IRawTableFactsQueueServiceType,
  type IRawTableFactsService as IRawTableFactsServiceType,
  type RawTableFactsQueuePriority,
  type RawTableFactsQueueSnapshot,
  type RawTableFactsRawTableQueueState,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
  IRawTableRowsReaderService,
  type IRawTableRowsReaderService as IRawTableRowsReaderServiceType,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import {
  ISchemaProfileService,
  type SchemaProfile,
  type SchemaProfileSnapshot,
  type ISchemaProfileService as ISchemaProfileServiceType,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
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

const RAW_TABLE_FACTS_PREVIEW_ROWS = 256;
const RAW_TABLE_FACTS_BACKGROUND_COMMIT_BATCH_SIZE = 16;

type QueuedRawTableFacts = {
  readonly priority: RawTableFactsQueuePriority;
  readonly ref: RawTableRef;
  readonly schemaProfileVersion: number;
  readonly schemaProfiles: readonly SchemaProfile[];
  readonly sourceRawTableVersion: number;
};

export class RawTableFactsQueueService extends Disposable implements IRawTableFactsQueueServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeRawTableFactsQueueStateEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeRawTableFactsQueueState = this.onDidChangeRawTableFactsQueueStateEmitter.event;

  private readonly pendingBackgroundRefsByKey = new Map<string, QueuedRawTableFacts>();
  private readonly pendingNearbyRefsByKey = new Map<string, QueuedRawTableFacts>();
  private readonly pendingVisibleRefsByKey = new Map<string, QueuedRawTableFacts>();
  private readonly preferredOrderByKey = new Map<string, number>();
  private readonly preferredPriorityByKey = new Map<string, RawTableFactsQueuePriority>();
  private currentRawTableFacts: QueuedRawTableFacts | null = null;
  private disposed = false;
  private isRawTableFactsQueueRunning = false;
  private nextPreferredOrder = 0;

  public constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
    @IRawTableFactsService private readonly rawTableFactsService: IRawTableFactsServiceType,
    @IRawTableRowsReaderService private readonly rawTableRowsReaderService: IRawTableRowsReaderServiceType,
    @ISchemaProfileService private readonly schemaProfileService?: ISchemaProfileServiceType,
  ) {
    super();
    this._register(this.sessionService.onDidChangeSession(event => {
      if (event.reason === "sessionCleared") {
        this.clearQueuedRawTableRefs();
        return;
      }

      if (event.reason === "filesRemoved" && event.fileIds?.length) {
        this.deleteQueuedRawTableRefsForFiles(event.fileIds);
      }
    }));
    if (this.schemaProfileService) {
      this._register(this.schemaProfileService.onDidChangeSchemaProfiles(() => {
        this.enqueueRawTables(getRawTableRefsForTableFactsSnapshot(this.sessionService.getSnapshot()));
      }));
    }
  }

  public override dispose(): void {
    this.disposed = true;
    this.clearQueuedRawTableRefs();
    super.dispose();
  }

  public enqueueRawTables(refs: readonly RawTableRef[]): void {
    let didChangeQueue = false;
    for (const ref of uniqueRawTableRefs(refs)) {
      const key = getRawTableRefKey(ref);
      const priority = this.preferredPriorityByKey.get(key) ?? "background";
      const entry = this.createQueuedRawTableFacts(ref, priority);
      if (!entry) {
        continue;
      }

      const pending = this.getPendingRawTableRef(key);
      if (
        pending?.sourceRawTableVersion === entry.sourceRawTableVersion &&
        pending.schemaProfileVersion === entry.schemaProfileVersion
      ) {
        continue;
      }

      this.deletePendingRawTableRef(key);
      this.getQueueForPriority(priority).set(key, entry);
      this.reorderQueueForPriority(priority);
      didChangeQueue = true;
    }

    if (didChangeQueue) {
      this.fireRawTableFactsQueueStateChange();
    }
    this.startRawTableFactsQueue();
  }

  public prioritizeRawTables(
    refs: readonly RawTableRef[],
    priority: RawTableFactsQueuePriority,
  ): void {
    let didChangeQueue = false;
    for (const ref of uniqueRawTableRefs(refs)) {
      const key = getRawTableRefKey(ref);
      this.preferredPriorityByKey.set(key, priority);
      this.preferredOrderByKey.set(key, this.nextPreferredOrder);
      this.nextPreferredOrder += 1;

      const entry = this.createQueuedRawTableFacts(ref, priority);
      if (!entry) {
        continue;
      }

      this.movePendingRawTableRef(entry, key, priority);
      didChangeQueue = true;
    }

    if (didChangeQueue) {
      this.fireRawTableFactsQueueStateChange();
    }
    this.startRawTableFactsQueue();
  }

  public getQueueSnapshot(): RawTableFactsQueueSnapshot {
    return {
      rawTables: [
        ...this.getQueueSnapshotForPriority("visible"),
        ...this.getQueueSnapshotForPriority("nearby"),
        ...this.getQueueSnapshotForPriority("background"),
        ...(this.currentRawTableFacts
          ? [toRawTableQueueState(this.currentRawTableFacts, "running")]
          : []),
      ],
    };
  }

  private startRawTableFactsQueue(): void {
    if (!this.isRawTableFactsQueueRunning) {
      void this.drainRawTableFactsQueue();
    }
  }

  private async drainRawTableFactsQueue(): Promise<void> {
    if (this.isRawTableFactsQueueRunning) {
      return;
    }

    this.isRawTableFactsQueueRunning = true;
    const tableFactsBatch: RawTableFactsRecord[] = [];
    let hasCommittedTableFacts = false;
    try {
      while (!this.disposed) {
        const entry = this.shiftPendingRawTableRef();
        if (!entry) {
          break;
        }

        this.setCurrentRawTableFacts(entry);
        let tableFacts: RawTableFactsRecord | null = null;
        try {
          tableFacts = await this.createRawTableFactsForRef(entry);
        } finally {
          this.clearCurrentRawTableFacts(entry);
        }
        if (!tableFacts || this.disposed) {
          continue;
        }

        tableFactsBatch.push(tableFacts);
        const commitBatchSize = hasCommittedTableFacts
          ? RAW_TABLE_FACTS_BACKGROUND_COMMIT_BATCH_SIZE
          : 1;
        if (tableFactsBatch.length >= commitBatchSize) {
          this.sessionService.commitRawTableFactsBatch(tableFactsBatch);
          tableFactsBatch.length = 0;
          hasCommittedTableFacts = true;
        }
      }

      if (!this.disposed && tableFactsBatch.length > 0) {
        this.sessionService.commitRawTableFactsBatch(tableFactsBatch);
      }
    } finally {
      this.isRawTableFactsQueueRunning = false;
      if (!this.disposed && this.hasPendingRawTableRefs()) {
        void this.drainRawTableFactsQueue();
      }
    }
  }

  private async createRawTableFactsForRef(
    entry: QueuedRawTableFacts,
  ): Promise<RawTableFactsRecord | null> {
    const targetRef = entry.ref;
    const queuedSourceRawTableVersion = entry.sourceRawTableVersion;
    const queuedSchemaProfileVersion = entry.schemaProfileVersion;
    const schemaProfileSnapshot = this.getSchemaProfileSnapshot();
    const snapshot = this.sessionService.getSnapshot();
    const file = snapshot.filesById[targetRef.fileId];
    if (!file) {
      return null;
    }

    const rawTableId = targetRef.rawTableId;
    const table = file.raw.tablesById[rawTableId];
    if (!table || !isAssessableTable(table) || hasCurrentTableFacts(
      file,
      rawTableId,
      queuedSchemaProfileVersion,
    )) {
      return null;
    }

    const sourceRawTableVersion = file.rawTableVersionsById[rawTableId] ?? 0;
    if (
      queuedSourceRawTableVersion !== undefined &&
      queuedSourceRawTableVersion !== sourceRawTableVersion
    ) {
      return null;
    }
    if (queuedSchemaProfileVersion !== schemaProfileSnapshot.version) {
      return null;
    }

    const rows = await readRowsForTableFacts(file, table, this.rawTableRowsReaderService);
    if (!rows || this.disposed) {
      return null;
    }

    if (
      !this.isCurrentRawTableVersion(targetRef, sourceRawTableVersion) ||
      this.getSchemaProfileVersion() !== queuedSchemaProfileVersion
    ) {
      return null;
    }

    return this.rawTableFactsService.createRawTableFacts({
      columnCount: table.columnCount,
      fileId: file.id,
      fileName: getTableFactsSourceName(file),
      rawTableId,
      rowCount: table.rowCount,
      rows,
      schemaProfiles: entry.schemaProfiles,
      schemaProfileVersion: queuedSchemaProfileVersion,
      sourceRawTableVersion,
    });
  }

  private getQueueForPriority(
    priority: RawTableFactsQueuePriority,
  ): Map<string, QueuedRawTableFacts> {
    switch (priority) {
      case "visible":
        return this.pendingVisibleRefsByKey;
      case "nearby":
        return this.pendingNearbyRefsByKey;
      case "background":
        return this.pendingBackgroundRefsByKey;
    }
  }

  private hasPendingRawTableRefs(): boolean {
    return this.pendingVisibleRefsByKey.size > 0 ||
      this.pendingNearbyRefsByKey.size > 0 ||
      this.pendingBackgroundRefsByKey.size > 0;
  }

  private movePendingRawTableRef(
    entry: QueuedRawTableFacts,
    key: string,
    priority: RawTableFactsQueuePriority,
  ): void {
    this.deletePendingRawTableRef(key);
    this.getQueueForPriority(priority).set(key, entry);
    this.reorderQueueForPriority(priority);
  }

  private getPendingRawTableRef(key: string): QueuedRawTableFacts | null {
    return this.pendingVisibleRefsByKey.get(key) ??
      this.pendingNearbyRefsByKey.get(key) ??
      this.pendingBackgroundRefsByKey.get(key) ??
      null;
  }

  private deletePendingRawTableRef(key: string): QueuedRawTableFacts | null {
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

  private shiftPendingRawTableRef(): QueuedRawTableFacts | null {
    return shiftPendingRawTableRef(this.pendingVisibleRefsByKey) ??
      shiftPendingRawTableRef(this.pendingNearbyRefsByKey) ??
      shiftPendingRawTableRef(this.pendingBackgroundRefsByKey);
  }

  private createQueuedRawTableFacts(
    ref: RawTableRef,
    priority: RawTableFactsQueuePriority,
  ): QueuedRawTableFacts | null {
    const snapshot = this.sessionService.getSnapshot();
    const schemaProfileSnapshot = this.getSchemaProfileSnapshot();
    const file = snapshot.filesById[ref.fileId];
    const sourceRawTableVersion = file?.rawTableVersionsById[ref.rawTableId];
    if (
      !file ||
      !isAssessableTable(file.raw.tablesById[ref.rawTableId]) ||
      typeof sourceRawTableVersion !== "number" ||
      hasCurrentTableFacts(
        file,
        ref.rawTableId,
        schemaProfileSnapshot.version,
      )
    ) {
      return null;
    }

    return {
      priority,
      ref,
      schemaProfileVersion: schemaProfileSnapshot.version,
      schemaProfiles: schemaProfileSnapshot.profiles,
      sourceRawTableVersion,
    };
  }

  private getQueueSnapshotForPriority(
    priority: RawTableFactsQueuePriority,
  ): RawTableFactsRawTableQueueState[] {
    return [...this.getQueueForPriority(priority).values()]
      .map(entry => toRawTableQueueState(entry, "queued"));
  }

  private setCurrentRawTableFacts(
    entry: QueuedRawTableFacts,
  ): void {
    this.currentRawTableFacts = entry;
    this.fireRawTableFactsQueueStateChange();
  }

  private clearCurrentRawTableFacts(
    entry: QueuedRawTableFacts,
  ): void {
    if (this.currentRawTableFacts !== entry) {
      return;
    }

    this.currentRawTableFacts = null;
    this.fireRawTableFactsQueueStateChange();
  }

  private isCurrentRawTableVersion(
    ref: RawTableRef,
    sourceRawTableVersion: number,
  ): boolean {
    const file = this.sessionService.getSnapshot().filesById[ref.fileId];
    return Boolean(
      file?.raw.tablesById[ref.rawTableId] &&
        (file.rawTableVersionsById[ref.rawTableId] ?? 0) === sourceRawTableVersion,
    );
  }

  private getSchemaProfileVersion(): number {
    return this.getSchemaProfileSnapshot().version;
  }

  private getSchemaProfileSnapshot(): SchemaProfileSnapshot {
    return this.schemaProfileService?.getSnapshot() ?? EMPTY_SCHEMA_PROFILE_SNAPSHOT;
  }

  private reorderQueueForPriority(priority: RawTableFactsQueuePriority): void {
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

  private clearQueuedRawTableRefs(): void {
    const didChangeQueue = this.hasPendingRawTableRefs() ||
      this.currentRawTableFacts !== null ||
      this.preferredOrderByKey.size > 0 ||
      this.preferredPriorityByKey.size > 0;
    this.pendingBackgroundRefsByKey.clear();
    this.pendingNearbyRefsByKey.clear();
    this.pendingVisibleRefsByKey.clear();
    this.currentRawTableFacts = null;
    this.preferredOrderByKey.clear();
    this.preferredPriorityByKey.clear();
    if (didChangeQueue) {
      this.fireRawTableFactsQueueStateChange();
    }
  }

  private deleteQueuedRawTableRefsForFiles(fileIds: readonly string[]): void {
    const normalizedFileIds = new Set(
      fileIds
        .map(fileId => String(fileId ?? "").trim())
        .filter(Boolean),
    );
    if (!normalizedFileIds.size) {
      return;
    }

    let didChangeQueue = false;
    for (const map of [
      this.pendingBackgroundRefsByKey,
      this.pendingNearbyRefsByKey,
      this.pendingVisibleRefsByKey,
      this.preferredOrderByKey,
      this.preferredPriorityByKey,
    ]) {
      for (const key of [...map.keys()]) {
        if (normalizedFileIds.has(getFileIdFromRawTableRefKey(key))) {
          map.delete(key);
          didChangeQueue = true;
        }
      }
    }

    if (
      this.currentRawTableFacts &&
      normalizedFileIds.has(this.currentRawTableFacts.ref.fileId)
    ) {
      this.currentRawTableFacts = null;
      didChangeQueue = true;
    }

    if (didChangeQueue) {
      this.fireRawTableFactsQueueStateChange();
    }
  }

  private fireRawTableFactsQueueStateChange(): void {
    if (!this.disposed) {
      this.onDidChangeRawTableFactsQueueStateEmitter.fire(undefined);
    }
  }
}

export const getRawTableRefsForTableFactsEvent = (
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

const getRawTableRefsForTableFactsSnapshot = (
  snapshot: SessionSnapshot,
): RawTableRef[] =>
  getRawTableRefsForTableFactsEvent(undefined, undefined, undefined, snapshot);

const hasCurrentTableFacts = (
  file: FileRecord,
  rawTableId: string,
  schemaProfileVersion: number,
): boolean => {
  const tableFacts = file.tableFactsByRawTableId[rawTableId];
  return Boolean(
    tableFacts &&
      tableFacts.sourceRawTableVersion === (file.rawTableVersionsById[rawTableId] ?? 0) &&
      tableFacts.assessmentRuleVersion === TABLE_FACTS_RULE_VERSION &&
      tableFacts.schemaProfileVersion === schemaProfileVersion,
  );
};

const EMPTY_SCHEMA_PROFILE_SNAPSHOT: SchemaProfileSnapshot = {
  version: 0,
  profiles: [],
};

const isAssessableTable = (
  table: TableRecord | undefined,
): table is TableRecord =>
  Boolean(
    table &&
      table.rowStore &&
      table.health?.state !== "decodeFailed" &&
      table.health?.state !== "parseFailed" &&
      table.health?.state !== "unsupported",
  );

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
  refsByKey: Map<string, QueuedRawTableFacts>,
): QueuedRawTableFacts | null => {
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

const toRawTableQueueState = (
  entry: QueuedRawTableFacts,
  state: RawTableFactsRawTableQueueState["state"],
): RawTableFactsRawTableQueueState => ({
  fileId: entry.ref.fileId,
  priority: entry.priority,
  rawTableId: entry.ref.rawTableId,
  sourceRawTableVersion: entry.sourceRawTableVersion,
  state,
});

const getFileIdFromRawTableRefKey = (
  key: string,
): string => key.split("\u0000", 1)[0] ?? "";

const readRowsForTableFacts = (
  file: FileRecord,
  table: TableRecord,
  rawTableRowsReaderService: IRawTableRowsReaderServiceType,
) => rawTableRowsReaderService.readRawTableRows({
  fallbackFile: file.raw.file,
  fileName: file.raw.fileName,
  lastModified: file.raw.lastModified,
  maxRows: RAW_TABLE_FACTS_PREVIEW_ROWS,
  rowStore: table.rowStore ?? null,
});

const getTableFactsSourceName = (
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

registerSingleton(
  IRawTableFactsQueueService,
  RawTableFactsQueueService as unknown as new (...services: BrandedService[]) => IRawTableFactsQueueServiceType,
  InstantiationType.Delayed,
);
