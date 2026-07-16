/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'src/cs/platform/instantiation/common/extensions';
import { IStorageService } from 'src/cs/platform/storage/common/storage';
import { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';
import { PlotCalculatedDataWorkerClient } from 'src/cs/workbench/services/plot/browser/plotCalculatedDataWorkerClient';
import plotCalculatedDataWorkerUrl from 'src/cs/workbench/services/plot/browser/plotCalculatedDataWorker.ts?worker&url';
import { PlotService } from 'src/cs/workbench/services/plot/browser/plotService';
import { IPlotService } from 'src/cs/workbench/services/plot/common/plot';
import { ICalculationService } from 'src/cs/workbench/services/calculation/common/calculation';
import { ISettingsService } from 'src/cs/workbench/services/settings/common/settings';
import { ISessionService } from 'src/cs/workbench/services/session/common/session';

const plotCalculatedDataWorkerDescriptor = new WebWorkerDescriptor({
	esmModuleLocationBundler: plotCalculatedDataWorkerUrl,
	label: 'Plot Calculated Data',
});

class BrowserPlotService extends PlotService {
	public constructor(
		@IWebWorkerService webWorkerService: IWebWorkerService,
		@ISessionService sessionService: ISessionService,
		@ISettingsService settingsService: ISettingsService,
		@IStorageService storageService: IStorageService,
		@ICalculationService calculationService: ICalculationService,
	) {
		super(
			new PlotCalculatedDataWorkerClient(
				webWorkerService,
				plotCalculatedDataWorkerDescriptor,
			),
			sessionService,
			settingsService,
			storageService,
			calculationService,
		);
	}
}

registerSingleton(IPlotService, BrowserPlotService, InstantiationType.Delayed);
