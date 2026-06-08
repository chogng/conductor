import {
  Disposable,
  toDisposable,
} from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  createCalculatedPlotsByKeyFromRecords,
  createCalculatedDataRecordInputSignature,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { CalculationContributionId } from "src/cs/workbench/contrib/calculation/common/calculation";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  private inputSignature: string | null = null;

  constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
  ) {
    super();

    this._register(toDisposable(this.sessionService.subscribe(() => this.update())));
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
    this.sessionService.replaceCalculatedCurves(
      createCalculatedPlotsByKeyFromRecords(snapshot.filesById, snapshot.fileOrder),
    );
  }
}

registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
