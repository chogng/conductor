/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CreateRawTableFactsInput,
	ImportTableFactsSeed,
	RawTableFactsFileInput,
	RawTableFactsRecord,
	RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import { RawTableFactsService } from "src/cs/workbench/services/tableFacts/browser/rawTableFactsService";

export { RawTableFactsService };

export class AssessmentService extends RawTableFactsService {
	public createImportAssessmentSeedFromFile(file: RawTableFactsFileInput): Promise<ImportTableFactsSeed> {
		return this.createImportTableFactsSeedFromFile(file);
	}

	public createImportAssessmentSeedFromRows(
		fileName: string,
		rows: RawTableFactsRows,
	): Promise<ImportTableFactsSeed> {
		return this.createImportTableFactsSeedFromRows(fileName, rows);
	}

	public assessRawTable(input: CreateRawTableFactsInput): Promise<RawTableFactsRecord> {
		return this.createRawTableFacts(input);
	}
}
