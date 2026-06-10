import {
  getLatestTemplateRunRecord,
  type BaseCurveFamily,
  type BaseCurveRecord,
  type DomainRecord,
  type FileRecord,
  type IvCurveMode,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  ProcessedEntry,
  ProcessedSeries,
} from "src/cs/workbench/services/session/common/sessionTypes";

export type FileRecordAxisProjection = {
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly xAxisRole: ProcessedEntry["xAxisRole"];
  readonly yLabel?: string;
  readonly yUnit?: string;
};

export const collectFileRecordBaseCurves = (
  file: FileRecord,
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

export const hasFileRecordBaseCurves = (file: FileRecord): boolean =>
  collectFileRecordBaseCurves(file).length > 0;

export const getFileRecordCurveFamily = (
  file: FileRecord,
): BaseCurveFamily | null =>
  collectFileRecordBaseCurves(file)[0]?.curveFamily ?? null;

export const getFileRecordCurveType = (
  file: FileRecord,
): string | undefined => {
  const curve = collectFileRecordBaseCurves(file)[0];
  if (!curve) {
    return undefined;
  }
  if (curve.curveFamily === "iv" && curve.ivMode) {
    return curve.ivMode;
  }
  if (curve.curveFamily === "it" && curve.itMode) {
    return curve.itMode;
  }
  return curve.curveFamily;
};

export const getFileRecordAxisProjection = (
  file: FileRecord,
): FileRecordAxisProjection => {
  const templateRun = getLatestTemplateRunRecord(file);
  const ivMode = getFileRecordIvMode(file);
  return {
    xAxisRole: getXAxisRoleFromIvMode(ivMode),
    xLabel: templateRun?.config.bottomTitle,
    xUnit: templateRun?.config.xUnit,
    yLabel: templateRun?.config.leftTitle,
    yUnit: templateRun?.config.yUnit,
  };
};

export const getFileRecordXGroups = (
  file: FileRecord,
): number[][] =>
  collectFileRecordBaseCurves(file).map((curve) =>
    curve.points.map((point) => point.x)
  );

export const createProcessedSeriesFromFileRecord = (
  file: FileRecord,
): ProcessedSeries[] =>
  collectFileRecordBaseCurves(file).map((curve, index): ProcessedSeries => {
    const series = file.seriesById[curve.seriesId];
    return {
      groupIndex: index,
      id: curve.seriesId || `series-${index + 1}`,
      legendValue: series?.legendValue,
      name: series?.labelOverride ?? series?.name ?? series?.legendValue,
      y: curve.points.map((point) => point.y),
      yCol: Number.isInteger(Number(series?.yCol)) ? series?.yCol : index + 1,
    };
  });

export const getFileRecordDomain = (
  file: FileRecord,
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

export const fileRecordSupportsSs = (file: FileRecord): boolean =>
  collectFileRecordBaseCurves(file).some((curve) =>
    curve.curveFamily === "iv" && curve.ivMode === "transfer"
  );

const getFileRecordIvMode = (file: FileRecord): IvCurveMode | null =>
  collectFileRecordBaseCurves(file).find((curve) =>
    curve.curveFamily === "iv" && curve.ivMode
  )?.ivMode ?? null;

const getXAxisRoleFromIvMode = (
  ivMode: IvCurveMode | null,
): ProcessedEntry["xAxisRole"] => {
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
