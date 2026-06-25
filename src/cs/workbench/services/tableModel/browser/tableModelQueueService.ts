/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  getTableModelRuleVersion,
  TABLE_MODEL_RULE_VERSION,
  type TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import {
  ITableModelQueueService,
  ITableModelProducerService,
  type ITableModelQueueService as ITableModelQueueServiceType,
  type ITableModelProducerService as ITableModelProducerServiceType,
  type TableModelQueuePriority,
  type TableModelQueueSnapshot,
  type TableModelRawTableQueueState,
} from "src/cs/workbench/services/tableModel/common/tableModel";
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
  type ISessionService as ISessionServiceType,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";

const TABLE_MODEL_PREVIEW_ROWS = 256;
const TABLE_MODEL_BACKGROUND_COMMIT_BATCH_SIZE = 16;

type QueuedTableModel = {
  readonly priority: TableModelQueuePriority;
  readonly ref: RawTableRef;
  readonly schemaProfileVersion: number;
  readonly schemaProfiles: readonly SchemaProfile[];
  readonly sourceRawTableVersion: number;
};

export class TableModelQueueService extends Disposable implements ITableModelQueueServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTableModelQueueStateEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeTableModelQueueState = this.onDidChangeTableModelQueueStateEmitter.event;

  private readonly pendingBackgroundRefsByKey = new Map<string, QueuedTableModel>();
  private readonly pendingNearbyRefsByKey = new Map<string, QueuedTableModel>();
  private readonly pendingVisibleRefsByKey = new Map<string, QueuedTableModel>();
  private readonly preferredOrderByKey = new Map<string, number>();
  private readonly preferredPriorityByKey = new Map<string, TableModelQueuePriority>();
  private currentTableModel: QueuedTableModel | null = null;
  private disposed = false;
  private isTableModelQueueRunning = false;
  private nextPreferredOrder = 0;

  public constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
    @ITableModelProducerService private readonly tableModelService: ITableModelProducerServiceType,
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
        this.enqueueRawTables(getRawTableRefsForTableModelSnapshot(this.sessionService.getSnapshot()));
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
      const entry = this.createQueuedTableModel(ref, priority);
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
      this.fireTableModelQueueStateChange();
    }
    this.startTableModelQueue();
  }

  public prioritizeRawTables(
    refs: readonly RawTableRef[],
    priority: TableModelQueuePriority,
  ): void {
    let didChangeQueue = false;
    for (const ref of uniqueRawTableRefs(refs)) {
      const key = getRawTableRefKey(ref);
      this.preferredPriorityByKey.set(key, priority);
      this.preferredOrderByKey.set(key, this.nextPreferredOrder);
      this.nextPreferredOrder += 1;

      const entry = this.createQueuedTableModel(ref, priority);
      if (!entry) {
        continue;
      }

      this.movePendingRawTableRef(entry, key, priority);
      didChangeQueue = true;
    }

    if (didChangeQueue) {
      this.fireTableModelQueueStateChange();
    }
    this.startTableModelQueue();
  }

  public getQueueSnapshot(): TableModelQueueSnapshot {
    return {
      rawTables: [
        ...this.getQueueSnapshotForPriority("visible"),
        ...this.getQueueSnapshotForPriority("nearby"),
        ...this.getQueueSnapshotForPriority("background"),
        ...(this.currentTableModel
          ? [toRawTableQueueState(this.currentTableModel, "running")]
          : []),
      ],
    };
  }

  private startTableModelQueue(): void {
    if (!this.isTableModelQueueRunning) {
      void this.drainTableModelQueue();
    }
  }

  private async drainTableModelQueue(): Promise<void> {
    if (this.isTableModelQueueRunning) {
      return;
    }

    this.isTableModelQueueRunning = true;
    const tableModelBatch: TableModelRecord[] = [];
    let hasCommittedTableModel = false;
    try {
      while (!this.disposed) {
        const entry = this.shiftPendingRawTableRef();
        if (!entry) {
          break;
        }

        this.setCurrentTableModel(entry);
        let tableModel: TableModelRecord | null = null;
        try {
          tableModel = await this.createTableModelForRef(entry);
        } finally {
          this.clearCurrentTableModel(entry);
        }
        if (!tableModel || this.disposed) {
          continue;
        }

        tableModelBatch.push(tableModel);
        const commitBatchSize = hasCommittedTableModel
          ? TABLE_MODEL_BACKGROUND_COMMIT_BATCH_SIZE
          : 1;
        if (tableModelBatch.length >= commitBatchSize) {
          this.sessionService.commitTableModelBatch(tableModelBatch);
          tableModelBatch.length = 0;
          hasCommittedTableModel = true;
        }
      }

      if (!this.disposed && tableModelBatch.length > 0) {
        this.sessionService.commitTableModelBatch(tableModelBatch);
      }
    } finally {
      this.isTableModelQueueRunning = false;
      if (!this.disposed && this.hasPendingRawTableRefs()) {
        void this.drainTableModelQueue();
      }
    }
  }

  private async createTableModelForRef(
    entry: QueuedTableModel,
  ): Promise<TableModelRecord | null> {
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
    if (!table || !isAssessableTable(table) || hasCurrentTableModel(
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

    const rows = await readRowsForTableModel(file, table, this.rawTableRowsReaderService);
    if (!rows || this.disposed) {
      return null;
    }

    if (
      !this.isCurrentRawTableVersion(targetRef, sourceRawTableVersion) ||
      this.getSchemaProfileVersion() !== queuedSchemaProfileVersion
    ) {
      return null;
    }

    return this.tableModelService.getOrCreate({
      columnCount: table.columnCount,
      fileId: file.id,
      fileName: getTableModelSourceName(file),
      rawTableId,
      rowCount: table.rowCount,
      rows,
      schemaProfiles: entry.schemaProfiles,
      schemaProfileVersion: queuedSchemaProfileVersion,
      sourceRawTableVersion,
    });
  }

  private getQueueForPriority(
    priority: TableModelQueuePriority,
  ): Map<string, QueuedTableModel> {
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
    entry: QueuedTableModel,
    key: string,
    priority: TableModelQueuePriority,
  ): void {
    this.deletePendingRawTableRef(key);
    this.getQueueForPriority(priority).set(key, entry);
    this.reorderQueueForPriority(priority);
  }

  private getPendingRawTableRef(key: string): QueuedTableModel | null {
    return this.pendingVisibleRefsByKey.get(key) ??
      this.pendingNearbyRefsByKey.get(key) ??
      this.pendingBackgroundRefsByKey.get(key) ??
      null;
  }

  private deletePendingRawTableRef(key: string): QueuedTableModel | null {
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

  private shiftPendingRawTableRef(): QueuedTableModel | null {
    return shiftPendingRawTableRef(this.pendingVisibleRefsByKey) ??
      shiftPendingRawTableRef(this.pendingNearbyRefsByKey) ??
      shiftPendingRawTableRef(this.pendingBackgroundRefsByKey);
  }

  private createQueuedTableModel(
    ref: RawTableRef,
    priority: TableModelQueuePriority,
  ): QueuedTableModel | null {
    const snapshot = this.sessionService.getSnapshot();
    const schemaProfileSnapshot = this.getSchemaProfileSnapshot();
    const file = snapshot.filesById[ref.fileId];
    const sourceRawTableVersion = file?.rawTableVersionsById[ref.rawTableId];
    if (
      !file ||
      !isAssessableTable(file.raw.tablesById[ref.rawTableId]) ||
      typeof sourceRawTableVersion !== "number" ||
      hasCurrentTableModel(
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
    priority: TableModelQueuePriority,
  ): TableModelRawTableQueueState[] {
    return [...this.getQueueForPriority(priority).values()]
      .map(entry => toRawTableQueueState(entry, "queued"));
  }

  private setCurrentTableModel(
    entry: QueuedTableModel,
  ): void {
    this.currentTableModel = entry;
    this.fireTableModelQueueStateChange();
  }

  private clearCurrentTableModel(
    entry: QueuedTableModel,
  ): void {
    if (this.currentTableModel !== entry) {
      return;
    }

    this.currentTableModel = null;
    this.fireTableModelQueueStateChange();
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

  private reorderQueueForPriority(priority: TableModelQueuePriority): void {
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
      this.currentTableModel !== null ||
      this.preferredOrderByKey.size > 0 ||
      this.preferredPriorityByKey.size > 0;
    this.pendingBackgroundRefsByKey.clear();
    this.pendingNearbyRefsByKey.clear();
    this.pendingVisibleRefsByKey.clear();
    this.currentTableModel = null;
    this.preferredOrderByKey.clear();
    this.preferredPriorityByKey.clear();
    if (didChangeQueue) {
      this.fireTableModelQueueStateChange();
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
      this.currentTableModel &&
      normalizedFileIds.has(this.currentTableModel.ref.fileId)
    ) {
      this.currentTableModel = null;
      didChangeQueue = true;
    }

    if (didChangeQueue) {
      this.fireTableModelQueueStateChange();
    }
  }

  private fireTableModelQueueStateChange(): void {
    if (!this.disposed) {
      this.onDidChangeTableModelQueueStateEmitter.fire(undefined);
    }
  }
}

export const getRawTableRefsForTableModelEvent = (
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

const getRawTableRefsForTableModelSnapshot = (
  snapshot: SessionSnapshot,
): RawTableRef[] =>
  getRawTableRefsForTableModelEvent(undefined, undefined, undefined, snapshot);

const hasCurrentTableModel = (
  file: FileRecord,
  rawTableId: string,
  schemaProfileVersion: number,
): boolean => {
  const tableModel = file.tableModelByRawTableId[rawTableId];
  return Boolean(
      tableModel &&
      tableModel.sourceRawTableVersion === (file.rawTableVersionsById[rawTableId] ?? 0) &&
      getTableModelRuleVersion(tableModel) === TABLE_MODEL_RULE_VERSION &&
      tableModel.schemaProfileVersion === schemaProfileVersion,
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
  refsByKey: Map<string, QueuedTableModel>,
): QueuedTableModel | null => {
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
  entry: QueuedTableModel,
  state: TableModelRawTableQueueState["state"],
): TableModelRawTableQueueState => ({
  fileId: entry.ref.fileId,
  priority: entry.priority,
  rawTableId: entry.ref.rawTableId,
  sourceRawTableVersion: entry.sourceRawTableVersion,
  state,
});

const getFileIdFromRawTableRefKey = (
  key: string,
): string => key.split("\u0000", 1)[0] ?? "";

const readRowsForTableModel = (
  file: FileRecord,
  table: TableRecord,
  rawTableRowsReaderService: IRawTableRowsReaderServiceType,
) => rawTableRowsReaderService.readRawTableRows({
  fallbackFile: file.raw.file,
  fileName: file.raw.fileName,
  lastModified: file.raw.lastModified,
  maxRows: TABLE_MODEL_PREVIEW_ROWS,
  rowStore: table.rowStore ?? null,
});

const getTableModelSourceName = (
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
  ITableModelQueueService,
  TableModelQueueService as unknown as new (...services: BrandedService[]) => ITableModelQueueServiceType,
  InstantiationType.Delayed,
);
