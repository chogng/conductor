/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { AssessmentDiagnostic } from "src/cs/workbench/services/assessment/common/diagnostics";
import type {
  IvSweepMode,
  MeasurementBlockRecord,
  MeasurementFamily,
  MeasurementGroupRecord,
} from "src/cs/workbench/services/assessment/common/measurement";

export const IAssessmentService = createDecorator<IAssessmentService>("assessmentService");
export const AssessmentContributionId = "workbench.services.assessment.lifecycle";

export type AssessmentRows = readonly (readonly string[])[];

export type ImportFileAxisRole = "vg" | "vd" | null;

export type ImportFileAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "shape"
  | null;

export type ImportFileAssessment = {
  curveFamily: MeasurementFamily;
  curveType: string | null;
  curveTypeConfidence: "high" | "medium" | "low";
  curveTypeNeedsTemplate: boolean;
  curveTypeReasons: string[];
  ivMode?: IvSweepMode | null;
  xAxisRole: ImportFileAxisRole;
  xAxisRoleSource: ImportFileAxisRoleSource;
};

export type AssessmentFileInput = {
  readonly name: string;
  slice(start?: number, end?: number): {
    text(): Promise<string>;
  };
};

export type AssessRawTableInput = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly sourceRawTableVersion: number;
  readonly rows: AssessmentRows;
  readonly fileName?: string | null;
};

export type RawTableAssessmentRecord = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly sourceRawTableVersion: number;
  readonly groups: readonly MeasurementGroupRecord[];
  readonly blocks: readonly MeasurementBlockRecord[];
  readonly diagnostics: readonly AssessmentDiagnostic[];
  readonly createdAt: number;
};

export interface IAssessmentService {
  readonly _serviceBrand: undefined;

  assessImportFile(file: AssessmentFileInput): Promise<ImportFileAssessment>;
  assessImportRows(fileName: string, rows: AssessmentRows): Promise<ImportFileAssessment>;
  assessRawTable(input: AssessRawTableInput): Promise<RawTableAssessmentRecord>;
}
