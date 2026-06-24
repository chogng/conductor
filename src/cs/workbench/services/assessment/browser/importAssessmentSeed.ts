/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableFactsSeed,
	RawTableFactsFileInput,
	RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	createImportTableFactsSeedFromFile,
	createImportTableFactsSeedFromRows,
} from "src/cs/workbench/services/tableFacts/browser/importTableFactsSeed";

export {
	createImportTableFactsSeedFromFile,
	createImportTableFactsSeedFromRows,
};

export const createImportAssessmentSeedFromRows = (
	fileName: string,
	rows: RawTableFactsRows,
): Promise<ImportTableFactsSeed> => createImportTableFactsSeedFromRows(fileName, rows);

export const createImportAssessmentSeedFromFile = (
	file: RawTableFactsFileInput,
): Promise<ImportTableFactsSeed> => createImportTableFactsSeedFromFile(file);
