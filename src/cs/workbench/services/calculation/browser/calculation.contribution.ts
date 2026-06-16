/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  Disposable,
} from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  createCalculatedRecordsByFile,
  createCalculatedRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import { CalculationContributionId } from "src/cs/workbench/services/calculation/common/calculation";
import {
  ISessionService,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type { FileId } from "src/cs/workbench/services/session/common/sessionModel";

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  private readonly inputSignaturesByFileId = new Map<FileId, string>();

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(event => {
      if (shouldUpdateCalculationForSessionChange(event)) {
        this.update(event);
      }
    }));
    this.update();
  }

  private update(event?: SessionChangeEvent): void {
    const snapshot = this.sessionService.getSnapshot();
    this.removeStaleSignatures(snapshot);

    if (event?.reason === "sessionCleared") {
      this.inputSignaturesByFileId.clear();
      return;
    }

    if (event?.reason === "filesRemoved") {
      for (const fileId of normalizeFileIds(event.fileIds ?? [])) {
        this.inputSignaturesByFileId.delete(fileId);
      }
      return;
    }

    const fileIds = getCalculationUpdateFileIds(event, snapshot);
    for (const fileId of fileIds) {
      this.updateFile(snapshot, fileId);
    }
  }

  private updateFile(snapshot: SessionSnapshot, fileId: FileId): void {
    const file = snapshot.filesById[fileId];
    if (!file) {
      this.inputSignaturesByFileId.delete(fileId);
      return;
    }

    const filesById = { [fileId]: file };
    const inputSignature = createCalculatedRecordsInputSignature(
      filesById,
      [fileId],
    );
    if (inputSignature === this.inputSignaturesByFileId.get(fileId)) {
      return;
    }

    this.inputSignaturesByFileId.set(fileId, inputSignature);
    const { curvesByFileId, metricsByFileId } = createCalculatedRecordsByFile(
      filesById,
      [fileId],
    );

    this.sessionService.commitCurves({
      fileId,
      curves: curvesByFileId[fileId] ?? [],
      replaceGenerations: ["derived", "secondDerived"],
    });
    this.sessionService.commitMetrics({
      fileId,
      metrics: metricsByFileId[fileId] ?? [],
      replace: true,
    });
  }

  private removeStaleSignatures(snapshot: SessionSnapshot): void {
    const liveFileIds = new Set(getSnapshotFileIds(snapshot));
    for (const fileId of this.inputSignaturesByFileId.keys()) {
      if (!liveFileIds.has(fileId)) {
        this.inputSignaturesByFileId.delete(fileId);
      }
    }
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

registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
