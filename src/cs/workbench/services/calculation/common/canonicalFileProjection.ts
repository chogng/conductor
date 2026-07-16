/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  getLatestSliceRunRecord,
  type BaseCurveFamily,
  type BaseCurveRecord,
  type CurveRecord,
  type DomainRecord,
  type FileRecord,
  type IvCurveMode,
  type MetricInputRecord,
  type SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SliceRun } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateBlock } from "src/cs/workbench/services/template/common/templateSpec";

export type FileRecordXAxisRole = "vg" | "vd" | null;

export type FileRecordAxisProjection = {
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly xAxisRole: FileRecordXAxisRole;
  readonly yLabel?: string;
  readonly yUnit?: string;
};

export type CalculationFileRecord = {
  readonly axis?: FileRecordAxisProjection;
  readonly curvesByKey: Record<string, CurveRecord>;
  readonly id: string;
  readonly latestSliceRunId?: FileRecord["latestSliceRunId"];
  readonly metricInputsByKey?: Record<string, MetricInputRecord>;
  readonly seriesById: Record<string, SeriesRecord>;
  readonly seriesOrder: string[];
  readonly sliceRunsById?: FileRecord["sliceRunsById"];
};

export const collectFileRecordBaseCurves = (
  file: CalculationFileRecord,
): BaseCurveRecord[] => {
  const curves = Object.values(file.curvesByKey).filter(
    (curve): curve is BaseCurveRecord => curve.curveGeneration === "base",
  );
  if (!curves.length) {
    return [];
  }

  const used = new Set<BaseCurveRecord>();
  const ordered: BaseCurveRecord[] = [];
  const pushCurve = (curve: BaseCurveRecord): void => {
    if (used.has(curve)) {
      return;
    }
    used.add(curve);
    ordered.push(curve);
  };

  for (const seriesId of file.seriesOrder) {
    for (const curve of curves) {
      if (curve.seriesId === seriesId) {
        pushCurve(curve);
      }
    }
  }
  for (const curve of curves) {
    pushCurve(curve);
  }

  return ordered;
};

export const hasFileRecordBaseCurves = (file: CalculationFileRecord): boolean =>
  collectFileRecordBaseCurves(file).length > 0;

export const getFileRecordCurveFamily = (
  file: CalculationFileRecord,
): BaseCurveFamily | null =>
  collectFileRecordBaseCurves(file)[0]?.curveFamily ?? null;

export const getFileRecordCurveType = (
  file: CalculationFileRecord,
): string | undefined => {
  const curve = collectFileRecordBaseCurves(file)[0];
  if (curve?.curveFamily === "iv" && curve.ivMode) {
    return curve.ivMode;
  }
  if (curve?.curveFamily === "it" && curve.itMode) {
    return curve.itMode;
  }
  if (curve) {
    return curve.curveFamily;
  }
  return undefined;
};

export const getFileRecordAxisProjection = (
  file: CalculationFileRecord,
): FileRecordAxisProjection => {
  if (file.axis) {
    return file.axis;
  }
  const sliceRun = getLatestSliceRunRecord(file);
  const ivMode = getFileRecordIvMode(file);
  return {
    xAxisRole: getXAxisRoleFromIvMode(ivMode),
    xLabel: getSliceTemplateBlockText(sliceRun, (block) => block.titles?.bottom),
    xUnit: getSliceTemplateBlockText(sliceRun, (block) => block.x.unit),
    yLabel: getSliceTemplateBlockText(sliceRun, (block) => block.titles?.left),
    yUnit: getSliceTemplateBlockText(sliceRun, (block) => block.y.unit),
  };
};

export const getFileRecordXGroups = (
  file: CalculationFileRecord,
): number[][] =>
  collectFileRecordBaseCurves(file).map((curve) =>
    curve.points.map((point) => point.x)
  );

export const getFileRecordDomain = (
  file: CalculationFileRecord,
): DomainRecord | undefined => {
  const curves = collectFileRecordBaseCurves(file);
  if (!curves.length) {
    return undefined;
  }

  return {
    x: mergeDomains(curves.map((curve) => curve.domain?.x)),
    y: mergeDomains(curves.map((curve) => curve.domain?.y)),
    yAbsPositive: mergeDomains(curves.map((curve) => curve.domain?.yAbsPositive)),
    yLog10Abs: mergeDomains(curves.map((curve) => curve.domain?.yLog10Abs)),
    yPositive: mergeDomains(curves.map((curve) => curve.domain?.yPositive)),
  };
};

export const fileRecordSupportsSs = (file: CalculationFileRecord): boolean =>
  collectFileRecordBaseCurves(file).some((curve) =>
    curve.curveFamily === "iv" && curve.ivMode === "transfer"
  );

const getFileRecordIvMode = (file: CalculationFileRecord): IvCurveMode | null =>
  collectFileRecordBaseCurves(file).find((curve) =>
    curve.curveFamily === "iv" && curve.ivMode
  )?.ivMode ?? null;

const getSliceTemplateBlockText = (
  sliceRun: SliceRun | undefined,
  readValue: (block: TemplateBlock) => string | undefined,
): string | undefined => {
  for (const block of sliceRun?.template.blocks ?? []) {
    const value = normalizeOptionalText(readValue(block));
    if (value) {
      return value;
    }
  }
  return undefined;
};

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const getXAxisRoleFromIvMode = (
  ivMode: IvCurveMode | null,
): FileRecordXAxisRole => {
  if (ivMode === "transfer") {
    return "vg";
  }
  if (ivMode === "output") {
    return "vd";
  }
  return null;
};

const mergeDomains = (
  domains: readonly (readonly [number, number] | undefined)[],
): [number, number] | undefined => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const domain of domains) {
    if (!domain) {
      continue;
    }
    const left = Number(domain[0]);
    const right = Number(domain[1]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      continue;
    }
    min = Math.min(min, left, right);
    max = Math.max(max, left, right);
  }
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : undefined;
};
