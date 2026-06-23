/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// TODO(conductor-architecture): Migration bridge.
// These builders are compatibility fallback behind autoTemplatePlan. New
// automatic extraction should consume Assessment blocks and decisions.

import {
  detectAxisRole,
  extractFileMetadata,
  type AxisRole,
  type FileAssessment,
} from "../fileAssessment.ts";
import { normalizeCellText } from "../../../../common/cellText.ts";
import { resolveAutoGroupShape } from "../autoTemplateGrouping.ts";
import {
  parseSecondarySweepFromRows,
  parseVarSweepFromNotes,
} from "../autoTemplateMetadata.ts";
import {
  columnHasNumericRows,
  findGenericNumericColumns,
} from "../autoTemplateRows.ts";
import {
  currentHeaderLooksLikeDrainCurrent,
  currentHeaderLooksLikeGateCurrent,
  inferSpecializedGenericLayout,
  inferStructuredSeriesLayout,
} from "./legacyAutoTemplateStructuredLayout.ts";
import {
  formatCompactNumber,
  type AutoExtractionResult,
  type TemplateRows,
} from "../autoTemplateTypes.ts";

const findFirstMatchingColumn = ({
  dataStartRowIndex,
  fallbackToFirst = true,
  headers,
  rows,
  type,
  role,
}: {
  dataStartRowIndex: number;
  fallbackToFirst?: boolean;
  headers: string[];
  role: AxisRole | null;
  rows: TemplateRows;
  type: "current" | "voltage";
}): number | null => {
  const candidates = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => {
      const normalized = normalizeCellText(header).toLowerCase();
      if (!normalized) return false;
      if (!columnHasNumericRows(rows, dataStartRowIndex, index, 2)) return false;
      return type === "voltage"
        ? normalized.includes("voltage") || normalized === "vg" || normalized === "vd"
        : normalized.includes("current") || normalized === "id" || normalized === "ig";
    });

  if (!candidates.length) return null;

  if (type === "current") {
    const drainCurrentCandidate = candidates.find(({ header }) =>
      currentHeaderLooksLikeDrainCurrent(header),
    );
    if (drainCurrentCandidate) return drainCurrentCandidate.index;
    const nonGateCurrentCandidate = candidates.find(
      ({ header }) => !currentHeaderLooksLikeGateCurrent(header),
    );
    if (!nonGateCurrentCandidate) return null;
  }

  if (role) {
    const roleCandidate = candidates.find(
      ({ header }) => detectAxisRole(header) === role,
    );
    if (roleCandidate) return roleCandidate.index;
  }

  return fallbackToFirst ? (candidates[0]?.index ?? null) : null;
};

const resolveLabelForRole = (
  role: AxisRole | null,
  fallback: string,
): string => {
  if (role === "vg") return "Vg";
  if (role === "vd") return "Vd";
  return fallback;
};

export const inferStrippedChannelPlan = ({
  assessment,
  dataStartRowIndex,
  fileName,
  headers,
  metadata,
  rows,
  totalRowCount,
}: {
  assessment: FileAssessment;
  dataStartRowIndex: number;
  fileName: unknown;
  headers: string[];
  metadata: ReturnType<typeof extractFileMetadata>;
  rows: TemplateRows;
  totalRowCount?: number | null;
}): AutoExtractionResult => {
  const ch1VoltageCol = headers.findIndex((entry) => entry === "CH1 Voltage");
  const ch2VoltageCol = headers.findIndex((entry) => entry === "CH2 Voltage");
  const ch1CurrentCol = headers.findIndex((entry) => entry === "CH1 Current");
  const ch2CurrentCol = headers.findIndex((entry) => entry === "CH2 Current");
  const pointCol = headers.findIndex((entry) => entry === "Point");
  const var2Col = headers.findIndex((entry) => entry === "VAR2");

  if (
    ch1VoltageCol < 0 ||
    ch2VoltageCol < 0 ||
    ch1CurrentCol < 0 ||
    ch2CurrentCol < 0
  ) {
    return {
      message: `${String(fileName ?? "file")}: missing CH1/CH2 voltage/current columns.`,
      ok: false,
      reasons: [],
    };
  }

  const sweptAxis = metadata.strippedSweepVoltageAxis;
  if (!sweptAxis || !assessment.xAxisRole || assessment.curveType === "unknown") {
    return {
      message: `${String(fileName ?? "file")}: unable to infer stripped sweep roles automatically.`,
      ok: false,
      reasons: assessment.reasons,
    };
  }

  const xCol = sweptAxis === "ch1" ? ch1VoltageCol : ch2VoltageCol;
  const fixedVoltageCol = sweptAxis === "ch1" ? ch2VoltageCol : ch1VoltageCol;
  const yCol =
    assessment.curveType === "output"
      ? sweptAxis === "ch1"
        ? ch1CurrentCol
        : ch2CurrentCol
      : sweptAxis === "ch1"
        ? ch2CurrentCol
        : ch1CurrentCol;
  const { groupSize, groups } = resolveAutoGroupShape({
    dataStartRowIndex,
    notesText: metadata.notesText,
    pointColIndex: pointCol,
    rows,
    totalRowCount,
    var2ColIndex: var2Col,
    xCol,
  });
  const normalizedGroupSize =
    Number.isInteger(groupSize) && Number(groupSize) > 0 ? Number(groupSize) : null;
  const hasGroupedLegend = normalizedGroupSize !== null && (groups ?? 0) > 1;
  const fixedLegendValue =
    !hasGroupedLegend && Number.isFinite(metadata.strippedFixedVoltageMagnitude)
      ? formatCompactNumber(metadata.strippedFixedVoltageMagnitude)
      : null;
  const biasRole = assessment.xAxisRole === "vg" ? "vd" : "vg";

  return {
    ok: true,
    plan: {
      bottomTitle: resolveLabelForRole(assessment.xAxisRole, headers[xCol] || "X"),
      confidence: assessment.confidence,
      curveType: assessment.curveType,
      curveTypeLabel: assessment.curveTypeLabel,
      dataStartRowIndex,
      groups,
      leftTitle: "Id",
      legendPrefix: resolveLabelForRole(biasRole, headers[fixedVoltageCol] || "Bias"),
      legendStartColIndex: hasGroupedLegend ? fixedVoltageCol : null,
      legendStartRowIndex: hasGroupedLegend ? dataStartRowIndex : null,
      legendStartValue: fixedLegendValue,
      legendCount: hasGroupedLegend ? null : fixedLegendValue ? 1 : null,
      legendStep: null,
      legendTarget: hasGroupedLegend ? "group" : fixedLegendValue ? "yColumn" : "auto",
      needsTemplate: assessment.needsTemplate,
      reasons: assessment.reasons,
      xAxisRole: assessment.xAxisRole,
      xAxisRoleSource: assessment.xAxisRoleSource,
      xCol,
      xPointsPerGroup: normalizedGroupSize,
      xSegmentationMode: normalizedGroupSize !== null ? "points" : "auto",
      xUnit: "V",
      yCols: [yCol],
      yUnit: "A",
    },
  };
};

export const inferGenericPlan = ({
  assessment,
  dataStartRowIndex,
  fileName,
  headers,
  metadata,
  rows,
  totalRowCount,
}: {
  assessment: FileAssessment;
  dataStartRowIndex: number;
  fileName: unknown;
  headers: string[];
  metadata: ReturnType<typeof extractFileMetadata>;
  rows: TemplateRows;
  totalRowCount?: number | null;
}): AutoExtractionResult => {
  const structuredLayout = inferStructuredSeriesLayout({
    assessment,
    dataStartRowIndex,
    headers,
    rows,
  });

  const effectiveXAxisRole = structuredLayout?.xAxisRole ?? assessment.xAxisRole;
  const effectiveCurveType = structuredLayout?.curveType ?? assessment.curveType;
  const effectiveConfidence =
    assessment.curveType !== "unknown" && assessment.xAxisRole
      ? assessment.confidence
      : structuredLayout
        ? "medium"
        : assessment.confidence;
  const effectiveReasons = structuredLayout
    ? [...structuredLayout.reasons, ...assessment.reasons]
    : assessment.reasons;
  const effectiveRoleSource = structuredLayout?.xAxisRoleSource ?? assessment.xAxisRoleSource;

  if (!effectiveXAxisRole || effectiveCurveType === "unknown") {
    if (
      effectiveCurveType === "cv" ||
      effectiveCurveType === "cf" ||
      effectiveCurveType === "pv"
    ) {
      const specializedLayout =
        inferSpecializedGenericLayout({
          curveType: effectiveCurveType,
          dataStartRowIndex,
          headers,
          rows,
        }) ??
        (() => {
          const genericColumns = findGenericNumericColumns({
            dataStartRowIndex,
            rows,
          });
          if (genericColumns.xCol === null || !genericColumns.yCols.length) return null;
          return {
            leftTitle: headers[genericColumns.yCols[0]!] || "Y",
            xCol: genericColumns.xCol,
            xUnit: effectiveCurveType === "cf" ? "Hz" : "V",
            yCols: genericColumns.yCols,
            yUnit: effectiveCurveType === "pv" ? "A" : "F",
          };
        })();
      if (
        specializedLayout &&
        specializedLayout.xCol !== null &&
        specializedLayout.yCols.length
      ) {
        const resolvedLayout = specializedLayout as typeof specializedLayout & {
          xCol: number;
        };
        const xHeader = headers[resolvedLayout.xCol] || "X";
        const isSingleSeries = resolvedLayout.yCols.length === 1;

        return {
          ok: true,
          plan: {
            bottomTitle: xHeader,
            confidence: effectiveConfidence === "low" ? "medium" : effectiveConfidence,
            curveType: effectiveCurveType,
            curveTypeLabel: effectiveCurveType,
            dataStartRowIndex,
            groups: 1,
            leftTitle: resolvedLayout.leftTitle,
            legendPrefix: "",
            legendStartColIndex: isSingleSeries ? null : resolvedLayout.yCols[0]!,
            legendStartRowIndex:
              isSingleSeries || dataStartRowIndex - 1 < 0 ? null : dataStartRowIndex - 1,
            legendStartValue: null,
            legendCount: isSingleSeries ? null : resolvedLayout.yCols.length,
            legendStep: isSingleSeries ? null : 1,
            legendTarget: isSingleSeries ? "auto" : "yColumn",
            needsTemplate: false,
            reasons:
              effectiveReasons.length > 0
                ? effectiveReasons
                : [
                    `Detected a generic ${effectiveCurveType.toUpperCase()} layout with one numeric X column and ${resolvedLayout.yCols.length} numeric Y column(s).`,
                  ],
            xAxisRole: null,
            xAxisRoleSource: effectiveRoleSource,
            xCol: resolvedLayout.xCol,
            xPointsPerGroup: null,
            xSegmentationMode: "auto",
            xUnit: resolvedLayout.xUnit,
            yCols: resolvedLayout.yCols,
            yUnit: resolvedLayout.yUnit,
          },
        };
      }
    }

    return {
      message: `${String(fileName ?? "file")}: unable to infer axis roles automatically.`,
      ok: false,
      reasons: effectiveReasons,
    };
  }

  const xCol =
    structuredLayout?.xCol ??
    findFirstMatchingColumn({
      dataStartRowIndex,
      headers,
      role: effectiveXAxisRole,
      rows,
      type: "voltage",
    });
  const fallbackYCol = findFirstMatchingColumn({
    dataStartRowIndex,
    headers,
    role: "vd",
    rows,
    type: "current",
  });
  const yCols = structuredLayout?.yCols?.length
    ? structuredLayout.yCols
    : fallbackYCol !== null
      ? [fallbackYCol]
      : [];

  if (xCol === null || !yCols.length) {
    return {
      message: `${String(fileName ?? "file")}: unable to locate auto extraction columns.`,
      ok: false,
      reasons: effectiveReasons,
    };
  }

  const pointCol = headers.findIndex((entry) => normalizeCellText(entry) === "Point");
  const var2Col = headers.findIndex((entry) => normalizeCellText(entry) === "VAR2");
  const { groupSize, groups } = resolveAutoGroupShape({
    dataStartRowIndex,
    notesText: metadata.notesText,
    pointColIndex: pointCol,
    rows,
    totalRowCount,
    var2ColIndex: var2Col,
    xCol,
  });
  const biasRole = effectiveXAxisRole === "vg" ? "vd" : "vg";
  const legendCol = findFirstMatchingColumn({
    dataStartRowIndex,
    fallbackToFirst: false,
    headers,
    role: biasRole,
    rows,
    type: "voltage",
  });
  const var2Role = detectAxisRole(metadata.var2Name);
  const generatedLegendSweep =
    legendCol === null && var2Role === biasRole
      ? parseVarSweepFromNotes(metadata.notesText, "VAR2") ??
        parseSecondarySweepFromRows(rows)
      : null;
  const normalizedGroupSize =
    Number.isInteger(groupSize) && Number(groupSize) > 0 ? Number(groupSize) : null;
  const structuredLegendTarget = structuredLayout?.legendTarget ?? "auto";
  // Structured layouts already map legends by header columns, so they should
  // not be reinterpreted as "group legend" sweeps from row-wise metadata.
  const hasGroupedLegend =
    structuredLegendTarget !== "yColumn" &&
    normalizedGroupSize !== null &&
    (groups ?? 0) > 1 &&
    (legendCol !== null ||
      (generatedLegendSweep?.start !== null && generatedLegendSweep?.count !== null));
  const hasSingleGeneratedLegend =
    !hasGroupedLegend &&
    generatedLegendSweep?.start !== null &&
    generatedLegendSweep?.count === 1;
  const primaryYHeader = headers[yCols[0]!] || "Y";

  return {
    ok: true,
    plan: {
      bottomTitle: resolveLabelForRole(effectiveXAxisRole, headers[xCol] || "X"),
      blocks: structuredLayout?.blocks,
      confidence: effectiveConfidence,
      curveType: effectiveCurveType,
      curveTypeLabel:
        effectiveCurveType === assessment.curveType
          ? assessment.curveTypeLabel
          : effectiveCurveType === "transfer"
            ? effectiveXAxisRole === "vg"
              ? "transfer (vg)"
              : "transfer"
            : effectiveCurveType === "output"
              ? effectiveXAxisRole === "vd"
                ? "output (vd)"
                : "output"
              : effectiveCurveType === "pv"
                ? "pv"
              : effectiveCurveType === "cv"
                ? "cv"
                : effectiveCurveType === "cf"
                  ? "cf"
              : "unknown",
      dataStartRowIndex,
      groups,
      leftTitle:
        structuredLayout?.leftTitle ??
        (currentHeaderLooksLikeDrainCurrent(primaryYHeader) ? "Id" : primaryYHeader),
      legendPrefix:
        structuredLegendTarget === "yColumn"
          ? ""
          : legendCol !== null
          ? resolveLabelForRole(biasRole, headers[legendCol] || "Bias")
          : resolveLabelForRole(biasRole, metadata.var2Name || "Bias"),
      legendStartColIndex:
        structuredLegendTarget === "yColumn"
          ? structuredLayout?.legendStartColIndex ?? null
          : hasGroupedLegend
            ? legendCol
            : null,
      legendStartRowIndex:
        structuredLegendTarget === "yColumn"
          ? structuredLayout?.legendStartRowIndex ?? null
          : hasGroupedLegend
            ? dataStartRowIndex
            : null,
      legendStartValue:
        structuredLegendTarget !== "yColumn" &&
        hasGroupedLegend &&
        legendCol === null &&
        generatedLegendSweep &&
        generatedLegendSweep.start !== null
          ? formatCompactNumber(generatedLegendSweep.start)
          : hasSingleGeneratedLegend
            ? formatCompactNumber(generatedLegendSweep.start)
          : null,
      legendCount:
        structuredLegendTarget === "yColumn"
          ? yCols.length
          : hasGroupedLegend && legendCol === null
          ? (generatedLegendSweep?.count ?? null)
          : hasSingleGeneratedLegend
            ? 1
          : null,
      legendStep:
        structuredLegendTarget === "yColumn"
          ? (structuredLayout?.legendStep ?? 1)
          : hasGroupedLegend && legendCol === null
          ? (generatedLegendSweep?.step ?? null)
          : null,
      legendTarget:
        structuredLegendTarget === "yColumn"
          ? "yColumn"
          : hasGroupedLegend
            ? "group"
            : hasSingleGeneratedLegend
              ? "yColumn"
              : "auto",
      needsTemplate: assessment.needsTemplate && !structuredLayout,
      reasons: effectiveReasons,
      xAxisRole: effectiveXAxisRole,
      xAxisRoleSource: effectiveRoleSource,
      xCol,
      xPointsPerGroup: normalizedGroupSize,
      xSegmentationMode: normalizedGroupSize !== null ? "points" : "auto",
      xUnit: "V",
      yCols,
      yUnit: "A",
    },
  };
};
