import type { AssessmentDecisionState } from "src/cs/workbench/services/assessment/common/assessmentDecision";
import type { ColumnProfile } from "src/cs/workbench/services/assessment/common/columnProfile";
import type { LayoutCandidate } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import type { MeasurementBlockRecord } from "src/cs/workbench/services/assessment/common/measurement";
import type { SchemaFingerprint } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/assessment/common/semanticCandidate";

export type SessionFile = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceVersion?: number;
  sourcePath?: string | null;
  assessmentHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
  assessmentHealthMessage?: string | null;
  templateEligibility?: "eligible" | "notEligible" | "needsUserAction";
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  assessmentAutoApplyAllowed?: boolean;
  assessmentBlocks?: readonly MeasurementBlockRecord[];
  assessmentDecisionConfidence?: number;
  assessmentDecisionReasons?: string[];
  assessmentDecisionState?: AssessmentDecisionState;
  assessmentColumnProfiles?: readonly ColumnProfile[];
  assessmentLayoutCandidates?: readonly LayoutCandidate[];
  assessmentSchemaFingerprint?: SchemaFingerprint;
  assessmentSemanticCandidates?: readonly ColumnSemanticCandidate[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "title"
    | "label"
    | "metadata"
    | "shape"
    | null;
  [key: string]: unknown;
};

export type ProcessedNumberArray = readonly number[] | Float64Array;

export type ProcessedSeries = {
  id?: string;
  name?: string;
  groupIndex?: number;
  yCol?: number;
  y?: ProcessedNumberArray;
  [key: string]: unknown;
};

export type ProcessedDomain = {
  x?: [number, number];
  y?: [number, number];
};

export type ProcessedEntry = {
  fileId?: string;
  fileName?: string;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  curveType?: string;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "title"
    | "label"
    | "metadata"
    | "shape"
    | null;
  supportsSs?: boolean;
  calculationCache?: unknown;
  xUnit?: string;
  x?: {
    sampledPoints?: number | null;
    [key: string]: unknown;
  };
  xGroups?: readonly ProcessedNumberArray[];
  series?: readonly ProcessedSeries[];
  domain?: ProcessedDomain;
  [key: string]: unknown;
};

export type ProcessingStatus = {
  state: "idle" | "processing" | "done" | "error";
  processed: number;
  total: number;
};
