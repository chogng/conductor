/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IRawTableRowsReaderService =
	createDecorator<IRawTableRowsReaderService>("rawTableRowsReaderService");

export type RawTableRowsStore =
	| {
			readonly kind: "memory";
			readonly rows: readonly (readonly unknown[])[];
		}
	| {
			readonly kind: "external";
			readonly normalizedCsvPath?: string | null;
		};

export type RawTableRowsReadInput = {
	readonly fallbackFile?: unknown;
	readonly fileName?: string | null;
	readonly lastModified?: number | null;
	readonly maxRows?: number;
	readonly rowStore?: RawTableRowsStore | null;
};

export type RawTableRows = readonly (readonly string[])[];

export interface IRawTableRowsReaderService {
	readonly _serviceBrand: undefined;

	readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null>;
}
