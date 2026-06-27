export type SessionFile = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceVersion?: number;
  sourcePath?: string | null;
  tableKey?: string | null;
  rawTableHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
  rawTableHealthMessage?: string | null;
  templateEligibility?: "eligible" | "notEligible" | "needsUserAction";
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsReview?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "hint"
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
  curveTypeNeedsReview?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "hint"
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
