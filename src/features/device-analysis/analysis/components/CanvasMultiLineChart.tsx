import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "../lib/analysisMath";
import { padLinearDomain, padLogDomain } from "../lib/analysisChartsUtils";
import { COLORS } from "../lib/chartColors";

type Padding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ChartDomain = {
  x?: [number, number] | number[];
  y?: [number, number] | number[];
};

type ChartSeries = {
  name?: string;
  groupIndex?: number;
  y?: ArrayLike<unknown> | null;
  [key: string]: unknown;
};

type PreparedSeries = ChartSeries & {
  _color: string;
  _hoverColor: string;
};

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
  seriesName: string;
  xVal: number;
  yVal: number;
};

type ActiveHoverState = {
  active: true;
  series: PreparedSeries;
  cursorX: number;
  pointX: number;
  pointY: number;
};

type HoverState = { active: false } | ActiveHoverState;

export type CanvasMultiLineChartProps = {
  xGroups?: number[][];
  series?: ChartSeries[];
  domain?: ChartDomain | null;
  yScaleFactor?: number;
  yScaleType?: "linear" | "log";
  yUnitLabel?: string;
  padding?: Padding;
  title?: string;
  className?: string;
};

const DEFAULT_PADDING: Padding = { top: 20, right: 10, bottom: 10, left: 10 };

type ResolvedPreviewDomain = {
  x: [number, number];
  y: [number, number];
  effectiveYScaleType: "linear" | "log";
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeDomainTuple = (
  raw: ChartDomain[keyof ChartDomain] | null | undefined,
): [number, number] | null => {
  const start = Number(raw?.[0]);
  const end = Number(raw?.[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo === hi) return padLinearDomain(lo, hi);
  return [lo, hi];
};

export const resolvePreviewChartDomain = ({
  xGroups,
  series,
  domain,
  yScaleType,
}: Pick<CanvasMultiLineChartProps, "xGroups" | "series" | "domain" | "yScaleType">): ResolvedPreviewDomain => {
  const explicitXDomain = normalizeDomainTuple(domain?.x);
  const explicitYDomain = normalizeDomainTuple(domain?.y);

  let minX = Infinity;
  let maxX = -Infinity;
  for (const xArr of xGroups ?? []) {
    const pointCount = xArr?.length ?? 0;
    for (let i = 0; i < pointCount; i++) {
      const xVal = Number(xArr[i]);
      if (!Number.isFinite(xVal)) continue;
      if (xVal < minX) minX = xVal;
      if (xVal > maxX) maxX = xVal;
    }
  }

  let minY = Infinity;
  let maxY = -Infinity;
  let minPositiveY = Infinity;
  let maxPositiveY = -Infinity;
  for (const chartSeries of series ?? []) {
    const yArr = chartSeries?.y;
    if (!yArr) continue;
    const pointCount = yArr?.length ?? 0;
    for (let i = 0; i < pointCount; i++) {
      const yVal = Number(yArr[i]);
      if (!Number.isFinite(yVal)) continue;
      if (yVal < minY) minY = yVal;
      if (yVal > maxY) maxY = yVal;
      if (yVal > 0) {
        if (yVal < minPositiveY) minPositiveY = yVal;
        if (yVal > maxPositiveY) maxPositiveY = yVal;
      }
    }
  }

  const resolvedXDomain =
    explicitXDomain ??
    (Number.isFinite(minX) && Number.isFinite(maxX)
      ? padLinearDomain(minX, maxX)
      : [0, 1]);

  const wantsLogScale = String(yScaleType ?? "linear") === "log";
  if (
    wantsLogScale &&
    Number.isFinite(minPositiveY) &&
    Number.isFinite(maxPositiveY) &&
    maxPositiveY > 0
  ) {
    return {
      x: resolvedXDomain,
      y: padLogDomain(minPositiveY, maxPositiveY),
      effectiveYScaleType: "log",
    };
  }

  return {
    x: resolvedXDomain,
    y:
      explicitYDomain ??
      (Number.isFinite(minY) && Number.isFinite(maxY)
        ? padLinearDomain(minY, maxY)
        : [0, 1]),
    effectiveYScaleType: "linear",
  };
};

const setupCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null => {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
};

const binarySearchNearest = (arr: number[], value: number): number => {
  const n = arr.length;
  if (n === 0) return -1;
  if (n === 1) return 0;

  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = arr[mid];
    if (v === value) return mid;
    if (v < value) lo = mid + 1;
    else hi = mid - 1;
  }

  const i1 = clamp(lo, 0, n - 1);
  const i0 = clamp(lo - 1, 0, n - 1);
  const d0 = Math.abs(arr[i0] - value);
  const d1 = Math.abs(arr[i1] - value);
  return d0 <= d1 ? i0 : i1;
};

const clampAlpha = (alpha: unknown): number => {
  const a = Number(alpha);
  if (!Number.isFinite(a)) return 1;
  return Math.min(1, Math.max(0, a));
};

const hexToRgb = (hex: unknown): { r: number; g: number; b: number } | null => {
  const normalized = String(hex || "").trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(normalized);
  if (!m) return null;
  const int = Number.parseInt(m[1], 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const applyAlphaToHex = (hex: unknown, alpha: unknown): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return String(hex ?? "");
  const a = clampAlpha(alpha);
  if (a >= 1) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
};

const colorForSeriesIndex = (seriesIndex: unknown, alpha = 0.28): string => {
  const idx = Math.floor(Number(seriesIndex) || 0);
  const paletteSize = Array.isArray(COLORS) ? COLORS.length : 0;
  const paletteIdx = paletteSize ? ((idx % paletteSize) + paletteSize) % paletteSize : 0;
  const base = (paletteSize ? COLORS[paletteIdx] : null) ?? "#8884d8";
  return applyAlphaToHex(base, alpha);
};

const CanvasMultiLineChart = ({
  xGroups,
  series,
  domain,
  yScaleFactor = 1,
  yScaleType = "linear",
  yUnitLabel = "",
  padding = DEFAULT_PADDING,
  title,
  className,
}: CanvasMultiLineChartProps): React.JSX.Element => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef(0);
  const hoverRef = useRef<HoverState>({ active: false });

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    seriesName: "",
    xVal: 0,
    yVal: 0,
  });

  const prepared = useMemo(() => {
    const safeXGroups = Array.isArray(xGroups) ? xGroups : [];
    const safeSeries: ChartSeries[] = Array.isArray(series) ? series : [];

    const seriesWithColor: PreparedSeries[] = safeSeries.map((s, idx) => ({
      ...s,
      _color: colorForSeriesIndex(idx, 0.28),
      _hoverColor: colorForSeriesIndex(idx, 0.92),
    }));

    const seriesByGroup = new Map<number, PreparedSeries[]>();
    for (const s of seriesWithColor) {
      const gi = Number(s?.groupIndex ?? 0);
      if (!seriesByGroup.has(gi)) seriesByGroup.set(gi, []);
      const existing = seriesByGroup.get(gi);
      if (existing) existing.push(s);
    }

    return { xGroups: safeXGroups, series: seriesWithColor, seriesByGroup };
  }, [series, xGroups]);

  const resolvedDomain = useMemo(
    () => resolvePreviewChartDomain({ xGroups, series, domain, yScaleType }),
    [domain, series, xGroups, yScaleType],
  );

  useEffect(() => {
    if (!wrapperRef.current) return;

    const el = wrapperRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      const width = Math.floor(cr.width);
      const height = Math.floor(cr.height);
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const baseCanvas = baseCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!baseCanvas || !overlayCanvas) return;
    if (size.width <= 0 || size.height <= 0) return;

    baseCtxRef.current = setupCanvas(baseCanvas, size.width, size.height);
    overlayCtxRef.current = setupCanvas(overlayCanvas, size.width, size.height);
  }, [size.width, size.height]);

  const getScale = () => {
    const width = size.width;
    const height = size.height;
    const xMin = resolvedDomain.x[0];
    const xMax = resolvedDomain.x[1];
    let yMin = resolvedDomain.y[0];
    let yMax = resolvedDomain.y[1];
    const effectiveYScaleType = resolvedDomain.effectiveYScaleType;

    // For log scale, ensure strictly positive range
    if (effectiveYScaleType === "log") {
      if (yMin <= 0) yMin = 1e-12; // Fallback for typically small currents
      if (yMax <= yMin) yMax = yMin * 10;
    }

    const xSpan = xMax - xMin || 1;
    // For linear: span = max - min
    // For log: span = log10(max) - log10(min)
    const ySpan = effectiveYScaleType === "log"
      ? Math.log10(yMax) - Math.log10(yMin)
      : yMax - yMin;

    if (effectiveYScaleType === "log" && ySpan <= 0) {
      // Degenerate log span?
    }

    const innerW = Math.max(1, width - padding.left - padding.right);
    const innerH = Math.max(1, height - padding.top - padding.bottom);

    const xToPx = (x: number) => padding.left + ((x - xMin) / xSpan) * innerW;

    const yToPx = (y: number) => {
      if (effectiveYScaleType === "log") {
        if (y <= 0) return size.height - padding.bottom; // Clamp bottom
        const logY = Math.log10(y);
        const logMin = Math.log10(yMin);
        const ratio = (logY - logMin) / ySpan;
        return padding.top + (1 - ratio) * innerH;
      }
      return padding.top + (1 - (y - yMin) / ySpan) * innerH;
    };

    const pxToX = (px: number) => xMin + ((px - padding.left) / innerW) * xSpan;

    return {
      width,
      height,
      xMin,
      xMax,
      yMin,
      yMax,
      effectiveYScaleType,
      innerW,
      innerH,
      xToPx,
      yToPx,
      pxToX,
    };
  };

  const drawBase = () => {
    const ctx = baseCtxRef.current;
    if (!ctx) return;
    if (size.width <= 0 || size.height <= 0) return;

    ctx.clearRect(0, 0, size.width, size.height);

    // subtle grid
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 1; i < gridLines; i++) {
      const t = i / gridLines;
      const y = padding.top + t * (size.height - padding.top - padding.bottom);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(size.width - padding.right, y);
      ctx.stroke();
    }
    ctx.restore();

    const { xToPx, yToPx } = getScale();

    for (const s of prepared.series) {
      const gi = Number(s?.groupIndex ?? 0);
      const xArr = prepared.xGroups[gi];
      const yArr = s?.y;
      if (!xArr || !yArr) continue;
      const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
      if (n < 2) continue;

      ctx.beginPath();
      ctx.strokeStyle = s._color;
      ctx.lineWidth = 1;

      let started = false;
      for (let i = 0; i < n; i++) {
        const xVal = xArr[i];
        const yVal = yArr[i];
        if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) continue;
        const px = xToPx(Number(xVal));
        const py = yToPx(Number(yVal));
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      if (started) ctx.stroke();
    }
  };

  const clearOverlay = () => {
    const ctx = overlayCtxRef.current;
    if (!ctx) return;
    if (size.width <= 0 || size.height <= 0) return;
    ctx.clearRect(0, 0, size.width, size.height);
  };

  const drawOverlay = () => {
    const ctx = overlayCtxRef.current;
    if (!ctx) return;
    if (size.width <= 0 || size.height <= 0) return;
    ctx.clearRect(0, 0, size.width, size.height);

    const hover = hoverRef.current;
    if (!hover?.active) return;
    if (!hover?.series) return;

    const { xToPx, yToPx } = getScale();

    // Vertical cursor line
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hover.cursorX, padding.top);
    ctx.lineTo(hover.cursorX, size.height - padding.bottom);
    ctx.stroke();
    ctx.restore();

    const s = hover.series;
    const gi = Number(s?.groupIndex ?? 0);
    const xArr = prepared.xGroups[gi];
    const yArr = s?.y;
    if (!xArr || !yArr) return;

    const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
    if (n < 2) return;

    ctx.save();
    ctx.strokeStyle = s?._hoverColor ?? colorForSeriesIndex(0, 0.92);
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const xVal = xArr[i];
      const yVal = yArr[i];
      if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) continue;
      const px = xToPx(Number(xVal));
      const py = yToPx(Number(yVal));
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    if (started) ctx.stroke();
    ctx.restore();

    // Highlight point
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hover.pointX, hover.pointY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    drawBase();
    clearOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, resolvedDomain, size.width, size.height]);

  const scheduleOverlay = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawOverlay();
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    if (!prepared.series.length) return;
    if (!prepared.xGroups.length) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { pxToX, xToPx, yToPx } = getScale();
    const xValue = pxToX(mx);

    // Find the nearest group (by x distance)
    let bestGroup = null;
    let bestGroupIdx = -1;
    let bestGroupX = 0;
    let bestGroupDX = Infinity;

    for (let gi = 0; gi < prepared.xGroups.length; gi++) {
      const xArr = prepared.xGroups[gi];
      if (!xArr || xArr.length === 0) continue;
      const idx = binarySearchNearest(xArr, xValue);
      if (idx < 0) continue;
      const xv = xArr[idx];
      const dx = Math.abs(xv - xValue);
      if (dx < bestGroupDX) {
        bestGroupDX = dx;
        bestGroup = xArr;
        bestGroupIdx = gi;
        bestGroupX = xv;
      }
    }

    if (!bestGroup || bestGroupIdx < 0) return;

    const idx = binarySearchNearest(bestGroup, xValue);
    if (idx < 0) return;

    const candidates = prepared.seriesByGroup.get(bestGroupIdx) ?? [];
    if (!candidates.length) return;

    // Find nearest series by y pixel distance
    let bestSeries = null;
    let bestY = 0;
    let bestDy = Infinity;

    for (const s of candidates) {
      const yArr = s?.y;
      if (!yArr || idx >= yArr.length) continue;
      const yVal = yArr[idx];
      if (!Number.isFinite(yVal)) continue;
      const yValue = Number(yVal);
      const py = yToPx(yValue);
      const dy = Math.abs(py - my);
      if (dy < bestDy) {
        bestDy = dy;
        bestSeries = s;
        bestY = yValue;
      }
    }

    if (!bestSeries) return;

    const cursorX = xToPx(bestGroupX);
    const pointX = cursorX;
    const pointY = yToPx(bestY);

    hoverRef.current = {
      active: true,
      series: bestSeries,
      cursorX,
      pointX,
      pointY,
    };

    setTooltip({
      visible: true,
      x: clamp(mx, 0, size.width),
      y: clamp(my, 0, size.height),
      seriesName: bestSeries.name ?? "",
      xVal: bestGroupX,
      yVal: bestY,
    });

    scheduleOverlay();
  };

  const handleMouseLeave = () => {
    hoverRef.current = { active: false };
    setTooltip((prev) => ({ ...prev, visible: false }));
    clearOverlay();
  };

  const yFactor =
    Number.isFinite(yScaleFactor) && yScaleFactor > 0 ? yScaleFactor : 1;
  const ySuffix =
    typeof yUnitLabel === "string" && yUnitLabel ? ` ${yUnitLabel}` : "";

  return (
    <div
      ref={wrapperRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={baseCanvasRef}
        className="absolute inset-0"
        aria-label={title ? `${title} chart` : "chart"}
      />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0"
        aria-hidden="true"
      />

      {tooltip.visible && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: clamp(tooltip.x + 12, 8, Math.max(8, size.width - 220)),
            top: clamp(tooltip.y + 12, 8, Math.max(8, size.height - 90)),
          }}
        >
          <div className="bg-[#1e1e1e] border border-[#333] rounded-lg px-2 py-1.5 shadow-xl text-white">
            {title && (
              <div className="text-[11px] text-[#ccc] mb-1 truncate max-w-[200px]">
                {title}
              </div>
            )}
            <div className="text-xs text-white font-medium truncate max-w-[200px]">
              {tooltip.seriesName}
            </div>
            <div className="text-[11px] text-[#ccc] font-mono mt-1">
              x={formatNumber(tooltip.xVal)} &nbsp; y=
              {formatNumber(tooltip.yVal * yFactor)}
              {ySuffix}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CanvasMultiLineChart);
