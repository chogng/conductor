/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  CalculationContributionId,
  ICalculationService,
} from "src/cs/workbench/services/calculation/common/calculation";
import {
  CalculationService,
  shouldUpdateCalculationForSessionChange,
} from "src/cs/workbench/services/calculation/browser/calculationService";

export { CalculationService, shouldUpdateCalculationForSessionChange };

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
  constructor(
    @ICalculationService _calculationService: ICalculationService,
  ) {
    super();
  }
}

registerSingleton(ICalculationService, CalculationService, InstantiationType.Delayed);
registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
