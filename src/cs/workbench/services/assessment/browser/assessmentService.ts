/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IAssessmentService,
  type AssessmentFileInput,
  type AssessmentRows,
  type AssessRawTableInput,
  type IAssessmentService as IAssessmentServiceType,
  type ImportFileAssessment,
  type RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  createRawTableAssessmentRecordFromImportAssessment,
  getColumnCount,
  normalizePositiveCount,
} from "src/cs/workbench/services/assessment/common/assessmentRecord";
import {
  assessImportFile,
  assessImportRows,
} from "src/cs/workbench/services/assessment/browser/fileAssessment";

export class AssessmentService extends Disposable implements IAssessmentServiceType {
  public declare readonly _serviceBrand: undefined;

  public assessImportFile(file: AssessmentFileInput): Promise<ImportFileAssessment> {
    return assessImportFile(file);
  }

  public assessImportRows(
    fileName: string,
    rows: AssessmentRows,
  ): Promise<ImportFileAssessment> {
    return assessImportRows(fileName, rows);
  }

  public async assessRawTable(
    input: AssessRawTableInput,
  ): Promise<RawTableAssessmentRecord> {
    const assessment = await this.assessImportRows(input.fileName ?? input.rawTableId, input.rows);
    const columnCount = normalizePositiveCount(input.columnCount) ?? getColumnCount(input.rows);
    const rowCount = normalizePositiveCount(input.rowCount) ?? input.rows.length;

    return createRawTableAssessmentRecordFromImportAssessment({
      ...input,
      assessment,
      columnCount,
      rowCount,
    });
  }
}

registerSingleton(IAssessmentService, AssessmentService, InstantiationType.Delayed);
