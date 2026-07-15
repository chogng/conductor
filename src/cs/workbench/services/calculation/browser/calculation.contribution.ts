/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'src/cs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'src/cs/platform/instantiation/common/extensions';
import { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from 'src/cs/workbench/common/contributions';
import {
	CalculationContributionId,
	ICalculationService,
} from 'src/cs/workbench/services/calculation/common/calculation';
import { CalculationService } from 'src/cs/workbench/services/calculation/browser/calculationService';
import { CalculationWorkerClient } from 'src/cs/workbench/services/calculation/browser/calculationWorkerClient';
import calculationWorkerUrl from 'src/cs/workbench/services/calculation/browser/calculationWorker.ts?worker&url';
import { ISessionService } from 'src/cs/workbench/services/session/common/session';

const calculationWorkerDescriptor = new WebWorkerDescriptor({
	esmModuleLocationBundler: calculationWorkerUrl,
	label: 'Calculation',
});

class BrowserCalculationService extends CalculationService {
	public constructor(
		@IWebWorkerService webWorkerService: IWebWorkerService,
		@ISessionService sessionService: ISessionService,
	) {
		super(
			new CalculationWorkerClient(webWorkerService, calculationWorkerDescriptor),
			sessionService,
		);
	}
}

export class CalculationContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@ICalculationService _calculationService: ICalculationService,
	) {
		super();
	}
}

registerSingleton(ICalculationService, BrowserCalculationService, InstantiationType.Delayed);
registerWorkbenchContribution2(CalculationContributionId, CalculationContribution, WorkbenchPhase.AfterRestored);
