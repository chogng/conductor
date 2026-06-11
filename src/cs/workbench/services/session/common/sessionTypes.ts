export type SessionFile = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceVersion?: number;
  sourcePath?: string | null;
  curveType?: string | null;
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
  [key: string]: unknown;
};

export type ProcessedSeries = {
  id?: string;
  name?: string;
  groupIndex?: number;
  yCol?: number;
  y?: number[];
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
  xGroups?: number[][];
  series?: ProcessedSeries[];
  domain?: ProcessedDomain;
  [key: string]: unknown;
};

export type ProcessingStatus = {
  state: "idle" | "processing" | "done" | "error";
  processed: number;
  total: number;
};
