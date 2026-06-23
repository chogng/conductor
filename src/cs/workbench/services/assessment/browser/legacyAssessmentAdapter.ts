/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	AssessmentRows,
	ImportFileAssessment,
} from "src/cs/workbench/services/assessment/common/assessment";
import { assessImportRows } from "src/cs/workbench/services/assessment/browser/fileAssessment";

// TODO(conductor-assessment-v2): Migration bridge.
// Keep legacy file-level classification isolated while raw-table structure and
// semantic column evidence move into the Assessment V2 engine path.
export class LegacyAssessmentAdapter {
	public assessImportRows(
		fileName: string,
		rows: AssessmentRows,
	): Promise<ImportFileAssessment> {
		return assessImportRows(fileName, rows);
	}
}
