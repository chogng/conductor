/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	ParsedTableStructure,
	TableStructureParseInput,
} from "src/cs/workbench/services/table/common/tableStructureParser";

export const ITableStructureParserService = createDecorator<ITableStructureParserService>(
	"tableStructureParserService",
);

/** Owns the runtime used to turn a table read buffer into physical table structure. */
export interface ITableStructureParserService extends IDisposable {
	readonly _serviceBrand: undefined;

	parse(input: TableStructureParseInput): Promise<ParsedTableStructure>;
}
