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
import type { AssessmentDiagnostic } from "src/cs/workbench/services/assessment/common/diagnostics";
import type {
  IvSweepMode,
  MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";
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
    const columnCount = getColumnCount(input.rows);
    const rowCount = input.rows.length;
    const fullRange = {
      startRow: 0,
      endRow: Math.max(0, rowCount - 1),
      startCol: 0,
      endCol: Math.max(0, columnCount - 1),
    };
    const blockId = `${input.rawTableId}:block:0`;
    const diagnosticCodes = assessment.curveTypeReasons.map((_, index) =>
      `assessment.reason.${index + 1}`
    );
    const diagnostics: AssessmentDiagnostic[] = assessment.curveTypeReasons.map((reason, index) => ({
      severity: "info",
      code: diagnosticCodes[index],
      message: reason,
      relatedBlockId: blockId,
    }));

    return {
      fileId: input.fileId,
      rawTableId: input.rawTableId,
      sourceRawTableVersion: input.sourceRawTableVersion,
      groups: [],
      blocks: [{
        id: blockId,
        fileId: input.fileId,
        rawTableId: input.rawTableId,
        label: assessment.curveType ?? input.fileName ?? input.rawTableId,
        family: getMeasurementFamily(assessment),
        ivMode: getIvMode(assessment),
        source: {
          fullRange,
          dataRange: fullRange,
        },
        columns: {
          columns: [],
        },
        confidence: getAssessmentConfidenceScore(assessment),
        rowCount,
        columnCount,
        diagnosticCodes,
      }],
      diagnostics,
      createdAt: Date.now(),
    };
  }
}

const getColumnCount = (rows: AssessmentRows): number => {
  let columnCount = 0;
  for (const row of rows) {
    columnCount = Math.max(columnCount, row.length);
  }
  return columnCount;
};

const getAssessmentConfidenceScore = (
  assessment: ImportFileAssessment,
): number => {
  const confidence = assessment.curveTypeConfidence;
  switch (confidence) {
    case "high":
      return 0.9;
    case "medium":
      return 0.6;
    case "low":
      return 0.3;
  }

  const exhaustive: never = confidence;
  return exhaustive;
};

const getMeasurementFamily = (
  assessment: ImportFileAssessment,
): MeasurementFamily => {
  const curveType = String(assessment.curveType ?? "").toLowerCase();
  if (curveType.includes("transfer") || curveType.includes("output")) {
    return "iv";
  }
  return "unknown";
};

const getIvMode = (
  assessment: ImportFileAssessment,
): IvSweepMode | undefined => {
  const curveType = String(assessment.curveType ?? "").toLowerCase();
  if (curveType.includes("transfer")) {
    return "transfer";
  }
  if (curveType.includes("output")) {
    return "output";
  }
  return undefined;
};

registerSingleton(IAssessmentService, AssessmentService, InstantiationType.Delayed);
