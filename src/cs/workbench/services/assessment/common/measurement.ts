/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentSourceRange } from "src/cs/workbench/services/assessment/common/diagnostics";

export type MeasurementFamily = "iv" | "cv" | "cf" | "pv" | "it" | "unknown";

export type IvSweepMode = "transfer" | "output" | "unknown";

export type ItSweepMode = "stability" | "transient" | "retention" | "unknown";

export type SweepMode = IvSweepMode | ItSweepMode | "unknown";

export type MeasurementColumnRole =
  | "vd"
  | "vg"
  | "vs"
  | "id"
  | "ig"
  | "is"
  | "capacitance"
  | "conductance"
  | "frequency"
  | "time"
  | "voltage"
  | "current"
  | "unknown";

export type MeasurementColumnRef = {
  readonly rawCol: number;
  readonly headerText: string;
  readonly role: MeasurementColumnRole;
  readonly unit?: string | null;
  readonly sourceRange?: AssessmentSourceRange;
  readonly confidence?: number;
};

export type MeasurementColumnMap = {
  readonly columns: readonly MeasurementColumnRef[];
};

export type MeasurementBlockSource = {
  readonly fullRange: AssessmentSourceRange;
  readonly headerRange?: AssessmentSourceRange;
  readonly dataRange?: AssessmentSourceRange;
  readonly titleRange?: AssessmentSourceRange;
};

export type MeasurementGroupRecord = {
  readonly id: string;
  readonly fileId: string;
  readonly rawTableId: string;
  readonly label: string;
  readonly titleRange?: AssessmentSourceRange;
  readonly blockIds: readonly string[];
  readonly confidence?: number;
};

export type MeasurementBlockRecord = {
  readonly id: string;
  readonly fileId: string;
  readonly rawTableId: string;
  readonly groupId?: string;
  readonly label: string;
  readonly family: MeasurementFamily;
  readonly ivMode?: IvSweepMode;
  readonly itMode?: ItSweepMode;
  readonly source: MeasurementBlockSource;
  readonly columns: MeasurementColumnMap;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly confidence?: number;
  readonly diagnosticCodes: readonly string[];
};
