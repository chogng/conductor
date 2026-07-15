/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import tableStructureParserWorkerUrl from 'src/cs/workbench/services/table/browser/tableStructureParserWorker.ts?worker&url';
import type { ITableStructureParserWorker } from 'src/cs/workbench/services/table/browser/tableStructureParserWorker';
import { TableStructureParserService } from 'src/cs/workbench/services/table/browser/tableStructureParserService';
import { ITableStructureParserService } from 'src/cs/workbench/services/table/common/tableStructureParserService';
import { InstantiationType, registerSingleton } from 'src/cs/platform/instantiation/common/extensions';
import { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';

const tableStructureParserWorkerDescriptor = new WebWorkerDescriptor({
	esmModuleLocationBundler: tableStructureParserWorkerUrl,
	label: 'Table Structure Parser',
});

class BrowserTableStructureParserService extends TableStructureParserService {
	public constructor(
		@IWebWorkerService webWorkerService: IWebWorkerService,
	) {
		super(() => webWorkerService.createWorkerClient<ITableStructureParserWorker>(
			tableStructureParserWorkerDescriptor,
		));
	}
}

registerSingleton(
	ITableStructureParserService,
	BrowserTableStructureParserService,
	InstantiationType.Delayed,
);
