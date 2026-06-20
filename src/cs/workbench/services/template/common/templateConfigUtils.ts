/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { parseCellLabel } from "src/cs/workbench/services/template/common/templateCellRef";
import { normalizeColumnIndexes } from "src/cs/workbench/services/template/common/templateXYBinding";
import {
  getTemplateXRangeColumns,
  getTemplateXRangeLegacyFields,
  normalizeTemplateXRanges,
  type TemplateXRange,
} from "src/cs/workbench/services/template/common/templateXRange";

export type TemplateConfig = {
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
  name: string;
  xColumns: number[];
  xRanges: TemplateXRange[];
  yColumns: number[];
  stopOnError: boolean;
  xDataEnd: string;
  xDataStart: string;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegmentCount: string;
  xPointsPerGroup: string;
  xUnit: string;
  yLegendCount: string;
  yLegendStart: string;
  yLegendStep: string;
  yLegendTarget: "auto" | "yColumn" | "group";
  yUnit: string;
};

export const createEmptyTemplateConfig = (
  overrides: Partial<TemplateConfig> = {},
): TemplateConfig => {
  const config = {
    name: "",
    xDataStart: "",
    xDataEnd: "",
    xSegmentationMode: "auto" as const,
    xSegmentCount: "",
    xPointsPerGroup: "",
    xUnit: "V",
    yLegendStart: "",
    yLegendCount: "",
    yLegendStep: "",
    yLegendTarget: "auto" as const,
    yUnit: "A",
    stopOnError: false,
    bottomTitle: "",
    leftTitle: "",
    legendPrefix: "",
    xColumns: [],
    yColumns: [],
    ...overrides,
  };
  const xDataEnd = normalizeXDataEndValue(config.xDataEnd);
  const xRanges = normalizeTemplateXRanges(
    config.xRanges,
    config.xDataStart,
    xDataEnd,
    config.xColumns,
  );
  const legacyXRange = getTemplateXRangeLegacyFields(xRanges);
  const xColumns = getTemplateXRangeColumns(xRanges).length
    ? getTemplateXRangeColumns(xRanges)
    : normalizeTemplateXColumns(config.xColumns, legacyXRange.xDataStart || config.xDataStart);
  const yColumns = normalizeColumnIndexes(config.yColumns);
  return {
    ...config,
    xColumns,
    xDataEnd: legacyXRange.xDataEnd || xDataEnd,
    xDataStart: legacyXRange.xDataStart || String(config.xDataStart ?? ""),
    xRanges,
    yColumns,
  };
};

const normalizeTemplateXColumns = (
  columns: readonly unknown[] | undefined,
  xDataStart: unknown,
): number[] => {
  const normalized = normalizeColumnIndexes(columns);
  if (normalized.length) {
    return normalized;
  }

  const start = parseCellLabel(xDataStart);
  return start ? [start.colIndex] : [];
};

export const normalizeXDataEndValue = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "end") return "";
  return raw;
};

export const cloneTemplateConfig = (
  config: Partial<TemplateConfig>,
): TemplateConfig => {
  const yColumns = normalizeColumnIndexes(config.yColumns);
  const cloned = createEmptyTemplateConfig({
    bottomTitle: config.bottomTitle,
    leftTitle: config.leftTitle,
    legendPrefix: config.legendPrefix,
    name: config.name,
    stopOnError: config.stopOnError,
    xColumns: config.xColumns,
    xDataEnd: config.xDataEnd,
    xDataStart: config.xDataStart,
    xRanges: config.xRanges,
    xPointsPerGroup: config.xPointsPerGroup,
    xSegmentCount: config.xSegmentCount,
    xSegmentationMode: config.xSegmentationMode,
    xUnit: config.xUnit,
    yColumns,
    yLegendCount: config.yLegendCount,
    yLegendStart: config.yLegendStart,
    yLegendStep: config.yLegendStep,
    yLegendTarget: config.yLegendTarget,
    yUnit: config.yUnit,
  });
  const xDataEnd = normalizeXDataEndValue(cloned.xDataEnd);
  const xRanges = normalizeTemplateXRanges(cloned.xRanges, cloned.xDataStart, xDataEnd, cloned.xColumns);

  return {
    ...cloned,
    xDataEnd,
    xColumns: getTemplateXRangeColumns(xRanges).length
      ? getTemplateXRangeColumns(xRanges)
      : normalizeTemplateXColumns(config.xColumns, cloned.xDataStart),
    xRanges,
    yColumns,
  };
};

export const normalizeTemplateConfigRecord = (
  source: Partial<TemplateConfig> & Record<string, unknown>,
): TemplateConfig => {
  const xDataStart = String(source?.xDataStart ?? "");
  const xDataEnd = normalizeXDataEndValue(source?.xDataEnd);
  const yColumns = normalizeColumnIndexes(source?.yColumns);
  const xRanges = normalizeTemplateXRanges(
    Array.isArray(source?.xRanges) ? source.xRanges : undefined,
    xDataStart,
    xDataEnd,
    Array.isArray(source?.xColumns) ? source.xColumns : undefined,
  );
  const xColumnsFromRanges = getTemplateXRangeColumns(xRanges);
  const xColumns = xColumnsFromRanges.length
    ? xColumnsFromRanges
    : normalizeTemplateXColumns(source?.xColumns, xDataStart);

  return createEmptyTemplateConfig({
    name: String(source?.name ?? ""),
    xDataStart,
    xDataEnd,
    xColumns,
    xRanges,
    xSegmentationMode:
      source?.xSegmentationMode === "points" ||
      source?.xSegmentationMode === "segments" ||
      source?.xSegmentationMode === "auto"
        ? source.xSegmentationMode
        : "auto",
    xSegmentCount: String(source?.xSegmentCount ?? ""),
    xPointsPerGroup: String(source?.xPointsPerGroup ?? ""),
    xUnit: String(source?.xUnit ?? "V") || "V",
    yLegendStart: String(source?.yLegendStart ?? ""),
    yLegendCount: String(source?.yLegendCount ?? ""),
    yLegendStep: String(source?.yLegendStep ?? ""),
    yLegendTarget:
      source?.yLegendTarget === "yColumn" ||
      source?.yLegendTarget === "group" ||
      source?.yLegendTarget === "auto"
        ? source.yLegendTarget
        : "auto",
    yUnit: String(source?.yUnit ?? "A") || "A",
    stopOnError: Boolean(source?.stopOnError),
    bottomTitle: String(source?.bottomTitle ?? ""),
    leftTitle: String(source?.leftTitle ?? ""),
    legendPrefix: String(source?.legendPrefix ?? ""),
    yColumns,
  });
};

export const toTemplateNameKey = (name: unknown): string =>
  String(name ?? "")
    .trim()
    .toLowerCase();
