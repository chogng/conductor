import React, {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Papa from "papaparse";
import JSZip from "jszip";
import CanvasMultiLineChart from "./CanvasMultiLineChart";
import {
  computeCentralDerivative,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInIdWindow,
  computeSubthresholdSwingFitInRange,
  classifySsFit,
  computeLegendDerivativeSeries,
  formatNumber,
} from "./analysisMath";
import { apiService } from "../../../services/apiService";
import Select from "../../../components/ui/Select";
import Button from "../../../components/ui/Button";
import Tabs from "../../../components/ui/Tabs";
import Card from "../../../components/ui/Card";
import Toast from "../../../components/ui/Toast";
import { COLORS } from "./chartColors";

const useInViewOnce = (options = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      {
        root: options.root ?? null,
        rootMargin: options.rootMargin ?? "600px",
        threshold: options.threshold ?? 0.01,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, options.root, options.rootMargin, options.threshold]);

  return { ref, inView };
};

const buildPoints = (xArr, yArr) => {
  if (!xArr || !yArr) return [];
  const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  if (n <= 0) return [];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const xRaw = xArr[i];
    const yRaw = yArr[i];
    const x = Number.isFinite(xRaw) ? xRaw : null;
    const y = Number.isFinite(yRaw) ? yRaw : null;
    const yAbs = y === null ? null : Math.abs(y);
    out[i] = {
      x,
      y,
      yPositive: y !== null && y > 0 ? y : null,
      yAbsPositive: yAbs !== null && yAbs > 0 ? yAbs : null,
    };
  }
  return out;
};

const normalizeFloat = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return num;
  return Number(num.toPrecision(12));
};

const normalizeVarToken = (token) => {
  const t = String(token || "").trim().toLowerCase();
  return t === "vg" || t === "vd" ? t : null;
};

const varTokenToSymbol = (token) => {
  if (token === "vg") return "Vg";
  if (token === "vd") return "Vd";
  return null;
};

// Origin-like: choose a "nice" step (1/2/2.5/5/10 × 10^k), then snap endpoints to multiples of step.
// When preferTightRange is true, prioritize minimizing extra expansion beyond the requested domain.
const buildNiceTicks = (
  minRaw,
  maxRaw,
  desiredTickCount = 6,
  { preferTightRange = false } = {},
) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

  // Avoid degenerate ranges.
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad * 0.5;
    hi += pad * 0.5;
  }

  const safeSpan = hi - lo;
  const target = Math.max(2, Math.floor(desiredTickCount));
  const roughStep = safeSpan / (target - 1);
  if (!Number.isFinite(roughStep) || roughStep <= 0) return null;

  const exp = Math.floor(Math.log10(Math.abs(roughStep)));
  const base = Math.pow(10, exp);
  const candidates = [1, 2, 2.5, 5, 10];
  const maxExpandRatio = preferTightRange ? 0.35 : 0.75;
  const maxTickCount = preferTightRange ? 11 : 15;

  const stepPenalty = (step) => {
    // Prefer steps that can be represented with fewer decimal places.
    const abs = Math.abs(step);
    if (!(abs > 0)) return 100;
    for (let digits = 0; digits <= 8; digits++) {
      const rounded = Number(abs.toFixed(digits));
      if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
    }
    return 9;
  };

  let best = null;
  for (const mantissa of candidates) {
    const step = normalizeFloat(mantissa * base);
    if (!(step > 0)) continue;

    const snappedMin = normalizeFloat(Math.floor(lo / step) * step);
    const snappedMax = normalizeFloat(Math.ceil(hi / step) * step);
    const span = snappedMax - snappedMin;
    if (!(span > 0)) continue;

    const count = Math.round(span / step) + 1;
    const expandRatio = (span - safeSpan) / safeSpan;
    if (count > maxTickCount) continue;
    if (preferTightRange && expandRatio > maxExpandRatio) continue;

    // Primary: closeness to desired tick count; Secondary: minimal extra blank space; Tertiary: fewer decimals.
    const score =
      (preferTightRange
        ? Math.max(0, expandRatio) * 30
        : Math.abs(count - target) * 10) +
      (preferTightRange
        ? Math.abs(count - target) * 2
        : Math.max(0, expandRatio) * 2) +
      stepPenalty(step) * 0.25;

    if (!best || score < best.score) {
      best = { score, step, snappedMin, snappedMax };
    }
  }

  if (!best && preferTightRange) {
    // Fallback: relax constraints if everything got filtered out.
    return buildNiceTicks(minRaw, maxRaw, desiredTickCount, {
      preferTightRange: false,
    });
  }
  if (!best) return null;

  const out = [];
  const maxIterations = 200;
  for (let i = 0; i < maxIterations; i++) {
    const v = normalizeFloat(best.snappedMin + best.step * i);
    if (v > best.snappedMax + best.step * 0.5) break;
    out.push(v);
  }

  return out.length >= 2 ? out : null;
};

// Origin-like "Auto": balances (1) tick count closeness and (2) snapped endpoints, instead of enforcing a tight range.
// Heuristic notes:
// - Origin typically snaps axis endpoints to "nice" multiples of a "nice" step.
// - It also tries to keep the number of major ticks in a reasonable band (often ~5–7),
//   but will deviate if doing so would cause excessive expansion.
const buildOriginAutoTicks = (minRaw, maxRaw, desiredTickCount = 6) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

  // Avoid degenerate ranges.
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad * 0.5;
    hi += pad * 0.5;
  }

  const safeSpan = hi - lo;
  const target = Math.max(2, Math.floor(desiredTickCount));
  const roughStep = safeSpan / (target - 1);
  if (!Number.isFinite(roughStep) || roughStep <= 0) return null;

  const exp0 = Math.floor(Math.log10(Math.abs(roughStep)));
  const expCandidates = [exp0 - 1, exp0, exp0 + 1];
  const mantissas = [1, 2, 2.5, 5, 10];

  const maxTickCount = 15;
  const maxExpandRatio = 2.0;

  const stepPenalty = (step) => {
    const abs = Math.abs(step);
    if (!(abs > 0)) return 100;
    for (let digits = 0; digits <= 8; digits++) {
      const rounded = Number(abs.toFixed(digits));
      if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
    }
    return 9;
  };

  const bandPenalty = (count) => {
    // Prefer a typical "auto" band, but don't hard-reject.
    const minBand = 5;
    const maxBand = 7;
    if (count < minBand) return (minBand - count) * 3;
    if (count > maxBand) return (count - maxBand) * 3;
    return 0;
  };

  let best = null;
  for (const exp of expCandidates) {
    const base = Math.pow(10, exp);
    for (const mantissa of mantissas) {
      const step = normalizeFloat(mantissa * base);
      if (!(step > 0)) continue;

      const snappedMin = normalizeFloat(Math.floor(lo / step) * step);
      const snappedMax = normalizeFloat(Math.ceil(hi / step) * step);
      const span = snappedMax - snappedMin;
      if (!(span > 0)) continue;

      const count = Math.round(span / step) + 1;
      if (count > maxTickCount) continue;

      const expandRatio = (span - safeSpan) / safeSpan;
      if (expandRatio > maxExpandRatio) continue;

      const leftPad = lo - snappedMin;
      const rightPad = snappedMax - hi;
      const balancePenalty =
        safeSpan > 0 ? Math.abs(leftPad - rightPad) / safeSpan : 0;

      const score =
        Math.abs(count - target) * 10 +
        bandPenalty(count) * 2 +
        Math.max(0, expandRatio) * 7 +
        balancePenalty * 0.5 +
        stepPenalty(step) * 0.25;

      if (!best || score < best.score) {
        best = { score, step, snappedMin, snappedMax };
      }
    }
  }

  if (!best) return null;

  const out = [];
  const maxIterations = 200;
  for (let i = 0; i < maxIterations; i++) {
    const v = normalizeFloat(best.snappedMin + best.step * i);
    if (v > best.snappedMax + best.step * 0.5) break;
    out.push(v);
  }

  return out.length >= 2 ? out : null;
};

const inferTickDigitsFromTicks = (ticks) => {
  if (!Array.isArray(ticks) || ticks.length < 2) return 4;
  const step = Math.abs(Number(ticks[1]) - Number(ticks[0]));
  if (!Number.isFinite(step) || step <= 0) return 4;

  const abs = normalizeFloat(step);
  for (let digits = 0; digits <= 8; digits++) {
    const rounded = Number(abs.toFixed(digits));
    if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
  }
  return 4;
};

const computeLabelInterval = (ticks, maxLabels = 7) => {
  const n = Array.isArray(ticks) ? ticks.length : 0;
  if (n <= maxLabels) return 0;
  // Recharts interval: number of ticks to skip between labels.
  return Math.max(0, Math.ceil(n / maxLabels) - 1);
};

const parseOptionalNumber = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const padLinearDomain = (min, max) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.05;
    return [lo - pad, hi + pad];
  }
  const span = hi - lo;
  const pad = span * 0.05;
  return [lo - pad, hi + pad];
};

const padLogDomain = (min, max) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [1e-3, 1];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= 0) return [1e-3, 1];
  const safeLo = lo > 0 ? lo : hi / 1000;
  if (safeLo === hi) return [safeLo / 1.25, hi * 1.25];
  return [safeLo / 1.1, hi * 1.1];
};

const computeMinMax = (seriesList, { yKey = "y" } = {}) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const resolvedYKey = typeof yKey === "string" && yKey ? yKey : "y";

  for (const series of seriesList ?? []) {
    for (const point of series?.data ?? []) {
      const x = point?.x;
      const y = point?.[resolvedYKey];
      if (typeof x === "number" && Number.isFinite(x)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (typeof y === "number" && Number.isFinite(y)) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    minX: Number.isFinite(minX) ? minX : null,
    maxX: Number.isFinite(maxX) ? maxX : null,
    minY: Number.isFinite(minY) ? minY : null,
    maxY: Number.isFinite(maxY) ? maxY : null,
  };
};

const buildStepTicks = (minRaw, maxRaw, stepRaw) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  const step = Number(stepRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step))
    return null;
  if (step <= 0) return null;

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);

  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;

  const out = [];
  const maxIterations = 200;
  for (let i = 0; i < maxIterations; i++) {
    const v = start + step * i;
    if (v > end + step * 0.5) break;
    out.push(Number(v.toPrecision(12)));
  }
  return out.length >= 2 ? out : null;
};

const buildLogTicks = (minRaw, maxRaw, decadeStepRaw = 1) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  const decadeStep = Math.max(1, Math.floor(Number(decadeStepRaw) || 1));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= 0) return null;

  const safeLo = lo > 0 ? lo : hi / 1000;
  const expMin = Math.floor(Math.log10(safeLo));
  const expMax = Math.ceil(Math.log10(hi));

  const out = [];
  for (let e = expMin; e <= expMax; e += decadeStep) {
    out.push(Math.pow(10, e));
  }
  return out.length >= 2 ? out : null;
};

const preserveScrollPosition = (action) => {
  if (typeof window === "undefined") return action();
  const x = window.scrollX;
  const y = window.scrollY;
  action();
  // Prevent layout shifts (e.g. active badge moving) from causing page jumps.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(x, y);
    });
  });
};

const FileCard = React.memo(function FileCard({
  file,
  isActive,
  onSelectFile,
  yUnitFactor = 1,
  yUnitLabel = "A",
  yScale = "linear",
}) {
  const { ref, inView } = useInViewOnce();
  const seriesCount = Array.isArray(file?.series) ? file.series.length : 0;
  const sampledPoints = file?.x?.sampledPoints ?? null;
  const yAxisMin = Number(file?.domain?.y?.[0]);
  const yAxisMax = Number(file?.domain?.y?.[1]);
  const yAxisMinLabel = Number.isFinite(yAxisMin)
    ? formatNumber(yAxisMin * yUnitFactor, { digits: 3 })
    : null;
  const yAxisMaxLabel = Number.isFinite(yAxisMax)
    ? formatNumber(yAxisMax * yUnitFactor, { digits: 3 })
    : null;
  const ySuffix =
    typeof yUnitLabel === "string" && yUnitLabel ? ` ${yUnitLabel}` : "";

  return (
    <button
      type="button"
      ref={ref}
      onMouseDown={(e) => {
        // Prevent the browser from scrolling the page to "fully reveal" the focused card.
        // (This happens before onClick in some browsers.)
        e.preventDefault();
      }}
      onClick={() => onSelectFile?.(file?.fileId)}
      className={`text-left rounded-xl border transition-colors overflow-hidden ${isActive
        ? "border-accent/40 bg-accent/5"
        : "border-border bg-bg-surface hover:bg-bg-surface-hover"
        }`}
    >
      <div className="px-2 pt-1.5 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-text-primary truncate">
              {file.fileName}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5 space-y-0.5">
              <div>
                series: {seriesCount}
                {sampledPoints ? ` · points: ${sampledPoints}` : ""}
              </div>
              {file.curveType && <div>Type: {file.curveType}</div>}
            </div>
          </div>
          {isActive && (
            <div className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
              Active
            </div>
          )}
        </div>
      </div>

      <div
        className="relative w-full bg-bg-page"
        style={{ aspectRatio: "16 / 9" }}
      >
        {inView ? (
          <CanvasMultiLineChart
            xGroups={file.xGroups}
            series={file.series}
            domain={file.domain}
            yScaleFactor={yUnitFactor}
            yScaleType={yScale}
            yUnitLabel={yUnitLabel}
            title={file.fileName}
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-bg-page/40" />
        )}
        {(yAxisMinLabel || yAxisMaxLabel) && (
          <div className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded-md bg-black/50 text-white space-y-0.5">
            {yAxisMinLabel && (
              <div>
                ymin: {yAxisMinLabel}
                {ySuffix}
              </div>
            )}
            {yAxisMaxLabel && (
              <div>
                ymax: {yAxisMaxLabel}
                {ySuffix}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
});

import { ArrowDownWideNarrow, ArrowUpWideNarrow } from "lucide-react";

const OverviewGrid = React.memo(function OverviewGrid({
  processedData,
  processingStatus,
  activeFileId,
  onSelectFile,
  yUnitFactor,
  yUnitLabel,
  yScale,
}) {
  const [sortOrder, setSortOrder] = useState("none"); // "none" | "desc" | "asc"
  const [curveFilter, setCurveFilter] = useState("all");

  const sortedData = useMemo(() => {
    if (!processedData) return [];
    if (sortOrder === "none") return processedData;
    return [...processedData].sort((a, b) => {
      // Sort by yMax
      const aY = a?.domain?.y?.[1] ?? -Infinity;
      const bY = b?.domain?.y?.[1] ?? -Infinity;
      return sortOrder === "desc" ? bY - aY : aY - bY;
    });
  }, [processedData, sortOrder]);

  const filteredData = useMemo(() => {
    if (curveFilter === "all") return sortedData;
    const target = curveFilter === "transfer" ? "vg" : "vd";
    return sortedData.filter((f) => {
      // Check curveType field first (if available)
      if (f?.curveType) {
        const curveType = String(f.curveType).toLowerCase();
        return curveType.includes(target);
      }
      // Fallback to xLabel
      const label = String(f?.xLabel || "").toLowerCase();
      return label.includes(target);
    });
  }, [sortedData, curveFilter]);

  if (!processedData?.length) return null;

  return (
    <Card variant="panel">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-text-primary">
            Overview ({sortedData.length})
          </h2>
        </div>


        <div className="flex items-center gap-3">
          <Tabs
            groupLabel="Curve filter"
            options={[
              {
                label: "All",
                value: "all",
                cta: "Device Analysis",
                ctaPosition: "curve-filter",
                ctaCopy: "all",
              },
              {
                label: "Transfer",
                value: "transfer",
                cta: "Device Analysis",
                ctaPosition: "curve-filter",
                ctaCopy: "transfer",
              },
              {
                label: "Output",
                value: "output",
                cta: "Device Analysis",
                ctaPosition: "curve-filter",
                ctaCopy: "output",
              },
            ]}
            value={curveFilter}
            onChange={setCurveFilter}
            size="md"
          />

          <button
            type="button"
            onClick={() => {
              setSortOrder((prev) => {
                if (prev === "none") return "desc";
                if (prev === "desc") return "asc";
                return "none";
              });
            }}
            className={`h-[48px] w-[48px] flex items-center justify-center rounded-md border text-text-secondary transition-colors ${sortOrder !== "none"
              ? "bg-accent/10 border-accent/20 text-accent"
              : "border-border bg-bg-surface hover:bg-bg-page hover:text-text-primary"
              }`}
            title={`Sort by yMax: ${sortOrder === "none" ? "None" : sortOrder === "desc" ? "Descending" : "Ascending"}`}
          >
            {sortOrder === "asc" ? (
              <ArrowUpWideNarrow size={18} />
            ) : (
              <ArrowDownWideNarrow size={18} />
            )}
          </button>

          {processingStatus?.state === "processing" && (
            <div className="text-xs text-text-secondary">
              Processing {processingStatus.processed}/{processingStatus.total}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
        {filteredData.map((file) => (
          <FileCard
            key={file.fileId}
            file={file}
            isActive={file.fileId === activeFileId}
            onSelectFile={onSelectFile}
            yUnitFactor={yUnitFactor}
            yUnitLabel={yUnitLabel}
            yScale={yScale}
          />
        ))}
      </div>
    </Card>
  );
});

const CalculatedParametersRow = React.memo(function CalculatedParametersRow({
  row,
  buildSsTooltip,
}) {
  if (!row) return null;

  return (
    <tr className="hover:bg-bg-page/30">
      <td className="p-2 text-text-primary font-medium whitespace-nowrap">
        {row.name}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.ion)}
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtIon)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.ioff)}
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtIoff)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.ionIoff, { digits: 3 })}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.gmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtGmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${row.ssConfidence === "high"
            ? "bg-green-500/10 text-green-500 border-green-500/20"
            : row.ssConfidence === "low"
              ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
              : row.ssConfidence === "fail"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-bg-page text-text-primary border-border"
            }`}
          title={buildSsTooltip ? buildSsTooltip(row) : ""}
        >
          {row.ss !== null
            ? formatNumber(row.ss, { digits: 2 })
            : row.ssConfidence === "fail"
              ? "Fail"
              : "—"}
        </span>
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtSs)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.jon)}
      </td>
    </tr>
  );
});

CalculatedParametersRow.displayName = "CalculatedParametersRow";

const MainPlotChart = React.memo(function MainPlotChart({
  plotType,
  activeFile,
  seriesList,
  axis,
  xDomain,
  xTicks,
  xTickDigits,
  xLabelInterval,
  yScaleMode,
  yTicksMode,
  plotYFactor,
  plotYUnitLabel,
  focusedSeriesId,
  focusedFitLine,
  focusedSeriesColor,
  focusedSsOverlay,
  ssOverlayStyle,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) {
  const plotYKey = useMemo(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") return "yPositive";
    return "y";
  }, [yScaleMode]);

  const autoMinMax = useMemo(
    () => computeMinMax(seriesList, { yKey: plotYKey }),
    [plotYKey, seriesList],
  );

  const autoMinY = autoMinMax?.minY ?? null;
  const autoMaxY = autoMinMax?.maxY ?? null;

  const effectiveYScale = useMemo(() => {
    if (yScaleMode === "linear") return "linear";
    if (autoMinY === null || autoMaxY === null) return "linear";
    if (autoMaxY <= 0) return "linear";
    return yScaleMode; // 'log' | 'logAbs'
  }, [autoMaxY, autoMinY, yScaleMode]);

  const yDomain = useMemo(() => {
    const auto =
      autoMinMax.minY === null || autoMinMax.maxY === null
        ? effectiveYScale === "linear"
          ? [0, 1]
          : [1e-3, 1]
        : effectiveYScale === "linear"
          ? padLinearDomain(autoMinMax.minY, autoMinMax.maxY)
          : padLogDomain(autoMinMax.minY, autoMinMax.maxY);

    const minUserRaw = parseOptionalNumber(axis?.yMin);
    const maxUserRaw = parseOptionalNumber(axis?.yMax);
    const minUser = minUserRaw !== null ? minUserRaw / plotYFactor : null;
    const maxUser = maxUserRaw !== null ? maxUserRaw / plotYFactor : null;

    let min = minUser ?? auto[0];
    let max = maxUser ?? auto[1];

    if (effectiveYScale !== "linear") {
      if (min <= 0) min = auto[0];
      if (max <= 0) max = auto[1];
      if (min <= 0 || max <= 0) return auto;
      return padLogDomain(min, max);
    }

    return padLinearDomain(min, max);
  }, [
    autoMinMax.maxY,
    autoMinMax.minY,
    axis?.yMax,
    axis?.yMin,
    effectiveYScale,
    plotYFactor,
  ]);

  const yTicks = useMemo(() => {
    const mode = String(yTicksMode ?? "nice");
    if (mode === "auto") {
      if (effectiveYScale !== "linear") {
        const min = Number(yDomain?.[0]);
        const max = Number(yDomain?.[1]);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        if (!(hi > 0)) return null;
        const safeLo = lo > 0 ? lo : hi / 1000;
        const expMin = Math.floor(Math.log10(safeLo));
        const expMax = Math.ceil(Math.log10(hi));
        const decades = Math.max(1, expMax - expMin);
        const decadeStep = Math.max(1, Math.ceil(decades / 6));
        return buildLogTicks(yDomain[0], yDomain[1], decadeStep);
      }
      return buildOriginAutoTicks(yDomain[0], yDomain[1], 6);
    }

    if (effectiveYScale !== "linear") {
      if (mode !== "decades") return null;
      return buildLogTicks(yDomain[0], yDomain[1], axis?.yDecadeStep);
    }

    if (mode === "step") {
      const stepRaw = parseOptionalNumber(axis?.yStep);
      const step = stepRaw !== null ? stepRaw / plotYFactor : null;
      return step ? buildStepTicks(yDomain[0], yDomain[1], step) : null;
    }
    const count = Math.max(2, Math.floor(Number(axis?.yTickCount) || 6));
    return buildNiceTicks(yDomain[0], yDomain[1], count, {
      preferTightRange: false,
    });
  }, [
    axis?.yDecadeStep,
    axis?.yStep,
    axis?.yTickCount,
    effectiveYScale,
    plotYFactor,
    yDomain,
    yTicksMode,
  ]);

  const yTickDigits = useMemo(() => {
    if (effectiveYScale !== "linear") return 4;
    const scaledTicks = Array.isArray(yTicks)
      ? yTicks.map((v) => v * plotYFactor)
      : null;
    return inferTickDigitsFromTicks(scaledTicks);
  }, [effectiveYScale, plotYFactor, yTicks]);

  const yLabelInterval = useMemo(
    () => (effectiveYScale === "linear" ? computeLabelInterval(yTicks, 7) : 0),
    [effectiveYScale, yTicks],
  );

  const isSsPlot = plotType === "ss";

  return (
    <ResponsiveContainer width="100%" height="100%" className="!outline-none">
      <LineChart
        data={[]}
        margin={{ top: 5, right: 15, left: 45, bottom: 28 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
        <XAxis
          dataKey="x"
          type="number"
          domain={xTicks ? [xTicks[0], xTicks[xTicks.length - 1]] : xDomain}
          ticks={xTicks ?? undefined}
          interval={xLabelInterval}
          label={
            activeFile?.xLabel
              ? {
                value: activeFile.xLabel,
                position: "insideBottom",
                offset: -15,
                fill: "currentColor",
                opacity: 0.9,
                fontSize: 16,
                fontWeight: 500,
              }
              : undefined
          }
          tickFormatter={(v) => formatNumber(v, { digits: xTickDigits })}
          stroke="currentColor"
          className="text-text-secondary text-xs"
          tick={{ fill: "currentColor", opacity: 0.6 }}
          allowDataOverflow
        />
        <YAxis
          label={
            activeFile?.yLabel
              ? {
                value: activeFile.yLabel,
                angle: -90,
                position: "insideLeft",
                offset: -15,
                style: { textAnchor: "middle" },
                fill: "currentColor",
                opacity: 0.9,
                fontSize: 16,
                fontWeight: 500,
              }
              : undefined
          }
          type="number"
          scale={effectiveYScale === "linear" ? "linear" : "log"}
          domain={yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : yDomain}
          ticks={yTicks ?? undefined}
          interval={yLabelInterval}
          tickFormatter={(v) => {
            const scaled = v * plotYFactor;
            if (effectiveYScale !== "linear") {
              if (!Number.isFinite(scaled) || scaled === 0) return "0";
              const exp = Math.floor(Math.log10(Math.abs(scaled)));
              return `1e${exp}`;
            }
            return formatNumber(scaled, { digits: yTickDigits });
          }}
          stroke="currentColor"
          className="text-text-secondary text-xs"
          tick={{ fill: "currentColor", opacity: 0.6 }}
          allowDataOverflow
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e1e1e",
            borderColor: "#333",
            color: "#fff",
          }}
          itemStyle={{ color: "#ccc" }}
          labelFormatter={(label) =>
            `x=${formatNumber(label, { digits: xTickDigits })}`
          }
          formatter={(value, name) => {
            const num =
              typeof value === "number"
                ? value
                : value === null || value === undefined
                  ? NaN
                  : Number(value);
            return [
              `${formatNumber(num * plotYFactor, { digits: yTickDigits })} ${plotYUnitLabel}`,
              name,
            ];
          }}
        />

        {isSsPlot && focusedSsOverlay ? (
          <>
            <ReferenceArea
              x1={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              x2={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              fill={ssOverlayStyle.fill}
              fillOpacity={ssOverlayStyle.fillOpacity}
              ifOverflow="hidden"
            />
            <ReferenceLine
              x={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              stroke={ssOverlayStyle.stroke}
              strokeOpacity={ssOverlayStyle.strokeOpacity}
              strokeWidth={2}
              ifOverflow="hidden"
            />
            <ReferenceLine
              x={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              stroke={ssOverlayStyle.stroke}
              strokeOpacity={ssOverlayStyle.strokeOpacity}
              strokeWidth={2}
              ifOverflow="hidden"
            />
          </>
        ) : null}

        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          width={120}
          wrapperStyle={{ right: 0, top: 0 }}
        />

        {isSsPlot && focusedFitLine ? (
          <Line
            data={focusedFitLine}
            dataKey="y"
            name="Fit"
            stroke={focusedSeriesColor}
            dot={false}
            isAnimationActive={false}
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeOpacity={0.7}
          />
        ) : null}

        {seriesList.map((series, idx) => (
          <Line
            key={series.id}
            data={series.data}
            dataKey={plotYKey}
            name={series.name}
            stroke={COLORS[idx % COLORS.length]}
            dot={false}
            isAnimationActive={false}
            strokeWidth={
              isSsPlot && focusedSeriesId && series.id === focusedSeriesId
                ? 2.5
                : 2
            }
            strokeOpacity={
              isSsPlot && focusedSeriesId && series.id !== focusedSeriesId
                ? 0.35
                : 1
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

MainPlotChart.displayName = "MainPlotChart";

const AnalysisCharts = ({
  processedData,
  processingStatus,
  ssMethod = "auto",
  setSsMethod = () => { },
  ssDiagnosticsEnabled = true,
  setSsDiagnosticsEnabled = () => { },
  ssShowFitLine = true,
  setSsShowFitLine = () => { },
  ssIdWindow = { low: "1e-11", high: "1e-9" },
  setSsIdWindow = () => { },
  ssManualRanges = {},
  setSsManualRanges = () => { },
}) => {
  const [activeFileId, setActiveFileId] = useState(
    processedData?.[0]?.fileId ?? null,
  );
  const [plotType, setPlotType] = useState("iv"); // 'iv' | 'gm' | 'ss' | 'j'
  const [focusedSeriesId, setFocusedSeriesId] = useState(null);
  const [yUnit, setYUnit] = useState("A"); // 'A' | 'uA' | 'nA'
  const userChangedYUnitRef = useRef(false);
  const [gmMode, setGmMode] = useState("x"); // 'x' | 'legend'
  const [areaInput, setAreaInput] = useState("");
  const [showAxisControls, setShowAxisControls] = useState(false);
  const [ssManualDraft, setSsManualDraft] = useState(null); // { fileId, seriesId, x1, x2 } | null
  const ssDragStateRef = useRef(null);
  const ssDragCommitTimerRef = useRef(0);
  const ssKeyStateRef = useRef({ shift: false, alt: false });
  const [axis, setAxis] = useState({
    xMin: "",
    xMax: "",
    xTicks: "auto", // 'auto' | 'nice' | 'step'
    xTickCount: 6,
    xStep: "",
    yMin: "",
    yMax: "",
    yScale: "linear", // 'linear' | 'log' | 'logAbs'
    yTicks: "nice", // 'auto' | 'nice' | 'step' | 'decades'
    yTickCount: 6,
    yStep: "",
    yDecadeStep: 1,
  });

  const [originBusy, setOriginBusy] = useState(false);

  const [toast, setToast] = useState({
    isVisible: false,
    message: "",
    type: "success",
  });
  const toastContainerRef = useRef(null);

  // Cache expensive per-file computations (points, gm, SS fits, metrics) so switching
  // files / modes doesn't re-run heavy math on every render.
  const fileAnalysisCacheRef = useRef(new Map());
  const cachePrefetchJobIdRef = useRef(0);
  const cachePrefetchHandleRef = useRef(null);

  useEffect(() => {
    const store = fileAnalysisCacheRef.current;
    if (!store || store.size === 0) return;

    const keep = new Set(
      (Array.isArray(processedData) ? processedData : [])
        .map((f) => f?.fileId)
        .filter(Boolean),
    );

    for (const fileId of Array.from(store.keys())) {
      if (!keep.has(fileId)) store.delete(fileId);
    }
  }, [processedData]);

  const getFileCache = React.useCallback((fileId) => {
    if (!fileId) return null;
    const store = fileAnalysisCacheRef.current;
    let entry = store.get(fileId);
    if (!entry) {
      entry = {
        pointsBySeriesId: new Map(),
        gmByMode: { x: new Map(), legend: new Map() },
        gmLegendComputed: false,
        ssDiagnosticsBySeriesId: new Map(),
        ssAutoBySeriesId: new Map(),
        baseMetricsBySeriesId: new Map(),
        gmMetricsByMode: { x: new Map(), legend: new Map() },
        ssManualFitBySeriesId: new Map(), // seriesId -> { key, result }
        ssIdWindowFitByKey: new Map(), // windowKey -> Map(seriesId -> result)
        jByAreaKey: new Map(), // areaKey -> Map(seriesId -> points[])
        minMaxByKey: new Map(), // key -> { minX, maxX, minY, maxY }
      };
      store.set(fileId, entry);
    }
    return entry;
  }, []);

  const showToast = React.useCallback((message, type = "info") => {
    setToast({ isVisible: true, message, type });
  }, []);

  const closeToast = React.useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settings = await apiService.getDeviceAnalysisSettings();
        const unit = settings?.yUnit;
        if (cancelled) return;
        if (userChangedYUnitRef.current) return;
        if (unit === "A" || unit === "uA" || unit === "nA") {
          setYUnit(unit);
        }
      } catch {
        // ignore settings load failures
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateKeys = (e) => {
      ssKeyStateRef.current = {
        shift: Boolean(e?.shiftKey),
        alt: Boolean(e?.altKey),
      };
    };

    const cancelActiveDrag = (e) => {
      const drag = ssDragStateRef.current;
      if (!drag?.active) return;
      e?.preventDefault?.();

      if (ssDragCommitTimerRef.current) {
        clearTimeout(ssDragCommitTimerRef.current);
        ssDragCommitTimerRef.current = 0;
      }

      ssDragStateRef.current = null;
      setSsManualDraft(null);

      const fileId = drag?.fileId ?? null;
      const seriesId = drag?.seriesId ?? null;
      const startRange = drag?.startRange ?? null;
      if (!fileId || !seriesId) return;

      const x1 = Number(startRange?.x1);
      const x2 = Number(startRange?.x2);
      if (Number.isFinite(x1) && Number.isFinite(x2)) {
        setSsManualRanges((prev) => {
          const prevFile = prev?.[fileId] ?? {};
          return {
            ...(prev || {}),
            [fileId]: {
              ...prevFile,
              [seriesId]: { x1, x2 },
            },
          };
        });
        return;
      }

      // No prior range: revert to "unset" (remove key) if a draft already committed.
      setSsManualRanges((prev) => {
        const prevFile = prev?.[fileId] ?? {};
        if (!Object.prototype.hasOwnProperty.call(prevFile, seriesId)) return prev;
        const { [seriesId]: _omit, ...restFile } = prevFile;
        const next = { ...(prev || {}) };
        if (Object.keys(restFile).length === 0) {
          const { [fileId]: _omitFile, ...rest } = next;
          return rest;
        }
        next[fileId] = restFile;
        return next;
      });
    };

    const onKeyDown = (e) => {
      updateKeys(e);
      if (e?.key === "Escape") cancelActiveDrag(e);
    };

    const onKeyUp = (e) => updateKeys(e);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setSsManualRanges]);

  const currentUnitMeta = useMemo(() => {
    const unit = String(yUnit || "A");
    if (unit === "uA") return { value: "uA", label: "µA", factor: 1e6 };
    if (unit === "nA") return { value: "nA", label: "nA", factor: 1e9 };
    return { value: "A", label: "A", factor: 1 };
  }, [yUnit]);

  const effectiveActiveFileId = useMemo(() => {
    if (!processedData?.length) return null;
    if (activeFileId && processedData.some((f) => f.fileId === activeFileId)) {
      return activeFileId;
    }
    return processedData[0].fileId;
  }, [activeFileId, processedData]);

  useEffect(() => {
    if (!processedData?.length) {
      if (activeFileId !== null) setActiveFileId(null);
      return;
    }

    if (activeFileId && processedData.some((f) => f.fileId === activeFileId)) {
      return;
    }

    const next = processedData[0]?.fileId ?? null;
    if (next !== activeFileId) setActiveFileId(next);
  }, [activeFileId, processedData]);

  const activeFile = useMemo(
    () =>
      processedData?.find((f) => f.fileId === effectiveActiveFileId) ?? null,
    [effectiveActiveFileId, processedData],
  );

  useEffect(() => {
    const store = fileAnalysisCacheRef.current;
    if (!processedData?.length) {
      store.clear();
      return;
    }

    const liveIds = new Set(
      processedData
        .map((f) => (typeof f?.fileId === "string" ? f.fileId : null))
        .filter(Boolean),
    );

    for (const key of Array.from(store.keys())) {
      if (!liveIds.has(key)) store.delete(key);
    }
  }, [processedData]);

  const focusedSeries = useMemo(() => {
    if (!activeFile?.series?.length || !focusedSeriesId) return null;
    return activeFile.series.find((s) => s.id === focusedSeriesId) ?? null;
  }, [activeFile, focusedSeriesId]);

  useEffect(() => {
    const list = activeFile?.series ?? [];
    if (!list.length) {
      if (focusedSeriesId !== null) setFocusedSeriesId(null);
      return;
    }
    if (focusedSeriesId && list.some((s) => s.id === focusedSeriesId)) return;
    setFocusedSeriesId(list[0].id);
  }, [activeFile?.fileId, activeFile?.series, focusedSeriesId]);

  const area = useMemo(() => {
    if (areaInput === null || areaInput === undefined) return null;
    const raw = String(areaInput).trim();
    if (!raw) return null;
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }, [areaInput]);

  const sanitizeFilename = (name, { max = 180 } = {}) => {
    const raw = String(name || "export")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "export";
    return raw.length > max ? raw.slice(0, max) : raw;
  };

  const triggerDownloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
  };

  const makePairsExpr = (xyPairCount) => {
    const pairs = [];
    const count = Math.max(1, Number(xyPairCount) || 1);
    for (let i = 0; i < count; i++) {
      pairs.push(`(${i * 2 + 1},${i * 2 + 2})`);
    }
    return `(${pairs.join(",")})`; // e.g. ((1,2),(3,4))
  };

  const buildOgsScript = (csvFileName, xyPairCount) => {
    const pairsExpr = makePairsExpr(xyPairCount);
    const safeCsv = String(csvFileName || "data.csv").replace(/"/g, "");

    return `[Main]
// Auto plot exported Device Analysis CSV in Origin
// Usage:
//   1) Put CSV and this OGS in the same folder, set Origin current folder to it, then run:
//        run.section("${safeCsv.replace(/\\.csv$/i, ".ogs")}", Main)
//   2) Or pass CSV full path as %1:
//        run.section("${safeCsv.replace(/\\.csv$/i, ".ogs")}", Main, "C:\\\\path\\\\${safeCsv}")

string csv$ = "%1";
if(csv$ == "")
{
    csv$ = "${safeCsv}";
}

// If CSV not found (exist returns -1), prompt user to select a CSV file.
if(exist(csv$) < 0)
{
    dlgfile group:=*.csv;
    csv$ = fname$;
}

newbook;
impCSV fname:=csv$;

// Plot XY XY pairs: (1,2) (3,4) ...
plotxy iy:=${pairsExpr} plot:=202;
type -b "Plotted %(csv$)";
`;
  };

  const buildOriginPackageForFocusedSeries = async () => {
    if (!activeFile?.fileId || !focusedSeries) {
      throw new Error("No curve selected");
    }

    const groupIndex = Number(focusedSeries?.groupIndex);
    const xArr = activeFile?.xGroups?.[groupIndex];
    const yArr = focusedSeries?.y;

    if (!xArr || !yArr) {
      throw new Error("Missing curve data");
    }

    const rowCount = Math.min(xArr.length ?? 0, yArr.length ?? 0);
    if (rowCount <= 0) {
      throw new Error("Empty curve data");
    }

    const headers = ["x1", "y1"];
    const rows = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      rows[i] = [xArr[i] ?? "", yArr[i] ?? ""];
    }

    const csvText = Papa.unparse({ fields: headers, data: rows });

    const base = sanitizeFilename(activeFile?.fileName ?? "device_analysis").replace(/\.csv$/i, "");
    const seriesName = sanitizeFilename(focusedSeries?.name ?? "curve").replace(/\.csv$/i, "");
    const csvName = `${base}__${seriesName}.csv`;
    const ogsName = `${base}__${seriesName}.ogs`;
    const zipName = `${base}__${seriesName}__origin.zip`;

    const readme = `Device Analysis -> Origin package (single curve)

Files:
- *.csv: exported data (x1,y1)
- *.ogs: Origin LabTalk script to import CSV and plot automatically

How to use (manual fallback):
1) Unzip this package to a folder.
2) Open Origin.
3) (Optional) Set Origin current folder to the unzip folder (Command Window: cd "path")
4) Run the script (Script Window):
   run.section("${ogsName}", Main)
   - If the CSV file is not found, Origin will prompt you to select it.
`;

    const zip = new JSZip();
    zip.file("README_ORIGIN.txt", readme);
    zip.file(csvName, "\uFEFF" + csvText);
    zip.file(ogsName, buildOgsScript(csvName, 1));
    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          version: "origin_package_v1",
          kind: "single_curve",
          fileId: activeFile.fileId,
          fileName: activeFile.fileName ?? null,
          seriesId: focusedSeries.id,
          seriesName: focusedSeries.name ?? null,
          groupIndex,
          yCol: Number.isFinite(Number(focusedSeries?.yCol)) ? Number(focusedSeries.yCol) : null,
          csvName,
          ogsName,
        },
        null,
        2,
      ),
    );

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return { zipBlob, zipName, csvName, ogsName };
  };

  const handleDownloadOriginPackage = async () => {
    if (originBusy) return;

    try {
      setOriginBusy(true);
      const pkg = await buildOriginPackageForFocusedSeries();
      triggerDownloadBlob(pkg.zipName, pkg.zipBlob);
      showToast("Origin ZIP downloaded. Open it in OriginBridge (Local ZIP mode).", "success");
    } catch (err) {
      const msg = err?.message ? String(err.message) : "Failed to build Origin package";
      showToast(msg, "error");
    } finally {
      setOriginBusy(false);
    }
  };

  const ssApplicable = useMemo(() => {
    const curveType = String(activeFile?.curveType || "").toLowerCase();
    if (curveType) return curveType.includes("vg") || curveType.includes("transfer");
    const label = String(activeFile?.xLabel || "").toLowerCase();
    return label.includes("vg");
  }, [activeFile?.curveType, activeFile?.xLabel]);

  const effectivePlotType = useMemo(() => {
    if (plotType === "j" && !area) return "iv";
    if (plotType === "ss" && !ssApplicable) return "iv";
    return plotType;
  }, [area, plotType, ssApplicable]);

  useEffect(() => {
    const shouldEnableDrag = effectivePlotType === "ss" && ssMethod === "manual";
    const activeFileIdNow = activeFile?.fileId ?? null;
    const focusedSeriesIdNow = focusedSeriesId ?? null;

    const drag = ssDragStateRef.current;
    const dragActive = Boolean(drag?.active);
    const dragIsForCurrent =
      drag &&
      drag.fileId === activeFileIdNow &&
      drag.seriesId === focusedSeriesIdNow;

    if (!shouldEnableDrag || (dragActive && !dragIsForCurrent)) {
      if (ssDragCommitTimerRef.current) {
        clearTimeout(ssDragCommitTimerRef.current);
        ssDragCommitTimerRef.current = 0;
      }
      ssDragStateRef.current = null;
      if (ssManualDraft) setSsManualDraft(null);
    }
  }, [activeFile?.fileId, effectivePlotType, focusedSeriesId, ssManualDraft, ssMethod]);

  const gmUi = useMemo(() => {
    const xToken = normalizeVarToken(activeFile?.curveType);
    const legendToken = normalizeVarToken(activeFile?.legend?.varToken);

    const xSymbol = varTokenToSymbol(xToken);
    const legendSymbol = varTokenToSymbol(legendToken);

    const xLabelRaw =
      typeof activeFile?.xLabel === "string" ? activeFile.xLabel.trim() : "";
    const legendLabelRaw =
      typeof activeFile?.legend?.prefix === "string"
        ? activeFile.legend.prefix.trim()
        : "";

    const xDisplay = xSymbol || xLabelRaw || "X";
    const legendDisplay = legendSymbol || legendLabelRaw || "Legend";

    const derivToken = gmMode === "legend" ? legendToken : xToken;
    const fixedToken = gmMode === "legend" ? xToken : legendToken;

    const kind =
      derivToken === "vg" ? "gm" : derivToken === "vd" ? "gds" : "derivative";

    const kindTitle =
      kind === "gm"
        ? "Transconductance"
        : kind === "gds"
          ? "Output Conductance"
          : "Derivative";

    const kindSymbol = kind === "gm" ? "gm" : kind === "gds" ? "gds" : null;

    const derivSymbol = varTokenToSymbol(derivToken);
    const fixedSymbol = varTokenToSymbol(fixedToken);

    const derivShortLabel = derivSymbol
      ? `dI/d${derivSymbol}`
      : gmMode === "legend"
        ? `dI/d${legendDisplay}`
        : `dI/d${xDisplay}`;

    const formula = (() => {
      if (derivSymbol && fixedSymbol) {
        const base = `∂I/∂${derivSymbol} |${fixedSymbol}`;
        return kindSymbol ? `${kindSymbol} = ${base}` : base;
      }
      if (derivSymbol) {
        const fixedFallback = gmMode === "legend" ? xDisplay : legendDisplay;
        const base = `∂I/∂${derivSymbol} |${fixedFallback}`;
        return kindSymbol ? `${kindSymbol} = ${base}` : base;
      }
      return gmMode === "legend"
        ? `dI/d${legendDisplay} @ fixed ${xDisplay}`
        : `dI/d${xDisplay} (per curve)`;
    })();

    const plotLabel = `${kindTitle} (${formula})`;
    const denomUnit = derivSymbol ? "V" : gmMode === "legend" ? "Legend" : "X";

    const modeOptions = [
      {
        value: "x",
        label: xSymbol
          ? `dI/d${xSymbol} (per curve)`
          : `dI/d${xDisplay} (per curve)`,
      },
      {
        value: "legend",
        label: legendSymbol
          ? `dI/d${legendSymbol} @ fixed ${xSymbol ?? xDisplay}`
          : `dI/d${legendDisplay} @ fixed ${xDisplay}`,
      },
    ];

    const metricSymbol = kindSymbol ?? derivShortLabel;
    const summaryLabel = kindSymbol
      ? `${kindSymbol} (${derivShortLabel})`
      : `deriv (${derivShortLabel})`;

    return {
      kind,
      kindTitle,
      kindSymbol,
      derivShortLabel,
      plotLabel,
      denomUnit,
      modeOptions,
      metricSymbol,
      summaryLabel,
      metricHeader: `max|${metricSymbol}|`,
      metricXHeader: `x@max|${metricSymbol}|`,
    };
  }, [activeFile, gmMode]);

  const plotYFactor = useMemo(() => currentUnitMeta.factor, [currentUnitMeta.factor]);

  const plotYUnitLabel = useMemo(() => {
    if (effectivePlotType === "gm")
      return `${currentUnitMeta.label}/${gmUi.denomUnit}`;
    if (effectivePlotType === "j") return `${currentUnitMeta.label}/Area`;
    // SS tab main plot is I-V in log(|I|), so keep current unit here.
    return currentUnitMeta.label;
  }, [currentUnitMeta.label, effectivePlotType, gmUi.denomUnit]);

  const pointsBySeriesId = useMemo(() => {
    if (!activeFile?.fileId || !activeFile?.series?.length) return new Map();
    const cache = getFileCache(activeFile.fileId);
    if (!cache) return new Map();

    const map = cache.pointsBySeriesId;
    for (const s of activeFile.series) {
      if (map.has(s.id)) continue;
      const xArr = activeFile?.xGroups?.[s.groupIndex];
      map.set(s.id, buildPoints(xArr, s.y));
    }
    return map;
  }, [activeFile, getFileCache]);

  const gmBySeriesId = useMemo(() => {
    if (!activeFile?.fileId || !activeFile?.series?.length) return new Map();
    const cache = getFileCache(activeFile.fileId);
    if (!cache) return new Map();

    if (gmMode === "x") {
      const map = cache.gmByMode.x;
      for (const series of activeFile.series) {
        if (map.has(series.id)) continue;
        const points = pointsBySeriesId.get(series.id) ?? [];
        map.set(series.id, computeCentralDerivative(points));
      }
      return map;
    }

    // gmMode === "legend"
    const map = cache.gmByMode.legend;
    if (cache.gmLegendComputed) return map;
    cache.gmLegendComputed = true;

    const legendMode = activeFile?.legend?.mode ?? null;
    if (legendMode !== "yCol" && legendMode !== "group") return map;

    const buckets = new Map();
    for (const series of activeFile.series) {
      const param = series?.legendValue;
      if (typeof param !== "number" || !Number.isFinite(param)) continue;

      const xArr = activeFile?.xGroups?.[series.groupIndex];
      const yArr = series?.y;
      if (!xArr || !yArr) continue;

      const bucketKey =
        legendMode === "yCol" ? `g:${series.groupIndex}` : `y:${series.yCol}`;
      const list = buckets.get(bucketKey) ?? [];
      list.push({ id: series.id, x: xArr, y: yArr, param });
      buckets.set(bucketKey, list);
    }

    for (const list of buckets.values()) {
      const derived = computeLegendDerivativeSeries(list);
      for (const [id, data] of derived.entries()) {
        map.set(id, data);
      }
    }

    return map;
  }, [activeFile, getFileCache, gmMode, pointsBySeriesId]);

  const gmLegendStatus = useMemo(() => {
    if (gmMode !== "legend") return { ok: true, message: "" };

    const legendMode = activeFile?.legend?.mode ?? null;
    if (legendMode !== "yCol" && legendMode !== "group") {
      return {
        ok: false,
        message:
          "Legend derivative needs numeric legend labels (configure Y Data Start/Count/Step).",
      };
    }

    const counts = new Map();
    for (const series of activeFile?.series ?? []) {
      const param = series?.legendValue;
      if (typeof param !== "number" || !Number.isFinite(param)) continue;
      const bucketKey =
        legendMode === "yCol" ? `g:${series.groupIndex}` : `y:${series.yCol}`;
      counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
    }
    const maxCurves = Math.max(0, ...Array.from(counts.values()));
    if (maxCurves < 2) {
      return {
        ok: false,
        message:
          "Legend derivative needs at least 2 curves with numeric legend values.",
      };
    }

    return { ok: true, message: "" };
  }, [activeFile, gmMode]);

  const analysisBySeriesId = useMemo(() => {
    if (!activeFile?.fileId || !activeFile?.series?.length) return new Map();

    const map = new Map();
    const cache = getFileCache(activeFile.fileId);
    const ssDiagnosticsCache = cache?.ssDiagnosticsBySeriesId ?? new Map();
    const ssAutoCache = cache?.ssAutoBySeriesId ?? new Map();
    const baseMetricsCache = cache?.baseMetricsBySeriesId ?? new Map();
    const gmModeKey = gmMode === "legend" ? "legend" : "x";
    const gmMetricsCache = cache?.gmMetricsByMode?.[gmModeKey] ?? new Map();
    const manualFitCache = cache?.ssManualFitBySeriesId ?? new Map();
    const manualBySeries =
      activeFile?.fileId && ssManualRanges?.[activeFile.fileId]
        ? ssManualRanges[activeFile.fileId]
        : {};

    const idLowRaw = Number(ssIdWindow?.low);
    const idHighRaw = Number(ssIdWindow?.high);
    const idWindowOk =
      Number.isFinite(idLowRaw) &&
      Number.isFinite(idHighRaw) &&
      idLowRaw > 0 &&
      idHighRaw > 0;
    const idLow = idWindowOk ? Math.min(idLowRaw, idHighRaw) : null;
    const idHigh = idWindowOk ? Math.max(idLowRaw, idHighRaw) : null;
    const idWindowRatio =
      idLow && idHigh && idLow > 0 ? idHigh / idLow : null;

    const idWindowKey =
      idWindowOk && idLow !== null && idHigh !== null
        ? `${normalizeFloat(idLow)}::${normalizeFloat(idHigh)}`
        : "invalid";

    const idWindowFitMap = (() => {
      if (!cache) return null;
      if (!idWindowOk) return null;
      let m = cache.ssIdWindowFitByKey.get(idWindowKey);
      if (!m) {
        m = new Map();
        cache.ssIdWindowFitByKey.set(idWindowKey, m);
      }
      return m;
    })();

    const areaKey =
      area && Number.isFinite(area) && area > 0
        ? String(normalizeFloat(area))
        : null;
    const jCacheBySeriesId = (() => {
      if (!cache) return null;
      if (!areaKey) return null;
      let m = cache.jByAreaKey.get(areaKey);
      if (!m) {
        m = new Map();
        cache.jByAreaKey.set(areaKey, m);
      }
      return m;
    })();

    for (const series of activeFile.series) {
      const points = pointsBySeriesId.get(series.id) ?? [];

      const gm = gmBySeriesId.get(series.id) ?? [];

      let ssDiagnostics = ssDiagnosticsCache.get(series.id) ?? null;
      if (!ssDiagnostics) {
        ssDiagnostics = computeSubthresholdSwing(points);
        if (cache) ssDiagnosticsCache.set(series.id, ssDiagnostics);
      }

      let ssAuto = ssAutoCache.get(series.id) ?? null;
      if (!ssAuto) {
        ssAuto = computeSubthresholdSwingFitAuto(points);
        if (cache) ssAutoCache.set(series.id, ssAuto);
      }

      const j = (() => {
        if (!jCacheBySeriesId) return null;
        const existing = jCacheBySeriesId.get(series.id) ?? null;
        if (existing) return existing;
        const arr = points.map((p) => ({
          x: p?.x ?? null,
          y:
            typeof p?.y === "number" && Number.isFinite(p.y)
              ? Math.abs(p.y) / area
              : null,
          yPositive:
            typeof p?.y === "number" && Number.isFinite(p.y) && p.y !== 0
              ? Math.abs(p.y) / area
              : null,
          yAbsPositive:
            typeof p?.y === "number" && Number.isFinite(p.y) && p.y !== 0
              ? Math.abs(p.y) / area
              : null,
        }));
        jCacheBySeriesId.set(series.id, arr);
        return arr;
      })();

      let base = baseMetricsCache.get(series.id) ?? null;
      if (!base) {
        // Scalar metrics (computed from |I| to support p/n-type)
        let ion = -Infinity;
        let xAtIon = null;
        let ioff = Infinity;
        let xAtIoff = null;

        for (const p of points) {
          const x = p?.x;
          const y = p?.y;
          if (typeof x !== "number" || !Number.isFinite(x)) continue;
          if (typeof y !== "number" || !Number.isFinite(y)) continue;

          const absI = Math.abs(y);
          if (absI > ion) {
            ion = absI;
            xAtIon = x;
          }
          if (absI > 0 && absI < ioff) {
            ioff = absI;
            xAtIoff = x;
          }
        }

        let legacySsMin = Infinity;
        let legacyXAtSsMin = null;
        for (const p of ssDiagnostics ?? []) {
          const x = p?.x;
          const y = p?.y;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (y > 0 && y < legacySsMin) {
            legacySsMin = y;
            legacyXAtSsMin = x;
          }
        }

        base = {
          ion: Number.isFinite(ion) ? ion : null,
          xAtIon,
          ioff: Number.isFinite(ioff) ? ioff : null,
          xAtIoff,
          legacySsMin: Number.isFinite(legacySsMin) ? legacySsMin : null,
          legacyXAtSsMin,
        };
        if (cache) baseMetricsCache.set(series.id, base);
      }

      const ionFinite = base.ion;
      const ioffFinite = base.ioff;
      const xAtIon = base.xAtIon ?? null;
      const xAtIoff = base.xAtIoff ?? null;
      const legacySsMinFinite = base.legacySsMin;
      const legacyXAtSsMin = base.legacyXAtSsMin ?? null;

      let gmMetric = gmMetricsCache.get(series.id) ?? null;
      if (!gmMetric) {
        let gmMaxAbs = -Infinity;
        let xAtGmMaxAbs = null;
        for (const p of gm) {
          const x = p?.x;
          const y = p?.y;
          if (typeof x !== "number" || !Number.isFinite(x)) continue;
          if (typeof y !== "number" || !Number.isFinite(y)) continue;
          const absGm = Math.abs(y);
          if (absGm > gmMaxAbs) {
            gmMaxAbs = absGm;
            xAtGmMaxAbs = x;
          }
        }

        gmMetric = {
          gmMaxAbs: Number.isFinite(gmMaxAbs) ? gmMaxAbs : null,
          xAtGmMaxAbs,
        };
        if (cache) gmMetricsCache.set(series.id, gmMetric);
      }

      const gmMaxAbsFinite = gmMetric.gmMaxAbs;
      const xAtGmMaxAbs = gmMetric.xAtGmMaxAbs ?? null;

      const strictFit = ssAuto?.strict ?? { ok: false, reason: "common.invalid_points" };
      const suggestedFit = ssAuto?.suggested ?? {
        ok: false,
        reason: "common.invalid_points",
      };

      const initRange = strictFit?.ok
        ? { x1: strictFit.x1, x2: strictFit.x2, source: "strict" }
        : suggestedFit?.ok
          ? { x1: suggestedFit.x1, x2: suggestedFit.x2, source: "suggested" }
          : null;

      const storedManual = manualBySeries?.[series.id] ?? null;

      const resolveSelectedFit = () => {
        if (ssMethod === "legacy") {
          return {
            method: "legacy",
            confidence: "low",
            fit: legacySsMinFinite !== null
              ? {
                ok: true,
                ss: legacySsMinFinite,
                x1: null,
                x2: null,
                r2: null,
                decadeSpan: null,
                n: null,
                reason: "ok",
              }
              : { ok: false, reason: "common.not_enough_points" },
            xAt: legacyXAtSsMin,
          };
        }

        if (ssMethod === "idWindow") {
          if (idWindowOk && idWindowFitMap) {
            const cached = idWindowFitMap.get(series.id);
            if (cached) return cached;
          }

          const fit = idWindowOk
            ? computeSubthresholdSwingFitInIdWindow(points, idLow, idHigh)
            : { ok: false, reason: "idw.invalid_input" };
          const cls = classifySsFit("idWindow", fit, { idWindowRatio });
          const result = {
            method: "idWindow",
            confidence: cls.ss_confidence,
            reason: cls.ss_reason,
            fit,
            xAt:
              fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
          };
          if (idWindowOk && idWindowFitMap) idWindowFitMap.set(series.id, result);
          return result;
        }

        if (ssMethod === "manual") {
          const range = storedManual ?? initRange;
          const lo = range ? Math.min(range.x1, range.x2) : null;
          const hi = range ? Math.max(range.x1, range.x2) : null;
          const rangeKey =
            range && Number.isFinite(lo) && Number.isFinite(hi)
              ? `${normalizeFloat(lo)}::${normalizeFloat(hi)}`
              : "none";

          let cached = manualFitCache.get(series.id) ?? null;
          let fit;
          let cls;
          if (cached && cached.key === rangeKey) {
            fit = cached.fit;
            cls = cached.cls;
          } else {
            fit = range
              ? computeSubthresholdSwingFitInRange(points, lo, hi)
              : { ok: false, reason: "manual.range_outside_domain" };
            cls = classifySsFit("manual", fit);
            if (cache) manualFitCache.set(series.id, { key: rangeKey, fit, cls });
          }
          return {
            method: "manual",
            confidence: cls.ss_confidence,
            reason: cls.ss_reason,
            fit,
            rangeSource: storedManual ? "manual" : range?.source ?? null,
            xAt:
              fit?.x1 != null && fit?.x2 != null ? (fit.x1 + fit.x2) * 0.5 : null,
          };
        }

        // Auto (strict) by default.
        const cls = classifySsFit("auto", strictFit);
        return {
          method: "auto",
          confidence: cls.ss_confidence,
          reason: cls.ss_reason,
          fit: strictFit,
          xAt:
            strictFit?.x1 != null && strictFit?.x2 != null
              ? (strictFit.x1 + strictFit.x2) * 0.5
              : null,
        };
      };

      const selected = resolveSelectedFit();
      const selectedFit = selected.fit;
      const selectedSs =
        selected?.confidence !== "fail" &&
          selectedFit?.ok &&
          Number.isFinite(selectedFit?.ss)
          ? selectedFit.ss
          : null;

      map.set(series.id, {
        gm,
        ssDiagnostics,
        ssAuto,
        ssSelected: selected,
        j,
        metrics: {
          ion: ionFinite,
          xAtIon,
          ioff: ioffFinite,
          xAtIoff,
          ionIoff:
            ionFinite !== null && ioffFinite !== null && ioffFinite !== 0
              ? ionFinite / ioffFinite
              : null,
          gmMaxAbs: gmMaxAbsFinite,
          xAtGmMaxAbs,
          ss: selectedSs,
          ssMethod: selected.method,
          ssConfidence: selected.confidence,
          ssReason: selected.reason ?? null,
          ssX1: Number.isFinite(selectedFit?.x1) ? selectedFit.x1 : null,
          ssX2: Number.isFinite(selectedFit?.x2) ? selectedFit.x2 : null,
          ssR2: Number.isFinite(selectedFit?.r2) ? selectedFit.r2 : null,
          ssSpanDec: Number.isFinite(selectedFit?.decadeSpan)
            ? selectedFit.decadeSpan
            : null,
          ssN: Number.isFinite(selectedFit?.n) ? selectedFit.n : null,
          xAtSs: selectedSs !== null ? selected.xAt : null,
          legacySsMin: legacySsMinFinite,
          legacyXAtSsMin,
          jon: area && ionFinite !== null ? ionFinite / area : null,
          joff: area && ioffFinite !== null ? ioffFinite / area : null,
        },
      });
    }

    return map;
  }, [
    activeFile,
    area,
    gmBySeriesId,
    gmMode,
    getFileCache,
    pointsBySeriesId,
    ssIdWindow?.high,
    ssIdWindow?.low,
    ssManualRanges,
    ssMethod,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    cachePrefetchJobIdRef.current += 1;
    const jobId = cachePrefetchJobIdRef.current;

    const cancelScheduled = () => {
      const handle = cachePrefetchHandleRef.current;
      if (!handle) return;
      if (
        handle.type === "idle" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(handle.id);
      } else if (handle.type === "timeout") {
        clearTimeout(handle.id);
      }
      cachePrefetchHandleRef.current = null;
    };

    cancelScheduled();

    if (!processedData?.length) return cancelScheduled;

    const candidates = processedData.filter(
      (f) =>
        typeof f?.fileId === "string" &&
        Array.isArray(f?.series) &&
        f.series.length > 0,
    );
    if (!candidates.length) return cancelScheduled;

    const queue = candidates.slice();
    if (effectiveActiveFileId) {
      const idx = queue.findIndex((f) => f.fileId === effectiveActiveFileId);
      if (idx > 0) {
        const [active] = queue.splice(idx, 1);
        queue.unshift(active);
      }
    }

    const precomputeFile = (file) => {
      const fileId = file?.fileId;
      if (!fileId) return;
      const cache = getFileCache(fileId);
      if (!cache) return;

      for (const s of file?.series ?? []) {
        if (!s?.id) continue;
        if (cache.pointsBySeriesId.has(s.id)) continue;
        const xArr = file?.xGroups?.[s.groupIndex];
        cache.pointsBySeriesId.set(s.id, buildPoints(xArr, s.y));
      }

      // Precompute gm(x) + SS auto + base metrics so switching plots feels instant.
      for (const s of file?.series ?? []) {
        if (!s?.id) continue;
        const points = cache.pointsBySeriesId.get(s.id) ?? [];

        if (!cache.gmByMode.x.has(s.id)) {
          cache.gmByMode.x.set(s.id, computeCentralDerivative(points));
        }

        if (!cache.ssDiagnosticsBySeriesId.has(s.id)) {
          cache.ssDiagnosticsBySeriesId.set(s.id, computeSubthresholdSwing(points));
        }

        if (!cache.ssAutoBySeriesId.has(s.id)) {
          cache.ssAutoBySeriesId.set(s.id, computeSubthresholdSwingFitAuto(points));
        }

        if (!cache.baseMetricsBySeriesId.has(s.id)) {
          let ion = -Infinity;
          let xAtIon = null;
          let ioff = Infinity;
          let xAtIoff = null;

          for (const p of points) {
            const x = p?.x;
            const y = p?.y;
            if (typeof x !== "number" || !Number.isFinite(x)) continue;
            if (typeof y !== "number" || !Number.isFinite(y)) continue;

            const absI = Math.abs(y);
            if (absI > ion) {
              ion = absI;
              xAtIon = x;
            }
            if (absI > 0 && absI < ioff) {
              ioff = absI;
              xAtIoff = x;
            }
          }

          const ssDiagnostics = cache.ssDiagnosticsBySeriesId.get(s.id) ?? [];
          let legacySsMin = Infinity;
          let legacyXAtSsMin = null;
          for (const p of ssDiagnostics) {
            const x = p?.x;
            const y = p?.y;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (y > 0 && y < legacySsMin) {
              legacySsMin = y;
              legacyXAtSsMin = x;
            }
          }

          cache.baseMetricsBySeriesId.set(s.id, {
            ion: Number.isFinite(ion) ? ion : null,
            xAtIon,
            ioff: Number.isFinite(ioff) ? ioff : null,
            xAtIoff,
            legacySsMin: Number.isFinite(legacySsMin) ? legacySsMin : null,
            legacyXAtSsMin,
          });
        }
      }
    };

    const run = () => {
      if (cachePrefetchJobIdRef.current !== jobId) return;

      // One file per slice keeps interactivity smooth even with many series/files.
      const next = queue.shift();
      if (next) precomputeFile(next);

      if (!queue.length) {
        cachePrefetchHandleRef.current = null;
        return;
      }

      schedule();
    };

    const schedule = () => {
      if (cachePrefetchJobIdRef.current !== jobId) return;
      if (!queue.length) return;

      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(run, { timeout: 300 });
        cachePrefetchHandleRef.current = { type: "idle", id };
        return;
      }

      const id = setTimeout(
        () => run({ didTimeout: true, timeRemaining: () => 0 }),
        0,
      );
      cachePrefetchHandleRef.current = { type: "timeout", id };
    };

    schedule();

    return cancelScheduled;
  }, [effectiveActiveFileId, getFileCache, processedData]);

  useEffect(() => {
    if (effectivePlotType !== "ss") return;
    if (ssMethod !== "manual") return;
    const fileId = activeFile?.fileId ?? null;
    if (!fileId || !focusedSeriesId) return;

    const existing = ssManualRanges?.[fileId]?.[focusedSeriesId] ?? null;
    if (existing && Number.isFinite(existing.x1) && Number.isFinite(existing.x2)) {
      return;
    }

    const analysis = analysisBySeriesId.get(focusedSeriesId);
    const strict = analysis?.ssAuto?.strict ?? null;
    const suggested = analysis?.ssAuto?.suggested ?? null;
    const init = strict?.ok
      ? { x1: strict.x1, x2: strict.x2 }
      : suggested?.ok
        ? { x1: suggested.x1, x2: suggested.x2 }
        : null;

    if (!init || !Number.isFinite(init.x1) || !Number.isFinite(init.x2)) return;

    setSsManualRanges((prev) => {
      const prevFile = prev?.[fileId] ?? {};
      if (prevFile?.[focusedSeriesId]) return prev;
      return {
        ...(prev || {}),
        [fileId]: {
          ...prevFile,
          [focusedSeriesId]: { x1: init.x1, x2: init.x2 },
        },
      };
    });
  }, [
    activeFile?.fileId,
    analysisBySeriesId,
    effectivePlotType,
    focusedSeriesId,
    setSsManualRanges,
    ssManualRanges,
    ssMethod,
  ]);

  const plotSeriesByType = useMemo(() => {
    if (!activeFile?.series?.length) {
      return { iv: [], gm: [], ss: [], j: [] };
    }

    const base = activeFile.series.map((series) => ({
      ...series,
      data: pointsBySeriesId.get(series.id) ?? [],
    }));

    return {
      iv: base,
      ss: base,
      gm: activeFile.series.map((series) => ({
        ...series,
        data: analysisBySeriesId.get(series.id)?.gm ?? [],
      })),
      j: activeFile.series.map((series) => ({
        ...series,
        data: analysisBySeriesId.get(series.id)?.j ?? [],
      })),
    };
  }, [activeFile, analysisBySeriesId, pointsBySeriesId]);

  const focusedAnalysis = useMemo(() => {
    if (!focusedSeriesId) return null;
    return analysisBySeriesId.get(focusedSeriesId) ?? null;
  }, [analysisBySeriesId, focusedSeriesId]);

  const focusedSsOverlay = useMemo(() => {
    if (!focusedSeriesId) return null;

    const analysis = focusedAnalysis;
    const ssAuto = analysis?.ssAuto ?? null;
    const strict = ssAuto?.strict ?? null;
    const suggested = ssAuto?.suggested ?? null;

    const fileId = activeFile?.fileId ?? null;
    const manualStored = fileId ? ssManualRanges?.[fileId]?.[focusedSeriesId] : null;

    if (ssMethod === "manual") {
      const fit = analysis?.ssSelected?.fit ?? null;
      const draft =
        ssManualDraft &&
          ssManualDraft.fileId === fileId &&
          ssManualDraft.seriesId === focusedSeriesId
          ? ssManualDraft
          : null;
      const x1 = Number.isFinite(draft?.x1)
        ? draft.x1
        : Number.isFinite(fit?.x1)
          ? fit.x1
          : Number(manualStored?.x1);
      const x2 = Number.isFinite(draft?.x2)
        ? draft.x2
        : Number.isFinite(fit?.x2)
          ? fit.x2
          : Number(manualStored?.x2);
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) return null;
      return { x1, x2, kind: "manual" };
    }

    if (ssMethod === "idWindow") {
      const fit = analysis?.ssSelected?.fit ?? null;
      const x1 = Number(fit?.x1);
      const x2 = Number(fit?.x2);
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) return null;
      return { x1, x2, kind: "idWindow" };
    }

    if (ssMethod === "legacy") return null;

    // Auto (strict), show suggested band if strict fails but suggestion exists.
    if (strict?.ok && Number.isFinite(strict?.x1) && Number.isFinite(strict?.x2)) {
      return { x1: strict.x1, x2: strict.x2, kind: "autoStrict" };
    }
    if (suggested?.ok && Number.isFinite(suggested?.x1) && Number.isFinite(suggested?.x2)) {
      return { x1: suggested.x1, x2: suggested.x2, kind: "autoSuggested" };
    }
    return null;
  }, [
    activeFile?.fileId,
    focusedAnalysis,
    focusedSeriesId,
    ssManualDraft,
    ssManualRanges,
    ssMethod,
  ]);

  const focusedFitLine = useMemo(() => {
    if (!ssShowFitLine) return null;
    if (!focusedSeriesId) return null;

    const selected = focusedAnalysis?.ssSelected ?? null;
    if (selected?.confidence === "fail") return null;

    const fit = selected?.fit ?? null;
    if (!fit?.ok) return null;
    if (!Number.isFinite(fit?.a) || !Number.isFinite(fit?.b)) return null;
    if (!Number.isFinite(fit?.x1) || !Number.isFinite(fit?.x2)) return null;

    const x1 = fit.x1;
    const x2 = fit.x2;
    const y1 = Math.pow(10, fit.a * x1 + fit.b);
    const y2 = Math.pow(10, fit.a * x2 + fit.b);
    if (!Number.isFinite(y1) || !Number.isFinite(y2) || y1 <= 0 || y2 <= 0) return null;

    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }, [
    focusedAnalysis?.ssSelected,
    focusedSeriesId,
    ssShowFitLine,
  ]);

  const ssOverlayStyle = useMemo(() => {
    const kind = focusedSsOverlay?.kind ?? "";
    if (kind === "autoStrict") {
      return { fill: "#22c55e", fillOpacity: 0.08, stroke: "#22c55e", strokeOpacity: 0.45 };
    }
    if (kind === "autoSuggested") {
      return { fill: "#f59e0b", fillOpacity: 0.08, stroke: "#f59e0b", strokeOpacity: 0.45 };
    }
    if (kind === "idWindow") {
      return { fill: "#a855f7", fillOpacity: 0.08, stroke: "#a855f7", strokeOpacity: 0.45 };
    }
    if (kind === "manual") {
      return { fill: "#60a5fa", fillOpacity: 0.08, stroke: "#60a5fa", strokeOpacity: 0.45 };
    }
    return { fill: "#60a5fa", fillOpacity: 0.08, stroke: "#60a5fa", strokeOpacity: 0.45 };
  }, [focusedSsOverlay?.kind]);

  const focusedSeriesColor = useMemo(() => {
    const idx = (plotSeriesByType?.iv ?? []).findIndex(
      (s) => s?.id === focusedSeriesId,
    );
    if (idx < 0) return COLORS[0];
    return COLORS[idx % COLORS.length];
  }, [focusedSeriesId, plotSeriesByType?.iv]);

  const ssSummary = useMemo(() => {
    if (effectivePlotType !== "ss") return null;
    if (!focusedSeriesId || !focusedAnalysis) return null;

    const selected = focusedAnalysis?.ssSelected ?? null;
    const fit = selected?.fit ?? null;
    const conf = String(selected?.confidence || "fail");
    const method = String(selected?.method || ssMethod || "auto");

    const strict = focusedAnalysis?.ssAuto?.strict ?? null;
    const suggested = focusedAnalysis?.ssAuto?.suggested ?? null;

    const ss =
      conf !== "fail" && fit?.ok && Number.isFinite(fit?.ss) ? fit.ss : null;
    const r2 = Number.isFinite(fit?.r2) ? fit.r2 : null;
    const span = Number.isFinite(fit?.decadeSpan) ? fit.decadeSpan : null;
    const n = Number.isFinite(fit?.n) ? fit.n : null;
    const x1 = Number.isFinite(fit?.x1) ? fit.x1 : null;
    const x2 = Number.isFinite(fit?.x2) ? fit.x2 : null;

    const suggestedRange =
      !strict?.ok && suggested?.ok && Number.isFinite(suggested?.x1) && Number.isFinite(suggested?.x2)
        ? { x1: suggested.x1, x2: suggested.x2 }
        : null;

    const reason =
      conf === "fail"
        ? String(selected?.reason || strict?.reason || fit?.reason || "common.invalid_points")
        : String(selected?.reason || fit?.reason || "ok");

    return {
      ss,
      r2,
      span,
      n,
      x1,
      x2,
      confidence: conf,
      method,
      reason,
      suggestedRange,
    };
  }, [effectivePlotType, focusedAnalysis, focusedSeriesId, ssMethod]);

  const yScaleMode = useMemo(() => {
    const mode = String(axis?.yScale ?? "linear");
    if (mode === "logAbs") return "logAbs";
    if (mode === "log") return "log";
    return "linear";
  }, [axis?.yScale]);

  const overviewYScaleType = useMemo(
    () => (yScaleMode === "linear" ? "linear" : "log"),
    [yScaleMode],
  );

  const plotYKey = useMemo(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") return "yPositive";
    return "y";
  }, [yScaleMode]);

  const displayPlotSeries = useMemo(() => {
    const byType = plotSeriesByType ?? { iv: [], gm: [], ss: [], j: [] };
    if (effectivePlotType === "gm") return byType.gm ?? [];
    if (effectivePlotType === "j") return byType.j ?? [];
    if (effectivePlotType === "ss") return byType.ss ?? byType.iv ?? [];
    return byType.iv ?? [];
  }, [effectivePlotType, plotSeriesByType]);

  const autoMinMax = useMemo(() => {
    const fileId = activeFile?.fileId ?? null;
    const cache = fileId ? getFileCache(fileId) : null;

    const areaKeyForMinMax =
      area && Number.isFinite(area) && area > 0 ? String(normalizeFloat(area)) : "";
    const minMaxKey = `${effectivePlotType}::${gmMode}::${plotYKey}::${areaKeyForMinMax}`;

    if (cache?.minMaxByKey?.has(minMaxKey)) {
      return cache.minMaxByKey.get(minMaxKey);
    }

    const computed = computeMinMax(displayPlotSeries, { yKey: plotYKey });
    if (cache?.minMaxByKey) cache.minMaxByKey.set(minMaxKey, computed);
    return computed;
  }, [
    activeFile?.fileId,
    area,
    displayPlotSeries,
    effectivePlotType,
    getFileCache,
    gmMode,
    plotYKey,
  ]);

  const autoMinY = autoMinMax?.minY ?? null;
  const autoMaxY = autoMinMax?.maxY ?? null;

  const effectiveYScale = useMemo(() => {
    if (yScaleMode === "linear") return "linear";
    if (autoMinY === null || autoMaxY === null) return "linear";
    if (autoMaxY <= 0) return "linear";
    return yScaleMode; // 'log' | 'logAbs'
  }, [autoMaxY, autoMinY, yScaleMode]);

  const yScaleWarning = useMemo(() => {
    if (yScaleMode === "linear") return "";
    if (effectiveYScale !== yScaleMode) {
      return "Log scale requires positive values (use Log(|y|) if your data crosses 0).";
    }
    return "";
  }, [effectiveYScale, yScaleMode]);

  const xDomain = useMemo(() => {
    const auto =
      autoMinMax.minX === null || autoMinMax.maxX === null
        ? [0, 1]
        : padLinearDomain(autoMinMax.minX, autoMinMax.maxX);

    const minUser = parseOptionalNumber(axis?.xMin);
    const maxUser = parseOptionalNumber(axis?.xMax);
    const min = minUser ?? auto[0];
    const max = maxUser ?? auto[1];
    return padLinearDomain(min, max);
  }, [autoMinMax.maxX, autoMinMax.minX, axis?.xMax, axis?.xMin]);

  const yDomain = useMemo(() => {
    const auto =
      autoMinMax.minY === null || autoMinMax.maxY === null
        ? effectiveYScale === "linear"
          ? [0, 1]
          : [1e-3, 1]
        : effectiveYScale === "linear"
          ? padLinearDomain(autoMinMax.minY, autoMinMax.maxY)
          : padLogDomain(autoMinMax.minY, autoMinMax.maxY);

    const minUserRaw = parseOptionalNumber(axis?.yMin);
    const maxUserRaw = parseOptionalNumber(axis?.yMax);
    const minUser = minUserRaw !== null ? minUserRaw / plotYFactor : null;
    const maxUser = maxUserRaw !== null ? maxUserRaw / plotYFactor : null;

    let min = minUser ?? auto[0];
    let max = maxUser ?? auto[1];

    if (effectiveYScale !== "linear") {
      if (min <= 0) min = auto[0];
      if (max <= 0) max = auto[1];
      if (min <= 0 || max <= 0) return auto;
      return padLogDomain(min, max);
    }

    return padLinearDomain(min, max);
  }, [
    autoMinMax.maxY,
    autoMinMax.minY,
    axis?.yMax,
    axis?.yMin,
    effectiveYScale,
    plotYFactor,
  ]);

  const focusedSsDiagnostics = useMemo(() => {
    if (effectivePlotType !== "ss") return null;
    if (!ssDiagnosticsEnabled) return null;
    const data = focusedAnalysis?.ssDiagnostics ?? null;
    return Array.isArray(data) ? data : null;
  }, [effectivePlotType, focusedAnalysis?.ssDiagnostics, ssDiagnosticsEnabled]);

  const ssDiagnosticsMinMax = useMemo(() => {
    if (!focusedSsDiagnostics) return { minX: null, maxX: null, minY: null, maxY: null };
    return computeMinMax([{ data: focusedSsDiagnostics }]);
  }, [focusedSsDiagnostics]);

  const ssDiagnosticsYDomain = useMemo(() => {
    const minY = ssDiagnosticsMinMax?.minY ?? null;
    const maxY = ssDiagnosticsMinMax?.maxY ?? null;
    if (minY === null || maxY === null) return [0, 1];
    return padLinearDomain(minY, maxY);
  }, [ssDiagnosticsMinMax?.maxY, ssDiagnosticsMinMax?.minY]);

  const ssDiagnosticsYTicks = useMemo(() => {
    return buildOriginAutoTicks(ssDiagnosticsYDomain[0], ssDiagnosticsYDomain[1], 6);
  }, [ssDiagnosticsYDomain]);

  const xTicks = useMemo(() => {
    const mode = String(axis?.xTicks ?? "auto");
    if (mode === "auto") {
      return buildOriginAutoTicks(xDomain[0], xDomain[1], 6);
    }
    if (mode === "step") {
      const step = parseOptionalNumber(axis?.xStep);
      return step ? buildStepTicks(xDomain[0], xDomain[1], step) : null;
    }
    const count = Math.max(2, Math.floor(Number(axis?.xTickCount) || 6));
    return buildNiceTicks(xDomain[0], xDomain[1], count, {
      preferTightRange: false,
    });
  }, [axis?.xStep, axis?.xTickCount, axis?.xTicks, xDomain]);

  const yTicks = useMemo(() => {
    const mode = String(axis?.yTicks ?? "nice");
    if (mode === "auto") {
      if (effectiveYScale !== "linear") {
        const min = Number(yDomain?.[0]);
        const max = Number(yDomain?.[1]);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        if (!(hi > 0)) return null;
        const safeLo = lo > 0 ? lo : hi / 1000;
        const expMin = Math.floor(Math.log10(safeLo));
        const expMax = Math.ceil(Math.log10(hi));
        const decades = Math.max(1, expMax - expMin);
        const decadeStep = Math.max(1, Math.ceil(decades / 6));
        return buildLogTicks(yDomain[0], yDomain[1], decadeStep);
      }
      return buildOriginAutoTicks(yDomain[0], yDomain[1], 6);
    }

    if (effectiveYScale !== "linear") {
      if (mode !== "decades") return null;
      return buildLogTicks(yDomain[0], yDomain[1], axis?.yDecadeStep);
    }

    if (mode === "step") {
      const stepRaw = parseOptionalNumber(axis?.yStep);
      const step = stepRaw !== null ? stepRaw / plotYFactor : null;
      return step ? buildStepTicks(yDomain[0], yDomain[1], step) : null;
    }
    const count = Math.max(2, Math.floor(Number(axis?.yTickCount) || 6));
    return buildNiceTicks(yDomain[0], yDomain[1], count, {
      preferTightRange: false,
    });
  }, [
    axis?.yDecadeStep,
    axis?.yStep,
    axis?.yTickCount,
    axis?.yTicks,
    effectiveYScale,
    plotYFactor,
    yDomain,
  ]);

  const xTickDigits = useMemo(() => inferTickDigitsFromTicks(xTicks), [xTicks]);
  const yTickDigits = useMemo(() => {
    if (effectiveYScale !== "linear") return 4;
    const scaledTicks = Array.isArray(yTicks)
      ? yTicks.map((v) => v * plotYFactor)
      : null;
    return inferTickDigitsFromTicks(scaledTicks);
  }, [effectiveYScale, plotYFactor, yTicks]);

  const xLabelInterval = useMemo(
    () => computeLabelInterval(xTicks, 7),
    [xTicks],
  );
  const yLabelInterval = useMemo(
    () => (effectiveYScale === "linear" ? computeLabelInterval(yTicks, 7) : 0),
    [effectiveYScale, yTicks],
  );

  const metricsRows = useMemo(() => {
    if (!activeFile?.series?.length) return [];
    return activeFile.series.map((series) => {
      const analysis = analysisBySeriesId.get(series.id);
      return {
        id: series.id,
        name: series.name,
        group: Number(series.groupIndex ?? 0) + 1,
        yCol: series.yCol,
        ...analysis?.metrics,
      };
    });
  }, [activeFile, analysisBySeriesId]);

  const snapXToSeries = React.useCallback(
    (x, seriesId, { disableSnap = false } = {}) => {
      const raw = Number(x);
      if (!Number.isFinite(raw)) return null;
      if (disableSnap) return raw;
      const pts = pointsBySeriesId.get(seriesId) ?? [];
      let best = null;
      let bestDist = Infinity;
      for (const p of pts) {
        const px = p?.x;
        if (!Number.isFinite(px)) continue;
        const d = Math.abs(px - raw);
        if (d < bestDist) {
          bestDist = d;
          best = px;
        }
      }
      return best !== null ? best : raw;
    },
    [pointsBySeriesId],
  );

  const commitManualRange = React.useCallback(
    (fileId, seriesId, range, { immediate = false } = {}) => {
      if (!fileId || !seriesId) return;
      if (!range) return;
      const x1 = Number(range?.x1);
      const x2 = Number(range?.x2);
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;

      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);

      const doCommit = () => {
        setSsManualRanges((prev) => {
          const prevFile = prev?.[fileId] ?? {};
          return {
            ...(prev || {}),
            [fileId]: {
              ...prevFile,
              [seriesId]: { x1: lo, x2: hi },
            },
          };
        });
      };

      if (ssDragCommitTimerRef.current) {
        clearTimeout(ssDragCommitTimerRef.current);
        ssDragCommitTimerRef.current = 0;
      }

      if (immediate) {
        doCommit();
        return;
      }

      ssDragCommitTimerRef.current = setTimeout(doCommit, 120);
    },
    [setSsManualRanges],
  );

  const handleSsMouseDown = React.useCallback(
    (e) => {
      if (ssMethod !== "manual") return;
      const fileId = activeFile?.fileId ?? null;
      const seriesId = focusedSeriesId ?? null;
      if (!fileId || !seriesId) return;

      const rawX = Number(e?.activeLabel);
      if (!Number.isFinite(rawX)) return;

      const disableSnap = Boolean(ssKeyStateRef.current?.alt);
      const x = snapXToSeries(rawX, seriesId, { disableSnap });
      if (!Number.isFinite(x)) return;

      const stored = ssManualRanges?.[fileId]?.[seriesId] ?? null;
      const draft =
        ssManualDraft &&
          ssManualDraft.fileId === fileId &&
          ssManualDraft.seriesId === seriesId
          ? ssManualDraft
          : null;

      const current = draft ?? stored;
      const hasCurrent =
        Number.isFinite(Number(current?.x1)) && Number.isFinite(Number(current?.x2));

      const shift = Boolean(ssKeyStateRef.current?.shift);
      let mode = "new"; // new | left | right | move
      let startRange = hasCurrent
        ? { x1: Number(current.x1), x2: Number(current.x2) }
        : null;

      if (!shift && startRange) {
        const x1 = startRange.x1;
        const x2 = startRange.x2;
        const lo = Math.min(x1, x2);
        const hi = Math.max(x1, x2);
        const span = Math.abs((xDomain?.[1] ?? 1) - (xDomain?.[0] ?? 0));
        const tol = Math.max(1e-12, span * 0.015);

        if (Math.abs(x - lo) <= tol) mode = "left";
        else if (Math.abs(x - hi) <= tol) mode = "right";
        else if (x >= lo && x <= hi) mode = "move";
      }

      const initial =
        mode === "new" || !startRange ? { x1: x, x2: x } : { ...startRange };

      ssDragStateRef.current = {
        active: true,
        mode,
        fileId,
        seriesId,
        startX: x,
        startRange,
        draftRange: initial,
      };

      setSsManualDraft({ fileId, seriesId, x1: initial.x1, x2: initial.x2 });
    },
    [
      activeFile?.fileId,
      focusedSeriesId,
      snapXToSeries,
      ssManualDraft,
      ssManualRanges,
      ssMethod,
      xDomain,
    ],
  );

  const handleSsMouseMove = React.useCallback(
    (e) => {
      const drag = ssDragStateRef.current;
      if (!drag?.active) return;
      if (drag.mode !== "new" && drag.mode !== "left" && drag.mode !== "right" && drag.mode !== "move") {
        return;
      }

      const rawX = Number(e?.activeLabel);
      if (!Number.isFinite(rawX)) return;
      const disableSnap = Boolean(ssKeyStateRef.current?.alt);
      const x = snapXToSeries(rawX, drag.seriesId, { disableSnap });
      if (!Number.isFinite(x)) return;

      let next = null;
      if (drag.mode === "new") {
        next = { x1: drag.startX, x2: x };
      } else if (drag.mode === "left") {
        next = { x1: x, x2: drag.startRange?.x2 ?? x };
      } else if (drag.mode === "right") {
        next = { x1: drag.startRange?.x1 ?? x, x2: x };
      } else if (drag.mode === "move") {
        const base = drag.startRange;
        if (!base) return;
        const dx = x - drag.startX;
        let x1 = base.x1 + dx;
        let x2 = base.x2 + dx;

        const domLo = Number(xDomain?.[0]);
        const domHi = Number(xDomain?.[1]);
        if (Number.isFinite(domLo) && Number.isFinite(domHi)) {
          const lo = Math.min(x1, x2);
          const hi = Math.max(x1, x2);
          if (lo < domLo) {
            const d = domLo - lo;
            x1 += d;
            x2 += d;
          }
          if (hi > domHi) {
            const d = domHi - hi;
            x1 += d;
            x2 += d;
          }
        }
        next = { x1, x2 };
      }

      if (!next) return;

      drag.draftRange = next;
      ssDragStateRef.current = drag;
      setSsManualDraft({
        fileId: drag.fileId,
        seriesId: drag.seriesId,
        x1: next.x1,
        x2: next.x2,
      });
      commitManualRange(drag.fileId, drag.seriesId, next, { immediate: false });
    },
    [commitManualRange, snapXToSeries, xDomain],
  );

  const handleSsMouseUp = React.useCallback(() => {
    const drag = ssDragStateRef.current;
    if (!drag?.active) return;

    const finalRange = drag.draftRange ?? drag.startRange;
    if (finalRange) {
      commitManualRange(drag.fileId, drag.seriesId, finalRange, { immediate: true });
    }

    ssDragStateRef.current = null;
    setSsManualDraft(null);
  }, [commitManualRange]);

  const handleSelectFile = React.useCallback(
    (fileId) => {
      if (!fileId) return;
      preserveScrollPosition(() =>
        startTransition(() => setActiveFileId(fileId)),
      );
    },
    [setActiveFileId],
  );

  const buildSsTooltip = React.useCallback((row) => {
    if (!row) return "";
    const parts = [];
    if (row.ssMethod) parts.push(`method=${row.ssMethod}`);
    if (row.ssConfidence) parts.push(`confidence=${row.ssConfidence}`);
    if (row.ssReason) parts.push(`reason=${row.ssReason}`);

    if (Number.isFinite(row.ssR2)) parts.push(`r2=${formatNumber(row.ssR2, { digits: 4 })}`);
    if (Number.isFinite(row.ssSpanDec)) parts.push(`spanDec=${formatNumber(row.ssSpanDec, { digits: 2 })}`);
    if (Number.isFinite(row.ssN)) parts.push(`n=${row.ssN}`);
    if (Number.isFinite(row.ssX1) && Number.isFinite(row.ssX2)) {
      parts.push(
        `range=[${formatNumber(row.ssX1, { digits: 4 })}, ${formatNumber(row.ssX2, { digits: 4 })}]`,
      );
    }

    if (Number.isFinite(row.legacySsMin)) {
      parts.push(`legacySSmin=${formatNumber(row.legacySsMin, { digits: 2 })}`);
      if (Number.isFinite(row.legacyXAtSsMin)) {
        parts.push(`x@legacy=${formatNumber(row.legacyXAtSsMin, { digits: 4 })}`);
      }
    }

    return parts.join(" | ");
  }, []);

  if (!processedData || processedData.length === 0) return null;

  return (
    <div className="space-y-4" ref={toastContainerRef}>
      <OverviewGrid
        processedData={processedData}
        processingStatus={processingStatus}
        activeFileId={effectiveActiveFileId}
        onSelectFile={handleSelectFile}
        yUnitFactor={currentUnitMeta.factor}
        yUnitLabel={currentUnitMeta.label}
        yScale={overviewYScaleType}
      />

      <section aria-label="Device Analysis chart">
        <div className="flex items-center justify-end gap-2 mb-2">
          <Button
            id="device-analysis-origin-download-zip-btn"
            variant="ghost"
            size="control"
            fx
            disabled={originBusy || !focusedSeries}
            onClick={handleDownloadOriginPackage}
            type="button"
          >
            Download Origin ZIP
          </Button>
        </div>
        <Card variant="panel">

          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div
                id="device-analysis-plot-type-toggle"
                className="tab_menu"
              >
                <button
                  id="device-analysis-plot-iv-btn"
                  type="button"
                  onClick={() => startTransition(() => setPlotType("iv"))}
                  className={`tab_btn tab_btn--control ${effectivePlotType === "iv"
                    ? "tab_btn--active"
                    : "tab_btn--inactive"
                    }`}
                >
                  I-V
                </button>
                <button
                  id="device-analysis-plot-gm-btn"
                  type="button"
                  onClick={() => startTransition(() => setPlotType("gm"))}
                  className={`tab_btn tab_btn--control ${effectivePlotType === "gm"
                    ? "tab_btn--active"
                    : "tab_btn--inactive"
                    }`}
                >
                  gm
                </button>
                <button
                  id="device-analysis-plot-ss-btn"
                  type="button"
                  onClick={() =>
                    ssApplicable && startTransition(() => setPlotType("ss"))
                  }
                  disabled={!ssApplicable}
                  className={`tab_btn tab_btn--control ${effectivePlotType === "ss"
                    ? "tab_btn--active"
                    : "tab_btn--inactive"
                    } ${!ssApplicable ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={
                    !ssApplicable
                      ? "SS is defined for transfer (Vg) curves. This file does not look like a Vg sweep."
                      : ""
                  }
                >
                  SS
                </button>
                <button
                  id="device-analysis-plot-j-btn"
                  type="button"
                  onClick={() => startTransition(() => setPlotType("j"))}
                  disabled={!area}
                  className={`tab_btn tab_btn--control ${effectivePlotType === "j"
                    ? "tab_btn--active"
                    : "tab_btn--inactive"
                    } ${!area ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={!area ? "Set a positive Area to enable J plot" : ""}
                >
                  J
                </button>
              </div>



              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-secondary whitespace-nowrap">
                    Y unit:
                  </span>
                  <Tabs
                    groupLabel="Y unit"
                    value={yUnit}
                    onChange={(next) => {
                      const nextUnit =
                        next === "A" || next === "uA" || next === "nA"
                          ? next
                          : "A";

                      userChangedYUnitRef.current = true;
                      setYUnit(nextUnit);
                      apiService
                        .updateDeviceAnalysisSettings({ yUnit: nextUnit })
                        .catch(() => { });
                    }}
                    options={[
                      {
                        value: "A",
                        label: "A",
                        cta: "Device Analysis",
                        ctaPosition: "y-unit",
                        ctaCopy: "A",
                      },
                      {
                        value: "uA",
                        label: "µA",
                        cta: "Device Analysis",
                        ctaPosition: "y-unit",
                        ctaCopy: "uA",
                      },
                      {
                        value: "nA",
                        label: "nA",
                        cta: "Device Analysis",
                        ctaPosition: "y-unit",
                        ctaCopy: "nA",
                      },
                    ]}
                    size="md"
                    itemClassName="px-2"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-secondary whitespace-nowrap">
                    Y scale:
                  </span>
                  {effectivePlotType === "ss" ? (
                    <span className="text-xs text-text-primary font-mono whitespace-nowrap">
                      log(|I|)
                    </span>
                  ) : (
                    <Tabs
                      groupLabel="Y scale"
                      options={[
                        {
                          value: "linear",
                          label: "Linear",
                          cta: "Device Analysis",
                          ctaPosition: "y-scale",
                          ctaCopy: "linear",
                        },
                        {
                          value: "log",
                          label: "Log",
                          cta: "Device Analysis",
                          ctaPosition: "y-scale",
                          ctaCopy: "log",
                        },
                      ]}
                      value={axis.yScale === "logAbs" ? "log" : axis.yScale}
                      onChange={(next) => {
                        setAxis((prev) => {
                          const nextScale = next === "log" ? "log" : "linear";
                          const nextTicks =
                            nextScale === "linear" ? "nice" : "decades";
                          return {
                            ...prev,
                            yScale: nextScale,
                            yTicks: nextTicks,
                          };
                        });
                      }}
                      size="md"
                      itemClassName="px-2 py-1"
                    />
                  )}
                </div>

                {activeFile?.series?.length ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-secondary whitespace-nowrap">
                      Curve:
                    </span>
                    <Select
                      id="device-analysis-curve-select"
                      size="md"
                      value={focusedSeriesId ?? ""}
                      onChange={(next) => setFocusedSeriesId(next)}
                      options={(activeFile?.series ?? []).map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                      className="w-[200px]"
                      placeholder="Select curve"
                    />
                  </div>
                ) : null}

                {effectivePlotType === "gm" ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-secondary whitespace-nowrap">
                      gm:
                    </span>
                    <Select
                      id="device-analysis-gm-mode-select"
                      size="md"
                      value={gmMode}
                      onChange={(next) =>
                        setGmMode(next === "legend" ? "legend" : "x")
                      }
                      options={gmUi.modeOptions}
                      className="w-[170px]"
                    />
                  </div>
                ) : null}

                {effectivePlotType === "ss" ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        SS:
                      </span>
                      <Select
                        id="device-analysis-ss-method-select"
                        size="md"
                        value={ssMethod}
                        onChange={(next) => {
                          const method =
                            next === "auto" ||
                              next === "manual" ||
                              next === "idWindow" ||
                              next === "legacy"
                              ? next
                              : "auto";
                          setSsMethod(method);
                          apiService
                            .updateDeviceAnalysisSettings({
                              ssMethodDefault: method,
                            })
                            .catch(() => { });
                        }}
                        options={[
                          { value: "auto", label: "Auto (strict)" },
                          { value: "manual", label: "Manual (drag)" },
                          { value: "idWindow", label: "|Id| window" },
                          { value: "legacy", label: "Legacy (min deriv)" },
                        ]}
                        className="w-[150px]"
                      />
                    </div>

                    <Button
                      variant="text"
                      size="sm"
                      onClick={() => {
                        setSsMethod("auto");
                        apiService
                          .updateDeviceAnalysisSettings({ ssMethodDefault: "auto" })
                          .catch(() => { });
                      }}
                      className="h-[38px] px-2 text-xs border border-border/50 hover:bg-bg-subtle"
                      title="Reset SS method to Auto (strict)"
                    >
                      Reset
                    </Button>

                    <Button
                      variant={ssShowFitLine ? "secondary" : "text"}
                      size="sm"
                      onClick={() => setSsShowFitLine((v) => !v)}
                      className="h-[38px] px-2 text-xs"
                      title="Toggle fit line overlay (focused curve only)"
                    >
                      Fit line
                    </Button>

                    <Button
                      variant={ssDiagnosticsEnabled ? "secondary" : "text"}
                      size="sm"
                      onClick={() => {
                        const next = !ssDiagnosticsEnabled;
                        setSsDiagnosticsEnabled(next);
                        apiService
                          .updateDeviceAnalysisSettings({
                            ssDiagnosticsEnabled: next,
                          })
                          .catch(() => { });
                      }}
                      className="h-[38px] px-2 text-xs"
                      title="Toggle SS(x) diagnostics plot"
                    >
                      Diagnostics
                    </Button>

                    {ssMethod === "idWindow" ? (
                      <div className="flex items-center gap-1 text-xs text-text-secondary">
                        <span className="whitespace-nowrap">|Id|:</span>
                        <input
                          id="device-analysis-ss-id-low"
                          value={ssIdWindow?.low ?? ""}
                          onChange={(e) =>
                            setSsIdWindow((prev) => ({
                              ...(prev || {}),
                              low: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            const low = Number(ssIdWindow?.low);
                            const high = Number(ssIdWindow?.high);
                            if (
                              Number.isFinite(low) &&
                              Number.isFinite(high) &&
                              low > 0 &&
                              high > 0
                            ) {
                              apiService
                                .updateDeviceAnalysisSettings({
                                  ssIdLow: low,
                                  ssIdHigh: high,
                                })
                                .catch(() => { });
                            }
                          }}
                          placeholder="low (A)"
                          className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[90px]"
                        />
                        <span>~</span>
                        <input
                          id="device-analysis-ss-id-high"
                          value={ssIdWindow?.high ?? ""}
                          onChange={(e) =>
                            setSsIdWindow((prev) => ({
                              ...(prev || {}),
                              high: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            const low = Number(ssIdWindow?.low);
                            const high = Number(ssIdWindow?.high);
                            if (
                              Number.isFinite(low) &&
                              Number.isFinite(high) &&
                              low > 0 &&
                              high > 0
                            ) {
                              apiService
                                .updateDeviceAnalysisSettings({
                                  ssIdLow: low,
                                  ssIdHigh: high,
                                })
                                .catch(() => { });
                            }
                          }}
                          placeholder="high (A)"
                          className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[90px]"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <Select
                  id="device-analysis-file-select"
                  size="md"
                  value={effectiveActiveFileId ?? ""}
                  onChange={(val) => handleSelectFile(val)}
                  options={processedData.map((f) => ({
                    value: f.fileId,
                    label: f.fileName,
                  }))}
                  className="w-[240px]"
                  placeholder="Select File"
                />
                <Button
                  id="device-analysis-axis-toggle-btn"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAxisControls((v) => !v)}
                  className="h-[38px] px-3 text-xs border-border bg-bg-page hover:bg-bg-surface-hover"
                  title="Axis settings"
                >
                  Axis
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="whitespace-nowrap">
                Area (for J = |I|/Area):
              </span>
              <input
                id="device-analysis-area-input"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                placeholder="e.g. 1e-4"
                className="bg-bg-page border border-border rounded-lg h-[38px] px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 w-[100px]"
              />
              <Button
                id="device-analysis-area-clear-btn"
                variant="text"
                size="sm"
                onClick={() => setAreaInput("")}
                className="h-[38px] px-2 text-xs border border-border/50 hover:bg-bg-subtle"
                title="Clear Area"
              >
                Clear
              </Button>
            </div>
          </div>

          {effectivePlotType === "ss" && ssSummary ? (
            <div className="bg-bg-page border border-border rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${ssSummary.confidence === "high"
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : ssSummary.confidence === "low"
                    ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                    : "bg-red-500/10 text-red-500 border-red-500/20"
                  }`}
                title={`method=${ssSummary.method} reason=${ssSummary.reason}`}
              >
                {String(ssSummary.confidence).toUpperCase()}
              </span>

              <span className="text-text-secondary">
                method: <span className="text-text-primary font-mono">{ssSummary.method}</span>
              </span>

              <span className="text-text-secondary">
                SS:{" "}
                <span className="text-text-primary font-mono">
                  {ssSummary.ss !== null ? `${formatNumber(ssSummary.ss, { digits: 2 })} mV/dec` : "—"}
                </span>
              </span>

              <span className="text-text-secondary">
                R²:{" "}
                <span className="text-text-primary font-mono">
                  {ssSummary.r2 !== null ? formatNumber(ssSummary.r2, { digits: 4 }) : "—"}
                </span>
              </span>

              <span className="text-text-secondary">
                span:{" "}
                <span className="text-text-primary font-mono">
                  {ssSummary.span !== null ? formatNumber(ssSummary.span, { digits: 2 }) : "—"} dec
                </span>
              </span>

              <span className="text-text-secondary">
                N:{" "}
                <span className="text-text-primary font-mono">
                  {ssSummary.n !== null ? String(ssSummary.n) : "—"}
                </span>
              </span>

              <span className="text-text-secondary">
                range:{" "}
                <span className="text-text-primary font-mono">
                  {ssSummary.x1 !== null && ssSummary.x2 !== null
                    ? `[${formatNumber(ssSummary.x1, { digits: 4 })}, ${formatNumber(ssSummary.x2, { digits: 4 })}]`
                    : "—"}
                </span>
              </span>

              {ssSummary.confidence === "fail" ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"
                  title={ssSummary.reason}
                >
                  reason: <span className="font-mono">{ssSummary.reason}</span>
                </span>
              ) : null}

              {ssSummary.suggestedRange ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                  suggested:{" "}
                  <span className="font-mono">
                    [{formatNumber(ssSummary.suggestedRange.x1, { digits: 4 })},{" "}
                    {formatNumber(ssSummary.suggestedRange.x2, { digits: 4 })}]
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}

          {showAxisControls && (
            <div className="bg-bg-page border border-border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-semibold text-text-primary">
                  Axis Settings
                </div>
                <Button
                  variant="text"
                  size="sm"
                  onClick={() =>
                    setAxis((prev) => ({
                      ...prev,
                      xMin: "",
                      xMax: "",
                      xTicks: "auto",
                      xTickCount: 6,
                      xStep: "",
                      yMin: "",
                      yMax: "",
                      yScale: "linear",
                      yTicks: "nice",
                      yTickCount: 6,
                      yStep: "",
                      yDecadeStep: 1,
                    }))
                  }
                  className="h-6 px-2 text-xs text-text-secondary hover:text-text-primary"
                >
                  Reset
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-text-secondary">
                    X Axis
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      id="device-analysis-axis-x-min"
                      value={axis.xMin}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, xMin: e.target.value }))
                      }
                      placeholder="min (auto)"
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                    />
                    <input
                      id="device-analysis-axis-x-max"
                      value={axis.xMax}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, xMax: e.target.value }))
                      }
                      placeholder="max (auto)"
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <select
                      value={axis.xTicks}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, xTicks: e.target.value }))
                      }
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                      title="Tick mode"
                    >
                      <option value="auto">ticks: auto</option>
                      <option value="nice">ticks: nice</option>
                      <option value="step">ticks: step</option>
                    </select>
                    <input
                      id="device-analysis-axis-x-tick-count"
                      value={axis.xTickCount}
                      onChange={(e) =>
                        setAxis((prev) => ({
                          ...prev,
                          xTickCount: e.target.value,
                        }))
                      }
                      disabled={axis.xTicks !== "nice"}
                      placeholder="count"
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50"
                      title="Nice tick count"
                    />
                    <input
                      id="device-analysis-axis-x-step"
                      value={axis.xStep}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, xStep: e.target.value }))
                      }
                      disabled={axis.xTicks !== "step"}
                      placeholder="step"
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50"
                      title="Step tick increment"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-text-secondary">
                    Y Axis
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      id="device-analysis-axis-y-min"
                      value={axis.yMin}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, yMin: e.target.value }))
                      }
                      placeholder={`min (auto) (${plotYUnitLabel})`}
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                    />
                    <input
                      id="device-analysis-axis-y-max"
                      value={axis.yMax}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, yMax: e.target.value }))
                      }
                      placeholder={`max (auto) (${plotYUnitLabel})`}
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <select
                      value={axis.yScale}
                      onChange={(e) =>
                        setAxis((prev) => {
                          const nextScale = e.target.value;
                          const nextTicks =
                            nextScale === "linear" ? "nice" : "decades";
                          return {
                            ...prev,
                            yScale: nextScale,
                            yTicks: nextTicks,
                          };
                        })
                      }
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                      title="Scale"
                    >
                      <option value="linear">scale: linear</option>
                      <option value="log">scale: log</option>
                      <option value="logAbs">scale: log(|y|)</option>
                    </select>
                    <select
                      value={axis.yTicks}
                      onChange={(e) =>
                        setAxis((prev) => ({ ...prev, yTicks: e.target.value }))
                      }
                      className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                      title="Tick mode"
                    >
                      <option value="auto">ticks: auto</option>
                      <option
                        value="nice"
                        disabled={effectiveYScale !== "linear"}
                      >
                        ticks: nice
                      </option>
                      <option
                        value="step"
                        disabled={effectiveYScale !== "linear"}
                      >
                        ticks: step
                      </option>
                      <option
                        value="decades"
                        disabled={effectiveYScale === "linear"}
                      >
                        ticks: decades
                      </option>
                    </select>
                    {effectiveYScale === "linear" ? (
                      axis.yTicks === "step" ? (
                        <input
                          id="device-analysis-axis-y-step"
                          value={axis.yStep}
                          onChange={(e) =>
                            setAxis((prev) => ({
                              ...prev,
                              yStep: e.target.value,
                            }))
                          }
                          placeholder={`step (${plotYUnitLabel})`}
                          className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40"
                          title="Major tick increment"
                        />
                      ) : (
                        <input
                          id="device-analysis-axis-y-tick-count"
                          value={axis.yTickCount}
                          onChange={(e) =>
                            setAxis((prev) => ({
                              ...prev,
                              yTickCount: e.target.value,
                            }))
                          }
                          disabled={axis.yTicks !== "nice"}
                          placeholder="count"
                          className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50"
                          title="Nice tick count"
                        />
                      )
                    ) : (
                      <input
                        id="device-analysis-axis-y-decade-step"
                        value={axis.yDecadeStep}
                        onChange={(e) =>
                          setAxis((prev) => ({
                            ...prev,
                            yDecadeStep: e.target.value,
                          }))
                        }
                        disabled={axis.yTicks !== "decades"}
                        placeholder="decade step"
                        className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-focus/40 disabled:opacity-50"
                        title="Major tick increment (decades)"
                      />
                    )}
                  </div>

                  {yScaleWarning ? (
                    <div className="text-[11px] text-yellow-500">
                      {yScaleWarning}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {activeFile?.series?.length ? (
            <div className="flex flex-col">


              {effectivePlotType === "gm" &&
                gmMode === "legend" &&
                !gmLegendStatus.ok ? (
                <div className="text-[11px] text-red-500 mb-2">
                  {gmLegendStatus.message}
                </div>
              ) : null}

              {effectivePlotType === "gm" ? (
                <div className="text-[11px] text-text-secondary mb-2">
                  Note: {gmUi.summaryLabel} is a numeric derivative on signed I (no
                  smoothing). Computed after downsampling (max 600 points). Legend
                  mode interpolates across curves; non-monotonic X or mismatched X
                  ranges yield gaps.
                </div>
              ) : null}

              <div className="h-[500px]">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  className="!outline-none"
                >
                  <LineChart
                    data={[]}
                    margin={{ top: 5, right: 15, left: 45, bottom: 28 }}
                    onMouseDown={handleSsMouseDown}
                    onMouseMove={handleSsMouseMove}
                    onMouseUp={handleSsMouseUp}
                    onMouseLeave={handleSsMouseUp}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#333"
                      opacity={0.2}
                    />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={
                        xTicks ? [xTicks[0], xTicks[xTicks.length - 1]] : xDomain
                      }
                      ticks={xTicks ?? undefined}
                      interval={xLabelInterval}
                      // ========== X轴标题 (底部标题) 位置设置 ==========
                      // position: 标题位置 (insideBottom=底部内侧)
                      // offset: 垂直偏移量 (负值向下移动)
                      // fontSize: 字体大小
                      label={
                        activeFile?.xLabel
                          ? {
                            value: activeFile.xLabel,
                            position: "insideBottom",
                            offset: -15,
                            fill: "currentColor",
                            opacity: 0.9,
                            fontSize: 16,
                            fontWeight: 500,
                          }
                          : undefined
                      }
                      tickFormatter={(v) =>
                        formatNumber(v, { digits: xTickDigits })
                      }
                      stroke="currentColor"
                      className="text-text-secondary text-xs"
                      tick={{ fill: "currentColor", opacity: 0.6 }}
                      allowDataOverflow
                    />
                    <YAxis
                      // ========== Y轴标题 (左侧标题) 位置设置 ==========
                      // position: 标题位置 (insideLeft=左侧内侧)
                      // offset: 水平偏移量 (负值向左移动)
                      // angle: 旋转角度 (-90=垂直)
                      // fontSize: 字体大小
                      label={
                        activeFile?.yLabel
                          ? {
                            value: activeFile.yLabel,
                            angle: -90,
                            position: "insideLeft",
                            offset: -15,
                            style: { textAnchor: "middle" },
                            fill: "currentColor",
                            opacity: 0.9,
                            fontSize: 16,
                            fontWeight: 500,
                          }
                          : undefined
                      }
                      type="number"
                      scale={effectiveYScale === "linear" ? "linear" : "log"}
                      domain={
                        yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : yDomain
                      }
                      ticks={yTicks ?? undefined}
                      interval={yLabelInterval}
                      tickFormatter={(v) => {
                        const scaled = v * plotYFactor;
                        if (effectiveYScale !== "linear") {
                          // Use scientific notation for log scale
                          if (!Number.isFinite(scaled) || scaled === 0) return "0";
                          const exp = Math.floor(Math.log10(Math.abs(scaled)));
                          return `1e${exp}`;
                        }
                        return formatNumber(scaled, { digits: yTickDigits });
                      }}
                      stroke="currentColor"
                      className="text-text-secondary text-xs"
                      tick={{ fill: "currentColor", opacity: 0.6 }}
                      allowDataOverflow
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e1e1e",
                        borderColor: "#333",
                        color: "#fff",
                      }}
                      itemStyle={{ color: "#ccc" }}
                      labelFormatter={(label) =>
                        `x=${formatNumber(label, { digits: xTickDigits })}`
                      }
                      formatter={(value, name) => {
                        const num =
                          typeof value === "number"
                            ? value
                            : value === null || value === undefined
                              ? NaN
                              : Number(value);
                        return [
                          `${formatNumber(num * plotYFactor, { digits: yTickDigits })} ${plotYUnitLabel}`,
                          name,
                        ];
                      }}
                    />
                    {/* ========== Legend 图例位置设置 ========== */}
                    {/* layout: horizontal=水平, vertical=垂直 */}
                    {/* verticalAlign: top/middle/bottom 垂直对齐 */}
                    {/* align: left/center/right 水平对齐 */}
                    {/* wrapperStyle.right: 距右边距离, wrapperStyle.top: 距顶部距离 */}
                    {effectivePlotType === "ss" && focusedSsOverlay ? (
                      <>
                        <ReferenceArea
                          x1={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                          x2={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                          fill={ssOverlayStyle.fill}
                          fillOpacity={ssOverlayStyle.fillOpacity}
                          ifOverflow="hidden"
                        />
                        <ReferenceLine
                          x={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                          stroke={ssOverlayStyle.stroke}
                          strokeOpacity={ssOverlayStyle.strokeOpacity}
                          strokeWidth={2}
                          ifOverflow="hidden"
                        />
                        <ReferenceLine
                          x={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                          stroke={ssOverlayStyle.stroke}
                          strokeOpacity={ssOverlayStyle.strokeOpacity}
                          strokeWidth={2}
                          ifOverflow="hidden"
                        />
                      </>
                    ) : null}

                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      width={120}
                      wrapperStyle={{ right: 0, top: 0 }}
                    />

                    {effectivePlotType === "ss" && focusedFitLine ? (
                      <Line
                        data={focusedFitLine}
                        dataKey="y"
                        name="Fit"
                        stroke={focusedSeriesColor}
                        dot={false}
                        isAnimationActive={false}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        strokeOpacity={0.7}
                      />
                    ) : null}

                    {displayPlotSeries.map((series, idx) => (
                      <Line
                        key={series.id}
                        data={series.data}
                        dataKey={plotYKey}
                        name={series.name}
                        stroke={COLORS[idx % COLORS.length]}
                        dot={false}
                        isAnimationActive={false}
                        strokeWidth={
                          effectivePlotType === "ss" &&
                            focusedSeriesId &&
                            series.id === focusedSeriesId
                            ? 2.5
                            : 2
                        }
                        strokeOpacity={
                          effectivePlotType === "ss" &&
                            focusedSeriesId &&
                            series.id !== focusedSeriesId
                            ? 0.35
                            : 1
                        }
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {effectivePlotType === "ss" && focusedSsDiagnostics ? (
                <div className="mt-4">
                  <div className="text-xs text-text-secondary mb-2">
                    Diagnostics: SS(x)
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%" className="!outline-none">
                      <LineChart data={[]} margin={{ top: 5, right: 135, left: 45, bottom: 20 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#333"
                          opacity={0.2}
                        />
                        <XAxis
                          dataKey="x"
                          type="number"
                          domain={
                            xTicks ? [xTicks[0], xTicks[xTicks.length - 1]] : xDomain
                          }
                          ticks={xTicks ?? undefined}
                          interval={xLabelInterval}
                          tickFormatter={(v) =>
                            formatNumber(v, { digits: xTickDigits })
                          }
                          stroke="currentColor"
                          className="text-text-secondary text-xs"
                          tick={{ fill: "currentColor", opacity: 0.6 }}
                          allowDataOverflow
                        />
                        <YAxis
                          label={{
                            value: "SS (mV/dec)",
                            angle: -90,
                            position: "insideLeft",
                            offset: -15,
                            style: { textAnchor: "middle" },
                            fill: "currentColor",
                            opacity: 0.9,
                            fontSize: 14,
                            fontWeight: 500,
                          }}
                          type="number"
                          scale="linear"
                          domain={ssDiagnosticsYDomain}
                          ticks={ssDiagnosticsYTicks ?? undefined}
                          interval={0}
                          tickFormatter={(v) => formatNumber(v, { digits: 2 })}
                          stroke="currentColor"
                          className="text-text-secondary text-xs"
                          tick={{ fill: "currentColor", opacity: 0.6 }}
                          allowDataOverflow
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e1e1e",
                            borderColor: "#333",
                            color: "#fff",
                          }}
                          itemStyle={{ color: "#ccc" }}
                          labelFormatter={(label) =>
                            `x=${formatNumber(label, { digits: xTickDigits })}`
                          }
                          formatter={(value, name) => [
                            `${formatNumber(Number(value), { digits: 2 })} mV/dec`,
                            name,
                          ]}
                        />

                        {focusedSsOverlay ? (
                          <>
                            <ReferenceLine
                              x={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                              stroke={ssOverlayStyle.stroke}
                              strokeOpacity={ssOverlayStyle.strokeOpacity}
                              strokeWidth={2}
                              ifOverflow="hidden"
                            />
                            <ReferenceLine
                              x={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                              stroke={ssOverlayStyle.stroke}
                              strokeOpacity={ssOverlayStyle.strokeOpacity}
                              strokeWidth={2}
                              ifOverflow="hidden"
                            />
                          </>
                        ) : null}

                        {ssSummary?.ss !== null && Number.isFinite(ssSummary?.ss) ? (
                          <ReferenceLine
                            y={ssSummary.ss}
                            stroke={focusedSeriesColor}
                            strokeOpacity={0.35}
                            strokeDasharray="4 4"
                            ifOverflow="hidden"
                          />
                        ) : null}

                        <Line
                          data={focusedSsDiagnostics}
                          dataKey="y"
                          name="SS(x)"
                          stroke={focusedSeriesColor}
                          dot={false}
                          isAnimationActive={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-text-secondary">
              No series data for this file.
            </div>
          )}
        </Card>
      </section>

      {
        activeFile?.series?.length ? (
          <Card variant="panel" className="overflow-x-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Calculated Parameters
              </h3>
              <div className="text-xs text-text-secondary whitespace-nowrap">
                {gmUi.summaryLabel}: max |{gmUi.metricSymbol}| · SS: fit (mV/dec) ·
                J uses |I|/Area
              </div>
            </div>

            <table className="min-w-[980px] w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 bg-bg-surface z-10">
                <tr className="border-b border-border">
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    Series
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    |I|on
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    x@Ion
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    |I|off
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    x@Ioff
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    Ion/Ioff
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    {gmUi.metricHeader}
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    {gmUi.metricXHeader}
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    SS
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    x@SS
                  </th>
                  <th className="p-2 text-xs font-semibold text-text-secondary">
                    Jon (if Area)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metricsRows.map((row) => (
                  <CalculatedParametersRow
                    key={row.id}
                    row={row}
                    buildSsTooltip={buildSsTooltip}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        ) : null
      }
      <Toast
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={closeToast}
        type={toast.type}
        containerRef={toastContainerRef}
        position="absolute"
      />
    </div>
  );
};

export default React.memo(AnalysisCharts);
