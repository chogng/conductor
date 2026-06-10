/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  AnalysisFileLifecycleContributionId,
  IAnalysisResourceDisposalService,
  type IAnalysisResourceDisposalService as IAnalysisResourceDisposalServiceType,
} from "src/cs/workbench/services/analysisFile/common/analysisResourceDisposal";
import {
  ILifecycleService,
  WillShutdownJoinerOrder,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";
import { localize } from "src/cs/nls";

export class AnalysisFileLifecycleContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IAnalysisResourceDisposalService private readonly analysisResourceDisposalService:
      IAnalysisResourceDisposalServiceType,
    @ILifecycleService lifecycleService: ILifecycleServiceType,
  ) {
    super();

    this._register(lifecycleService.onWillShutdown(event => {
      if (!this.analysisResourceDisposalService.canDisposeAnalysisResources()) {
        return;
      }

      event.join(
        () => this.analysisResourceDisposalService.disposeAnalysisResources({ clear: true }),
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
