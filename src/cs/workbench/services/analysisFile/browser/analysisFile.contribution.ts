import { Disposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  IAnalysisFileService,
  AnalysisFileLifecycleContributionId,
  type IAnalysisFileService as IAnalysisFileServiceType,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";
import {
  ILifecycleService,
  WillShutdownJoinerOrder,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";
import { localize } from "src/cs/nls";

export class AnalysisFileLifecycleContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IAnalysisFileService private readonly analysisFileService: IAnalysisFileServiceType,
    @ILifecycleService lifecycleService: ILifecycleServiceType,
  ) {
    super();

    this._register(lifecycleService.onWillShutdown(event => {
      if (!this.analysisFileService.canDisposeFile()) {
        return;
      }

      event.join(
        () => this.analysisFileService.disposeFile({ clear: true }).then(() => undefined),
        {
          id: "analysisFile.clearRustPreviewFiles",
          label: localize("analysisFile.clearRustPreviewFiles", "Clear Rust preview files"),
          order: WillShutdownJoinerOrder.Last,
        },
      );
    }));
  }
}

const AnalysisFileLifecycleContributionCtor =
  AnalysisFileLifecycleContribution as new (...args: unknown[]) => IWorkbenchContribution;

registerWorkbenchContribution2(
  AnalysisFileLifecycleContributionId,
  AnalysisFileLifecycleContributionCtor,
  WorkbenchPhase.BlockStartup,
);
