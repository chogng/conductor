import {
  Disposable,
  toDisposable,
} from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { createCalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { CalculationContributionId } from "src/cs/workbench/contrib/calculation/common/calculation";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  private cleanedData: readonly CleanedEntry[] | null = null;

  constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
  ) {
    super();

    this._register(toDisposable(this.sessionService.subscribe(() => this.update())));
    this.update();
  }

  private update(): void {
    const snapshot = this.sessionService.getSnapshot();
    if (snapshot.cleanedData === this.cleanedData) {
      return;
    }

    this.cleanedData = snapshot.cleanedData;
    this.sessionService.setCalculatedDataByKey(
      createCalculatedDataByKey(snapshot.cleanedData),
    );
  }
}

registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
