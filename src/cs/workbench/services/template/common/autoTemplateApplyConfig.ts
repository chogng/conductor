/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { AUTO_TEMPLATE_APPLY_CONFIG_FIELD } from "src/cs/workbench/services/template/common/autoTemplate";
import { toCellLabel } from "src/cs/workbench/services/template/common/templateCellRef";

type AutoWorkerBlockConfig = Pick<
  AutoTemplateApplyBlock,
  | "bottomTitle"
  | "endCol"
  | "legendStep"
  | "legendTarget"
  | "startCol"
  | "xAxisRole"
  | "xCol"
> & {
  legendStartCell: {
    colIndex: number;
    rowIndex: number;
  } | null;
  yCols: number[];
};

export type AutoWorkerConfig = Record<string, unknown> & {
  blocks?: AutoWorkerBlockConfig[];
};

export type AutoTemplateApplyPlan = {
  readonly bottomTitle: string;
  readonly blocks?: readonly AutoTemplateApplyBlock[];
  readonly dataStartRowIndex: number;
  readonly groups: number | null;
  readonly leftTitle: string;
  readonly legendPrefix: string;
  readonly legendStartColIndex: number | null;
  readonly legendStartRowIndex: number | null;
  readonly legendStartValue: string | null;
  readonly legendCount: number | null;
  readonly legendStep: number | null;
  readonly legendTarget: "auto" | "group" | "yColumn";
  readonly xAxisRole: "vg" | "vd" | null;
  readonly xCol: number;
  readonly xPointsPerGroup: number | null;
  readonly xSegmentationMode: "auto" | "points";
  readonly xUnit: string;
  readonly yCols: readonly number[];
  readonly yUnit: string;
};

export type AutoTemplateApplyBlock = {
  readonly bottomTitle: string;
  readonly endCol: number;
  readonly legendStartColIndex: number | null;
  readonly legendStartRowIndex: number | null;
  readonly legendStep: number | null;
  readonly legendTarget: "auto" | "group" | "yColumn";
  readonly startCol: number;
  readonly xAxisRole: "vg" | "vd" | null;
  readonly xCol: number;
  readonly yCols: readonly number[];
};

const formatCompactNumber = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) return "";
  return `${Number(Number(value).toPrecision(12))}`;
};

// TODO(conductor-architecture): Migration bridge.
// Serializes legacy auto-extraction plans into editable apply presets. New
// automatic execution should consume Assessment-selected Templates through Slice.
export const buildAutoTemplateApplyConfig = (
  plan: AutoTemplateApplyPlan,
): Record<string, unknown> => {
  const normalizedGroupSize =
    Number.isInteger(plan.xPointsPerGroup) && Number(plan.xPointsPerGroup) > 0
      ? Number(plan.xPointsPerGroup)
      : null;
  return {
    [AUTO_TEMPLATE_APPLY_CONFIG_FIELD]: true,
    bottomTitle: plan.bottomTitle,
    leftTitle: plan.leftTitle,
    legendPrefix: plan.legendPrefix,
    xDataEnd: "",
    xDataStart: toCellLabel(plan.dataStartRowIndex, plan.xCol),
    xColumns: [plan.xCol],
    xRanges: [{
      start: toCellLabel(plan.dataStartRowIndex, plan.xCol),
      end: "End",
    }],
    xPointsPerGroup: normalizedGroupSize !== null ? String(normalizedGroupSize) : "",
    xSegmentationMode: plan.xSegmentationMode,
    xUnit: plan.xUnit,
    yColumns: [...plan.yCols],
    yLegendCount: plan.legendCount !== null ? String(plan.legendCount) : "",
    yLegendStart:
      plan.legendStartColIndex !== null && plan.legendStartRowIndex !== null
        ? toCellLabel(plan.legendStartRowIndex, plan.legendStartColIndex)
        : plan.legendStartValue ?? "",
    yLegendStep: plan.legendStep !== null ? formatCompactNumber(plan.legendStep) : "",
    yLegendTarget: plan.legendTarget,
    yUnit: plan.yUnit,
  };
};

// Shared serializer used by the worker processing path.
export const buildAutoWorkerConfig = (
  plan: AutoTemplateApplyPlan,
): AutoWorkerConfig => {
  const normalizedGroupSize =
    Number.isInteger(plan.xPointsPerGroup) && Number(plan.xPointsPerGroup) > 0
      ? Number(plan.xPointsPerGroup)
      : null;
  const normalizedGroups =
    Number.isInteger(plan.groups) && Number(plan.groups) > 0
      ? Number(plan.groups)
      : null;
  return {
    autoDetectCurveType: true,
    blocks: Array.isArray(plan.blocks)
      ? plan.blocks.map((block) => ({
          bottomTitle: block.bottomTitle,
          endCol: block.endCol,
          legendStartCell:
            block.legendStartColIndex !== null && block.legendStartRowIndex !== null
              ? {
                  colIndex: block.legendStartColIndex,
                  rowIndex: block.legendStartRowIndex,
                }
              : null,
          legendStep: block.legendStep,
          legendTarget: block.legendTarget,
          startCol: block.startCol,
          xAxisRole: block.xAxisRole,
          xCol: block.xCol,
          yCols: [...block.yCols],
        }))
      : undefined,
    bottomTitle: plan.bottomTitle,
    endRow: "end",
    groupSize: normalizedGroupSize,
    groups: normalizedGroups,
    leftTitle: plan.leftTitle,
    legendPrefix: plan.legendPrefix,
    startRow: plan.dataStartRowIndex,
    xCol: plan.xCol,
    xCols: [plan.xCol],
    xSegmentationMode: plan.xSegmentationMode,
    xUnit: plan.xUnit,
    yCols: [...plan.yCols],
    seriesBindings: plan.yCols.map(yCol => ({
      xCol: plan.xCol,
      yCol,
    })),
    yLegendStartCell:
      plan.legendStartColIndex !== null && plan.legendStartRowIndex !== null
        ? {
            colIndex: plan.legendStartColIndex,
            rowIndex: plan.legendStartRowIndex,
          }
        : null,
    yLegendStartValue: plan.legendStartValue,
    yLegendCount: plan.legendCount,
    yLegendStep: plan.legendStep,
    yLegendTarget: plan.legendTarget,
    yUnit: plan.yUnit,
  };
};
