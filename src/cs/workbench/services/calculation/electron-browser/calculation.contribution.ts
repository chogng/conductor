/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { WebWorkerDescriptor } from "src/cs/platform/webWorker/browser/webWorkerDescriptor";
import { IWebWorkerService } from "src/cs/platform/webWorker/browser/webWorkerService";
import { CalculationService } from "src/cs/workbench/services/calculation/browser/calculationService";
import { CalculationWorkerClient } from "src/cs/workbench/services/calculation/browser/calculationWorkerClient";
import calculationWorkerUrl from "src/cs/workbench/services/calculation/browser/calculationWorker.ts?worker&url";
import {
	ICalculationService,
} from "src/cs/workbench/services/calculation/common/calculation";
import {
	ElectronCalculationRecordsBackend,
} from "src/cs/workbench/services/calculation/electron-browser/calculationRecordsBackend";
import { ISessionService } from "src/cs/workbench/services/session/common/session";

const calculationWorkerDescriptor = new WebWorkerDescriptor({
	esmModuleLocationBundler: calculationWorkerUrl,
	label: "Calculation",
});

class DesktopCalculationService extends CalculationService {
	public constructor(
		@IWebWorkerService webWorkerService: IWebWorkerService,
		@ISessionService sessionService: ISessionService,
	) {
		super(
			new ElectronCalculationRecordsBackend(
				new CalculationWorkerClient(
					webWorkerService,
					calculationWorkerDescriptor,
				),
			),
			sessionService,
		);
	}
}

registerSingleton(
	ICalculationService,
	DesktopCalculationService,
	InstantiationType.Delayed,
);
