import { localize } from "src/cs/nls";
import { getPlotColor } from "../../plot/browser/plotColors.ts";
import { buildNiceTicks, padLinearDomain } from "../../plot/browser/plotViewModel.ts";
import { formatNumber } from "../../calculation/common/numberFormat.ts";

export type RcCurveChartPoint = {
  rc: number;
  rcw: number;
  rSheet: number;
  vg: number;
};

export type RcCurveChartSeries = {
  color: string;
  data: Array<{ x: number; y: number }>;
  id: string;
  lineName: string;
};

export type RcCurveChart = {
  series: RcCurveChartSeries[];
  xDomain: [number, number];
  xTicks: number[];
  yDomain: [number, number];
  yTicks: number[];
};

export type RcAnalyzeRow = {
  fileId?: unknown;
  fileName?: unknown;
  label?: unknown;
  length?: unknown;
  seriesId?: unknown;
  vds?: unknown;
  width?: unknown;
  x?: unknown;
  y?: unknown;
};

export type RcAnalyzeDevice = {
  fileId: unknown;
  label: string;
  length: number;
  seriesId: unknown;
  vds: number;
  width: number;
  x: number[];
  y: number[];
};

type RcSummaryLike = {
  r2?: unknown;
  rc?: unknown;
  rcw?: unknown;
};

type TranslateCount = (key: string, vars?: { count: number }) => string;

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toNumberArray = (value: unknown): number[] =>
  (Array.isArray(value) ? value : []).map((item) => Number(item));

export const createRcAnalyzeDevices = (
  rows: RcAnalyzeRow[],
): RcAnalyzeDevice[] =>
  rows
    .map((row) => ({
      fileId: row.fileId,
      label: `${String(row.fileName ?? "")} / ${String(row.label ?? "")}`,
      length: Number(row.length),
      seriesId: row.seriesId,
      vds: Number(row.vds),
      width: Number(row.width),
      x: toNumberArray(row.x),
      y: toNumberArray(row.y),
    }))
    .filter(
      (device) =>
        Number.isFinite(device.length) &&
        device.length > 0 &&
        Number.isFinite(device.width) &&
        device.width > 0 &&
        Number.isFinite(device.vds) &&
        device.vds !== 0 &&
        device.x.length >= 2 &&
        device.y.length >= 2,
    );

export const createRcCurveChart = (curveRows: unknown[]): RcCurveChart | null => {
  const points = (Array.isArray(curveRows) ? curveRows : [])
    .map((row) => {
      const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
      return {
        rc: Number(record.rc),
        rcw: Number(record.rcw),
        rSheet: Number(record.rSheet),
        vg: Number(record.vg),
      };
    })
    .filter(
      (point): point is RcCurveChartPoint =>
        Number.isFinite(point.vg) &&
        (Number.isFinite(point.rc) ||
          Number.isFinite(point.rcw) ||
          Number.isFinite(point.rSheet)),
    )
    .sort((a, b) => a.vg - b.vg);
  if (points.length < 2) return null;

  const yValues: number[] = [];
  for (const point of points) {
    for (const value of [point.rc, point.rcw, point.rSheet]) {
      if (Number.isFinite(value)) yValues.push(value);
    }
  }
  if (!yValues.length) return null;

  const xValues = points.map((point) => point.vg);
  const xDomain = padLinearDomain(Math.min(...xValues), Math.max(...xValues));
  const yDomain = padLinearDomain(Math.min(...yValues), Math.max(...yValues));
  if (!xDomain || !yDomain) return null;
  const series = [
    {
      color: getPlotColor(0),
      data: points
        .filter((point) => Number.isFinite(point.rc))
        .map((point) => ({ x: point.vg, y: point.rc })),
      id: "rc",
      lineName: "Rc",
    },
    {
      color: getPlotColor(1),
      data: points
        .filter((point) => Number.isFinite(point.rcw))
        .map((point) => ({ x: point.vg, y: point.rcw })),
      id: "rcw",
      lineName: "RcW",
    },
    {
      color: getPlotColor(2),
      data: points
        .filter((point) => Number.isFinite(point.rSheet))
        .map((point) => ({ x: point.vg, y: point.rSheet })),
      id: "rsh",
      lineName: "Rsh",
    },
  ].filter((item) => item.data.length >= 2);

  if (!series.length) return null;

  return {
    series,
    xDomain,
    xTicks: buildNiceTicks(xDomain[0], xDomain[1], 6, { preferTightRange: true }) ?? [],
    yDomain,
    yTicks: buildNiceTicks(yDomain[0], yDomain[1], 5, { preferTightRange: true }) ?? [],
  };
};

export const getRcStatusText = ({
  error,
  isPending,
  rowCount,
  summary,
}: {
  error: string;
  isPending: boolean;
  rowCount: number;
  summary: RcSummaryLike | null;
}): string => {
  if (isPending) return localize("rc_status_running", "Rc running...");
  if (error) return error;
  if (summary) {
    return `Rc=${formatNumber(toFiniteNumber(summary.rc))} | RcW=${formatNumber(toFiniteNumber(summary.rcw))} | R2=${formatNumber(toFiniteNumber(summary.r2), { digits: 4 })}`;
  }
  return localize("rc_status_selected_curves", "Rc uses {count} selected statistic curves", { count: rowCount });
};
