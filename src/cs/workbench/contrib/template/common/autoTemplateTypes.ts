import type {
  AxisRole,
  CurveConfidence,
  CurveKind,
  CurveSource,
} from "../../../common/curveClassification.ts";

export type TemplateRows = Array<Array<unknown> | null | undefined>;

export type AutoExtractionPlan = {
  bottomTitle: string;
  blocks?: AutoExtractionBlock[];
  confidence: CurveConfidence;
  curveType: CurveKind;
  curveTypeLabel: string | null;
  dataStartRowIndex: number;
  groups: number | null;
  leftTitle: string;
  legendPrefix: string;
  legendStartColIndex: number | null;
  legendStartRowIndex: number | null;
  legendStartValue: string | null;
  legendCount: number | null;
  legendStep: number | null;
  legendTarget: "auto" | "group" | "yColumn";
  needsTemplate: boolean;
  reasons: string[];
  xAxisRole: AxisRole | null;
  xAxisRoleSource: CurveSource;
  xCol: number;
  xPointsPerGroup: number | null;
  xSegmentationMode: "auto" | "points";
  xUnit: string;
  yCols: number[];
  yUnit: string;
};

export type AutoExtractionBlock = {
  bottomTitle: string;
  endCol: number;
  legendStartColIndex: number | null;
  legendStartRowIndex: number | null;
  legendStep: number | null;
  legendTarget: "auto" | "group" | "yColumn";
  startCol: number;
  xAxisRole: AxisRole | null;
  xCol: number;
  yCols: number[];
};

export type AutoExtractionResult =
  | {
      message: string;
      ok: false;
      reasons: string[];
    }
  | {
      ok: true;
      plan: AutoExtractionPlan;
    };

export const AUTO_SEGMENTATION_MIN_GROUP_SIZE = 2;
export const AUTO_SEGMENTATION_MIN_GROUPS = 2;
export const AUTO_SEGMENTATION_REPEAT_THRESHOLD = 0.9;

export const formatCompactNumber = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) return "";
  return `${Number(Number(value).toPrecision(12))}`;
};

export type ResolvedGroupShape = {
  groupSize: number | null;
  groups: number | null;
  source: "dimension" | "secondaryCount" | "notes" | null;
};

export type StructuredSeriesLayout = {
  blocks?: AutoExtractionBlock[];
  curveType: CurveKind;
  leftTitle: string;
  legendStartColIndex: number | null;
  legendStartRowIndex: number | null;
  legendStep: number | null;
  legendTarget: "auto" | "group" | "yColumn";
  reasons: string[];
  xAxisRole: AxisRole | null;
  xAxisRoleSource: CurveSource;
  xCol: number;
  yCols: number[];
};

