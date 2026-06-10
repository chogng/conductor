/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  Disposable,
} from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  createCalculatedPlotsByKeyFromRecords,
  createCalculatedDataRecordInputSignature,
} from "src/cs/workbench/services/calculation/common/calculatedData";
import { CalculationContributionId } from "src/cs/workbench/services/calculation/common/calculation";
import { createCalculatedCurveRecordsByFile } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  private inputSignature: string | null = null;

  constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
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
    const inputSignature = createCalculatedDataRecordInputSignature(
      snapshot.filesById,
      snapshot.fileOrder,
    );
    if (inputSignature === this.inputSignature) {
      return;
    }

    this.inputSignature = inputSignature;
    const curvesByFileId = createCalculatedCurveRecordsByFile(
      createCalculatedPlotsByKeyFromRecords(snapshot.filesById, snapshot.fileOrder),
    );
    const fileIds = new Set([
      ...snapshot.fileOrder,
      ...Object.keys(snapshot.filesById),
      ...Object.keys(curvesByFileId),
    ]);

    for (const fileId of fileIds) {
      this.sessionService.commitCurves({
        fileId,
        curves: curvesByFileId[fileId] ?? [],
        replaceGenerations: ["derived", "secondDerived"],
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
      return true;
    case "curvesChanged":
      return hasBaseCurveChange(event);
    case "rawTablesChanged":
    case "assessmentChanged":
    case "metricsChanged":
    case "metricInputsChanged":
      return false;
  }
};

const hasBaseCurveChange = (event: SessionChangeEvent): boolean => {
  const curveKeys = event.curveKeys ?? [];
  return curveKeys.length === 0 || curveKeys.some(curveKey => curveKey.startsWith("base:"));
};

registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
