import { AUTO_TEMPLATE_CONFIG_FIELD } from "./autoTemplate.ts";
import type { AutoExtractionBlock, AutoExtractionPlan } from "./autoTemplatePlan.ts";
import { toCellLabel } from "./templateCellRef.ts";

type AutoWorkerBlockConfig = Pick<
  AutoExtractionBlock,
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

const formatCompactNumber = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) return "";
  return `${Number(Number(value).toPrecision(12))}`;
};

// Shared serializer used by the template UI. This intentionally mirrors the
// worker config model so auto-detected plans remain editable by users.
export const buildAutoTemplateConfig = (
  plan: AutoExtractionPlan,
): Record<string, unknown> => {
  const normalizedGroupSize =
    Number.isInteger(plan.xPointsPerGroup) && Number(plan.xPointsPerGroup) > 0
      ? Number(plan.xPointsPerGroup)
      : null;
  return {
    [AUTO_TEMPLATE_CONFIG_FIELD]: true,
    bottomTitle: plan.bottomTitle,
    leftTitle: plan.leftTitle,
    legendPrefix: plan.legendPrefix,
    xDataEnd: "",
    xDataStart: toCellLabel(plan.dataStartRowIndex, plan.xCol),
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
  plan: AutoExtractionPlan,
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
    xSegmentationMode: plan.xSegmentationMode,
    xUnit: plan.xUnit,
    yCols: [...plan.yCols],
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
