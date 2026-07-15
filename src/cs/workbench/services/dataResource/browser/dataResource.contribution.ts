/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'src/cs/platform/instantiation/common/extensions';
import type { BrandedService } from 'src/cs/platform/instantiation/common/instantiation';
import { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';
import { DataResourceService } from 'src/cs/workbench/services/dataResource/browser/dataResourceService';
import {
	IDataResourceService,
} from 'src/cs/workbench/services/dataResource/common/dataResource';
import { StructuredContentEvidenceService } from 'src/cs/workbench/services/dataResource/browser/structuredContentEvidenceService';
import structuredContentEvidenceWorkerUrl from 'src/cs/workbench/services/dataResource/browser/structuredContentEvidenceWorker.ts?worker&url';
import type { IStructuredContentEvidenceWorker } from 'src/cs/workbench/services/dataResource/browser/structuredContentEvidenceWorker';
import { IStructuredContentEvidenceService } from 'src/cs/workbench/services/dataResource/common/structuredContentEvidenceService';

const structuredContentEvidenceWorkerDescriptor = new WebWorkerDescriptor({
	esmModuleLocationBundler: structuredContentEvidenceWorkerUrl,
	label: 'DataResource Evidence',
});

class BrowserStructuredContentEvidenceService extends StructuredContentEvidenceService {
	public constructor(
		@IWebWorkerService webWorkerService: IWebWorkerService,
	) {
		super(() => webWorkerService.createWorkerClient<IStructuredContentEvidenceWorker>(
			structuredContentEvidenceWorkerDescriptor,
		));
	}
}

registerSingleton(
	IStructuredContentEvidenceService,
	BrowserStructuredContentEvidenceService,
	InstantiationType.Delayed,
);

registerSingleton(
	IDataResourceService,
	DataResourceService as unknown as new (...services: BrandedService[]) => IDataResourceService,
	InstantiationType.Delayed,
);
