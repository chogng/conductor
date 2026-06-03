import { Disposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  IDataFileService,
  DataFileLifecycleContributionId,
  type IDataFileService as IDataFileServiceType,
} from "src/cs/workbench/services/dataFile/common/dataFile";
import {
  ILifecycleService,
  WillShutdownJoinerOrder,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";

export class DataFileLifecycleContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IDataFileService private readonly dataFileService: IDataFileServiceType,
    @ILifecycleService lifecycleService: ILifecycleServiceType,
  ) {
    super();

    this._register(lifecycleService.onWillShutdown(event => {
      if (!this.dataFileService.canDisposeFile()) {
        return;
      }

      event.join(
        () => this.dataFileService.disposeFile({ clear: true }).then(() => undefined),
        {
          id: "dataFile.clearRustPreviewFiles",
          label: "Clear Rust preview files",
          order: WillShutdownJoinerOrder.Last,
        },
      );
    }));
  }
}

const DataFileLifecycleContributionCtor =
  DataFileLifecycleContribution as new (...args: unknown[]) => IWorkbenchContribution;

registerWorkbenchContribution2(
  DataFileLifecycleContributionId,
  DataFileLifecycleContributionCtor,
  WorkbenchPhase.BlockStartup,
);
