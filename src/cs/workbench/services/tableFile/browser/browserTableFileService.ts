/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	TableFileService,
} from "src/cs/workbench/services/tableFile/browser/tableFileService";
import { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";
import {
	ITableFileService,
} from "src/cs/workbench/services/tableFile/common/tablefiles";

export class BrowserTableFileService extends TableFileService {
	public constructor(
		@IFileService fileService: IFileService,
		@ITableStructureParserService tableStructureParserService: ITableStructureParserService,
	) {
		super(fileService, tableStructureParserService);
	}
}

registerSingleton(ITableFileService, BrowserTableFileService, InstantiationType.Delayed);
