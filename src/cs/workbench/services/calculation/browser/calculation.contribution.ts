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
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  private inputSignature: string | null = null;

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(event => {
      if (shouldUpdateCalculationForSessionChange(event)) {
        this.update();
      }
    }));
    this.update();
  }

  private update(): void {
    const snapshot = this.sessionService.getSnapshot();
    const inputSignature = createCalculatedRecordsInputSignature(
      snapshot.filesById,
      snapshot.fileOrder,
    );
    if (inputSignature === this.inputSignature) {
      return;
    }

    this.inputSignature = inputSignature;
    const { curvesByFileId, metricsByFileId } = createCalculatedRecordsByFile(
      snapshot.filesById,
      snapshot.fileOrder,
    );
    const fileIds = new Set([
      ...snapshot.fileOrder,
      ...Object.keys(snapshot.filesById),
      ...Object.keys(curvesByFileId),
      ...Object.keys(metricsByFileId),
    ]);

    for (const fileId of fileIds) {
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

registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
