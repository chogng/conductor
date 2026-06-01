import { Disposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  IImportService,
  ImportLifecycleContributionId,
  type IImportService as IImportServiceType,
} from "src/cs/workbench/services/import/common/import";
import {
  ILifecycleService,
  WillShutdownJoinerOrder,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";

export class ImportLifecycleContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IImportService private readonly importService: IImportServiceType,
    @ILifecycleService lifecycleService: ILifecycleServiceType,
  ) {
    super();

    this._register(lifecycleService.onWillShutdown(event => {
      if (!this.importService.canDisposeFile()) {
        return;
      }

      event.join(
        () => this.importService.disposeFile({ clear: true }).then(() => undefined),
        {
          id: "import.clearRustPreviewFiles",
          label: "Clear Rust preview files",
          order: WillShutdownJoinerOrder.Last,
        },
      );
    }));
  }
}

const ImportLifecycleContributionCtor =
  ImportLifecycleContribution as new (...args: unknown[]) => IWorkbenchContribution;

registerWorkbenchContribution2(
  ImportLifecycleContributionId,
  ImportLifecycleContributionCtor,
  WorkbenchPhase.BlockStartup,
);
