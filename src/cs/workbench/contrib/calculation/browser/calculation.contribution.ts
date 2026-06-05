import {
  Disposable,
  toDisposable,
} from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { createCalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { CalculationContributionId } from "src/cs/workbench/contrib/calculation/common/calculation";
import { defaultSessionModel } from "src/cs/workbench/contrib/session/browser/session";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  private cleanedData: readonly CleanedEntry[] | null = null;

  constructor() {
    super();

    this._register(toDisposable(defaultSessionModel.subscribe(() => this.update())));
    this.update();
  }

  private update(): void {
    const snapshot = defaultSessionModel.getSnapshot();
    if (snapshot.cleanedData === this.cleanedData) {
      return;
    }

    this.cleanedData = snapshot.cleanedData;
    defaultSessionModel.setCalculatedDataByKey(
      createCalculatedDataByKey(snapshot.cleanedData),
    );
  }
}

registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
