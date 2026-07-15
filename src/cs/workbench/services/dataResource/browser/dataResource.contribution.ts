/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import {
	IDataResourceService,
} from "src/cs/workbench/services/dataResource/common/dataResource";

registerSingleton(
	IDataResourceService,
	DataResourceService as unknown as new (...services: BrandedService[]) => IDataResourceService,
	InstantiationType.Delayed,
);
