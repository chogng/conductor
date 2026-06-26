/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { readRawTableRows } from "src/cs/workbench/services/files/browser/rawTableRowsReader";
import {
	IRawTableRowsReaderService,
	type RawTableRows,
	type RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";

export class RawTableRowsReaderService extends Disposable implements IRawTableRowsReaderService {
	public declare readonly _serviceBrand: undefined;

	public constructor() {
		super();
	}

	public readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		return readRawTableRows(input);
	}
}

registerSingleton(IRawTableRowsReaderService, RawTableRowsReaderService, InstantiationType.Delayed);
