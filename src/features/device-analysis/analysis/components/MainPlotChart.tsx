import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Customized,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
} from "recharts";
import { formatNumber } from "../lib/analysisMath";
import { COLORS } from "../lib/chartColors";
import {
  computeLabelInterval,
  inferTickDigitsFromTicks,
} from "../lib/analysisChartsUtils";

type PlotPoint = {
  x?: number;
  y?: number;
  yPositive?: number;
  yAbsPositive?: number;
  [key: string]: number | string | null | undefined;
};

type PlotSeries = {
  id: string;
  name: string;
  tooltipName?: string;
  data: PlotPoint[];
};

type SsOverlay = {
  x1: number;
  x2: number;
};

type SsOverlayStyle = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
};

type HighlightOverlay = {
  key: string;
  fill: string;
  fillOpacity: number;
  hideEndLine?: boolean;
  hideStartLine?: boolean;
  stroke: string;
  strokeDasharray?: string;
  strokeOpacity: number;
  strokeWidth?: number;
  x1: number;
  x2: number;
};

type CurrentBiasMarker = {
  key: string;
  label?: string;
  role?: "ion" | "ioff";
  stroke: string;
  strokeDasharray?: string;
  strokeOpacity: number;
  strokeWidth?: number;
  x: number;
};

type CurrentBiasInteractionConfig = {
  enabled: boolean;
  markers: CurrentBiasMarker[];
  onCommit?: (role: "ion" | "ioff", x: number) => void;
};

type SsInteractionConfig = {
  enabled: boolean;
  range: SsOverlay | null;
  onCommit?: (range: SsOverlay) => void;
};

type MainPlotChartProps = {
  plotType?: string;
  activeFile?: Partial<{
    xLabel: string;
    yLabel: string;
  }> | null;
  seriesList: PlotSeries[];
  xDomain: [number, number];
  xTicks?: number[] | null;
  plotXFactor: number;
  plotXUnitLabel: string;
  xTickDigits: number;
  xTooltipDigits?: number;
  xLabelInterval: number;
  effectiveYScale: "linear" | "log" | "logAbs";
  yDomain: [number, number];
  yTicks?: number[] | null;
  yScaleMode: "linear" | "log" | "logAbs";
  plotYFactor: number;
  plotYUnitLabel: string;
  focusedSeriesId?: string | null;
  focusedFitLine?: PlotPoint[] | null;
  focusedSeriesColor?: string;
  highlightOverlays?: HighlightOverlay[];
  currentBiasMarkers?: CurrentBiasMarker[];
  focusedSsOverlay?: SsOverlay | null;
  ssOverlayStyle: SsOverlayStyle;
  interactiveSeriesXs?: number[];
  currentBiasInteraction?: CurrentBiasInteractionConfig | null;
  ssInteraction?: SsInteractionConfig | null;
  legendWidth?: number;
  legendContent?: any;
};

const LOG_CHART_Y_DATA_KEY = "__chartY";
const TOOLTIP_SERIES_NAME_SEPARATOR = "\u0000";
const logChartSeriesListCache = new WeakMap<object, Map<string, PlotSeries[]>>();
const logChartSeriesDataCache = new WeakMap<object, Map<string, PlotPoint[]>>();

const decodeTooltipSeriesName = (
  value: unknown,
): { label: string; token: string } => {
  const token = String(value ?? "");
  const separatorIndex = token.lastIndexOf(TOOLTIP_SERIES_NAME_SEPARATOR);
  if (separatorIndex < 0) {
    return { label: token, token };
  }
  return {
    label: token.slice(0, separatorIndex),
    token,
  };
};

const toLogChartValue = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.log10(num);
};

const getCachedLogChartSeriesData = (
  data: PlotPoint[],
  plotYKey: "y" | "yPositive" | "yAbsPositive",
): PlotPoint[] => {
  const cacheKey = data as unknown as object;
  let cacheBucket = logChartSeriesDataCache.get(cacheKey);
  if (!cacheBucket) {
    cacheBucket = new Map<string, PlotPoint[]>();
    logChartSeriesDataCache.set(cacheKey, cacheBucket);
  }

  const cached = cacheBucket.get(plotYKey);
  if (cached) return cached;

  const computed = data.map((point) => ({
    ...point,
    [LOG_CHART_Y_DATA_KEY]: toLogChartValue(point?.[plotYKey]),
  }));
  cacheBucket.set(plotYKey, computed);
  return computed;
};

const getCachedLogChartSeriesList = (
  seriesList: PlotSeries[],
  plotYKey: "y" | "yPositive" | "yAbsPositive",
): PlotSeries[] => {
  const cacheKey = seriesList as unknown as object;
  let cacheBucket = logChartSeriesListCache.get(cacheKey);
  if (!cacheBucket) {
    cacheBucket = new Map<string, PlotSeries[]>();
    logChartSeriesListCache.set(cacheKey, cacheBucket);
  }

  const cached = cacheBucket.get(plotYKey);
  if (cached) return cached;

  // Cache per rendered series array so repeated plot switches reuse the converted points.
  const computed = seriesList.map((series) => ({
    ...series,
    data: Array.isArray(series?.data)
      ? getCachedLogChartSeriesData(series.data, plotYKey)
      : [],
  }));
  cacheBucket.set(plotYKey, computed);
  return computed;
};

const formatLogTickLabel = (value: unknown): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "0";
  const text = num.toExponential(2);
  return text.replace(/(?:\.0+|(\.\d*?[1-9])0+)e/, "$1e");
};

const withYAxisUnit = (
  labelRaw: string | null | undefined,
  unitRaw: string | null | undefined,
): string => {
  const label = String(labelRaw ?? "").trim();
  const unit = String(unitRaw ?? "").trim();
  if (!unit) return label;
  if (!label) return unit;
  if (/\([^()]+\)\s*$/.test(label)) {
    return label.replace(/\([^()]+\)\s*$/, `(${unit})`);
  }
  return `${label} (${unit})`;
};

const CHART_MARGIN = { top: 25, right: 15, left: 45, bottom: 28 } as const;
const CURRENT_BIAS_DRAG_TOLERANCE_PX = 22;
const CURRENT_BIAS_HIT_WIDTH_PX = 28;
const SS_HANDLE_TOLERANCE_PX = 14;
const SS_HANDLE_WIDTH_PX = 18;
const SS_MOVE_BAND_HEIGHT_PX = 24;

type PlotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChartPlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OverlayDraftState =
  | {
      kind: "currentBias";
      activeRole: "ion" | "ioff";
      markers: CurrentBiasMarker[];
    }
  | {
      kind: "ss";
      range: SsOverlay;
    };

type OverlayDragState =
  | {
      kind: "currentBias";
      pointerId: number;
      activeRole: "ion" | "ioff";
    }
  | {
      kind: "ss";
      pointerId: number;
      mode: "new" | "left" | "right" | "move";
      startX: number;
      startRange: SsOverlay | null;
    };

type OverlayHoverTarget =
  | {
      kind: "currentBias";
      role: "ion" | "ioff";
    }
  | {
      kind: "ss";
      mode: "left" | "right" | "move" | "new";
    };

type CurrentBiasHoverTarget = Extract<
  OverlayHoverTarget,
  { kind: "currentBias" }
>;
type SsHoverTarget = Extract<OverlayHoverTarget, { kind: "ss" }>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  Number.isFinite(Number(value));

const getSortedDomain = (domain: [number, number]): [number, number] => {
  const a = Number(domain?.[0] ?? 0);
  const b = Number(domain?.[1] ?? 0);
  return a <= b ? [a, b] : [b, a];
};

const findNearestSnapX = (
  rawX: number,
  snapXs: number[],
  disableSnap: boolean,
): number => {
  if (disableSnap || !snapXs.length) return rawX;

  let lo = 0;
  let hi = snapXs.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (snapXs[mid] < rawX) lo = mid + 1;
    else hi = mid;
  }

  const right = snapXs[lo];
  const left = lo > 0 ? snapXs[lo - 1] : right;
  return Math.abs(right - rawX) < Math.abs(rawX - left) ? right : left;
};

const normalizePlotArea = (
  plotArea: ChartPlotArea | null | undefined,
): PlotRect | null => {
  const left = Number(plotArea?.x);
  const top = Number(plotArea?.y);
  const width = Number(plotArea?.width);
  const height = Number(plotArea?.height);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left, top, width, height };
};

const samePlotRect = (a: PlotRect | null, b: PlotRect | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
};

const plotRectHasArea = (plotRect: PlotRect | null): plotRect is PlotRect =>
  Boolean(plotRect && plotRect.width > 0 && plotRect.height > 0);

const sameHoverTarget = (
  a: OverlayHoverTarget | null,
  b: OverlayHoverTarget | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "currentBias" && b.kind === "currentBias") {
    return a.role === b.role;
  }
  if (a.kind === "ss" && b.kind === "ss") {
    return a.mode === b.mode;
  }
  return false;
};

const ChartPlotAreaReporter = memo(function ChartPlotAreaReporter({
  onChange,
}: {
  onChange: (plotRect: PlotRect | null) => void;
}) {
  const plotArea = usePlotArea() as ChartPlotArea | undefined;
  const normalizedPlotRect = useMemo(
    () => normalizePlotArea(plotArea ?? null),
    [plotArea?.height, plotArea?.width, plotArea?.x, plotArea?.y],
  );

  useEffect(() => {
    onChange(normalizedPlotRect);
  }, [
    normalizedPlotRect?.height,
    normalizedPlotRect?.left,
    normalizedPlotRect?.top,
    normalizedPlotRect?.width,
    onChange,
  ]);

  return null;
});

const ChartInteractionOverlay = memo(function ChartInteractionOverlay({
  xDomain,
  plotArea,
  interactiveSeriesXs = [],
  currentBiasInteraction = null,
  ssInteraction = null,
  ssOverlayStyle,
}: {
  xDomain: [number, number];
  plotArea: PlotRect | null;
  interactiveSeriesXs?: number[];
  currentBiasInteraction?: CurrentBiasInteractionConfig | null;
  ssInteraction?: SsInteractionConfig | null;
  ssOverlayStyle: SsOverlayStyle;
}) {
  const dragStateRef = useRef<OverlayDragState | null>(null);
  const draftRef = useRef<OverlayDraftState | null>(null);
  const [draft, setDraft] = useState<OverlayDraftState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<OverlayHoverTarget | null>(null);

  const interactiveMode = currentBiasInteraction?.enabled
    ? "currentBias"
    : ssInteraction?.enabled
      ? "ss"
      : null;

  const sortedDomain = useMemo(() => getSortedDomain(xDomain), [xDomain]);
  const plotRect = plotArea;

  const normalizedSnapXs = useMemo(
    () =>
      interactiveSeriesXs
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)
        .filter((value, index, arr) => index === 0 || value !== arr[index - 1]),
    [interactiveSeriesXs],
  );

  useEffect(() => {
    dragStateRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setHoverTarget(null);
  }, [
    currentBiasInteraction?.enabled,
    currentBiasInteraction?.markers,
    ssInteraction?.enabled,
    ssInteraction?.range?.x1,
    ssInteraction?.range?.x2,
    interactiveMode,
  ]);

  const xToPixel = useCallback(
    (x: number): number => {
      const [domainMin, domainMax] = sortedDomain;
      if (!plotRectHasArea(plotRect) || !(domainMax > domainMin)) return 0;
      const plotWidth = plotRect.width;
      const ratio = (x - domainMin) / (domainMax - domainMin);
      return clamp(ratio, 0, 1) * plotWidth;
    },
    [plotRect, sortedDomain],
  );

  const currentBiasDisplayMarkers = useMemo(
    () =>
      draft?.kind === "currentBias"
        ? draft.markers
        : currentBiasInteraction?.markers ?? [],
    [currentBiasInteraction?.markers, draft],
  );

  const ssDisplayRange = useMemo(
    () => (draft?.kind === "ss" ? draft.range : ssInteraction?.range ?? null),
    [draft, ssInteraction?.range],
  );

  const resolveCurrentBiasHover = useCallback(
    (plotLocalX: number): CurrentBiasHoverTarget | null => {
      if (!plotRectHasArea(plotRect)) return null;
      let nearest: { role: "ion" | "ioff"; distance: number } | null = null;
      for (const marker of currentBiasDisplayMarkers) {
        if (!marker.role || !Number.isFinite(marker.x)) continue;
        const distance = Math.abs(xToPixel(marker.x) - plotLocalX);
        if (!nearest || distance < nearest.distance) {
          nearest = { role: marker.role, distance };
        }
      }
      if (!nearest || nearest.distance > CURRENT_BIAS_DRAG_TOLERANCE_PX) {
        return null;
      }
      return { kind: "currentBias", role: nearest.role };
    },
    [currentBiasDisplayMarkers, plotRect, xToPixel],
  );

  const resolveSsHover = useCallback(
    (plotLocalX: number, shiftKey: boolean): SsHoverTarget => {
      const baseRange = ssDisplayRange;
      const hasRange =
        !shiftKey &&
        isFiniteNumber(baseRange?.x1) &&
        isFiniteNumber(baseRange?.x2);
      if (!hasRange) return { kind: "ss", mode: "new" };

      const loPixel = xToPixel(
        Math.min(Number(baseRange?.x1), Number(baseRange?.x2)),
      );
      const hiPixel = xToPixel(
        Math.max(Number(baseRange?.x1), Number(baseRange?.x2)),
      );

      if (Math.abs(plotLocalX - loPixel) <= SS_HANDLE_TOLERANCE_PX) {
        return { kind: "ss", mode: "left" };
      }
      if (Math.abs(plotLocalX - hiPixel) <= SS_HANDLE_TOLERANCE_PX) {
        return { kind: "ss", mode: "right" };
      }
      if (plotLocalX >= loPixel && plotLocalX <= hiPixel) {
        return { kind: "ss", mode: "move" };
      }
      return { kind: "ss", mode: "new" };
    },
    [ssDisplayRange, xToPixel],
  );

  const deriveHoverTarget = useCallback(
    (plotLocalX: number, shiftKey: boolean): OverlayHoverTarget | null => {
      if (interactiveMode === "currentBias") {
        return resolveCurrentBiasHover(plotLocalX);
      }
      if (interactiveMode === "ss") {
        return resolveSsHover(plotLocalX, shiftKey);
      }
      return null;
    },
    [interactiveMode, resolveCurrentBiasHover, resolveSsHover],
  );

  const clientXToRawDomainX = useCallback(
    (clientX: number, element: HTMLDivElement | null): number | null => {
      if (!element || !plotRectHasArea(plotRect)) return null;
      const rect = element.getBoundingClientRect();
      const plotWidth = plotRect.width;
      const relativeX = clamp(
        clientX - rect.left,
        0,
        plotWidth,
      );
      const [domainMin, domainMax] = sortedDomain;
      if (!(domainMax > domainMin)) return null;
      return domainMin + (relativeX / plotWidth) * (domainMax - domainMin);
    },
    [plotRect, sortedDomain],
  );

  const commitAndReset = useCallback(() => {
    const drag = dragStateRef.current;
    const draftValue = draftRef.current;
    dragStateRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setHoverTarget(null);

    if (!drag || !draftValue) return;

    if (
      drag.kind === "currentBias" &&
      draftValue.kind === "currentBias" &&
      typeof currentBiasInteraction?.onCommit === "function"
    ) {
      const marker = draftValue.markers.find(
        (item) => item.role === drag.activeRole,
      );
      if (marker && Number.isFinite(marker.x)) {
        currentBiasInteraction.onCommit(drag.activeRole, marker.x);
      }
      return;
    }

    if (
      drag.kind === "ss" &&
      draftValue.kind === "ss" &&
      typeof ssInteraction?.onCommit === "function"
    ) {
      const x1 = Number(draftValue.range?.x1);
      const x2 = Number(draftValue.range?.x2);
      if (Number.isFinite(x1) && Number.isFinite(x2)) {
        ssInteraction.onCommit({ x1, x2 });
      }
    }
  }, [currentBiasInteraction, ssInteraction]);

  const cancelAndReset = useCallback(() => {
    dragStateRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setHoverTarget(null);
  }, []);

  useEffect(() => {
    if (!dragStateRef.current) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAndReset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelAndReset, draft !== null]);

  const handlePointerDown = useCallback(
    (event: any) => {
      if (!interactiveMode || !plotRectHasArea(plotRect)) return;

      if (interactiveMode === "currentBias") {
        const markers = currentBiasDisplayMarkers;
        if (!markers.length) return;
        const localX =
          event.clientX - event.currentTarget.getBoundingClientRect().left;
        const hover = resolveCurrentBiasHover(localX);
        if (!hover || hover.kind !== "currentBias") {
          return;
        }
        const nearest = markers.find((marker) => marker.role === hover.role);
        if (!nearest?.role) return;

        dragStateRef.current = {
          kind: "currentBias",
          pointerId: event.pointerId,
          activeRole: nearest.role,
        };
        const nextDraft = {
          kind: "currentBias",
          activeRole: nearest.role,
          markers,
        } satisfies OverlayDraftState;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        setHoverTarget({ kind: "currentBias", role: nearest.role });
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      const localPlotX =
        event.clientX - event.currentTarget.getBoundingClientRect().left;
      const baseRange = ssInteraction?.range ?? null;
      const rawX = clientXToRawDomainX(
        event.clientX,
        event.currentTarget as HTMLDivElement,
      );
      if (rawX === null) return;
      const snappedX = findNearestSnapX(rawX, normalizedSnapXs, event.altKey);
      if (!Number.isFinite(snappedX)) return;

      const hover = resolveSsHover(localPlotX, Boolean(event.shiftKey));
      const mode = hover.mode;
      const hasRange =
        mode !== "new" &&
        isFiniteNumber(baseRange?.x1) &&
        isFiniteNumber(baseRange?.x2);

      const initialRange =
        mode === "new" || !hasRange
          ? { x1: snappedX, x2: snappedX }
          : {
              x1: Number(baseRange?.x1),
              x2: Number(baseRange?.x2),
            };

      dragStateRef.current = {
        kind: "ss",
        pointerId: event.pointerId,
        mode,
        startX: snappedX,
        startRange: hasRange
          ? {
              x1: Number(baseRange?.x1),
              x2: Number(baseRange?.x2),
            }
          : null,
      };
      const nextDraft = {
        kind: "ss",
        range: initialRange,
      } satisfies OverlayDraftState;
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setHoverTarget(hover);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [
      clientXToRawDomainX,
      currentBiasDisplayMarkers,
      interactiveMode,
      normalizedSnapXs,
      plotRect,
      resolveCurrentBiasHover,
      resolveSsHover,
      ssInteraction?.range,
    ],
  );

  const handlePointerMove = useCallback(
    (event: any) => {
      const localPlotX =
        event.clientX - event.currentTarget.getBoundingClientRect().left;
      const drag = dragStateRef.current;
      if (!drag) {
        const nextHover = deriveHoverTarget(localPlotX, Boolean(event.shiftKey));
        setHoverTarget((prev) =>
          sameHoverTarget(prev, nextHover) ? prev : nextHover,
        );
        return;
      }

      const rawX = clientXToRawDomainX(
        event.clientX,
        event.currentTarget as HTMLDivElement,
      );
      if (rawX === null) return;
      const snappedX = findNearestSnapX(rawX, normalizedSnapXs, event.altKey);
      if (!Number.isFinite(snappedX)) return;

      if (drag.kind === "currentBias") {
        const markers =
          draft?.kind === "currentBias"
            ? draft.markers
            : currentBiasInteraction?.markers ?? [];
        const nextMarkers = markers.map((marker) =>
          marker.role === drag.activeRole ? { ...marker, x: snappedX } : marker,
        );
        const nextDraft = {
          kind: "currentBias",
          activeRole: drag.activeRole,
          markers: nextMarkers,
        } satisfies OverlayDraftState;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        event.preventDefault();
        return;
      }

      let nextRange: SsOverlay | null = null;
      if (drag.mode === "new") {
        nextRange = { x1: drag.startX, x2: snappedX };
      } else if (drag.mode === "left") {
        nextRange = {
          x1: snappedX,
          x2: Number(drag.startRange?.x2 ?? snappedX),
        };
      } else if (drag.mode === "right") {
        nextRange = {
          x1: Number(drag.startRange?.x1 ?? snappedX),
          x2: snappedX,
        };
      } else if (drag.mode === "move" && drag.startRange) {
        const dx = snappedX - drag.startX;
        let x1 = Number(drag.startRange.x1) + dx;
        let x2 = Number(drag.startRange.x2) + dx;
        const [domainMin, domainMax] = sortedDomain;
        const lo = Math.min(x1, x2);
        const hi = Math.max(x1, x2);
        if (lo < domainMin) {
          const delta = domainMin - lo;
          x1 += delta;
          x2 += delta;
        }
        if (hi > domainMax) {
          const delta = hi - domainMax;
          x1 -= delta;
          x2 -= delta;
        }
        nextRange = { x1, x2 };
      }

      if (nextRange) {
        const nextDraft = {
          kind: "ss",
          range: nextRange,
        } satisfies OverlayDraftState;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        event.preventDefault();
      }
    },
    [
      clientXToRawDomainX,
      currentBiasInteraction?.markers,
      deriveHoverTarget,
      draft,
      normalizedSnapXs,
      sortedDomain,
    ],
  );

  const handlePointerUp = useCallback(
    (event: any) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture-release errors when the browser already released it.
      }
      commitAndReset();
    },
    [commitAndReset],
  );

  const handlePointerCancel = useCallback(
    (event: any) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture-release errors when the browser already released it.
      }
      cancelAndReset();
    },
    [cancelAndReset],
  );

  const handlePointerLeave = useCallback(() => {
    if (dragStateRef.current) return;
    setHoverTarget(null);
  }, []);
  const isCurrentBiasDraftActive = draft?.kind === "currentBias";
  const isSsDraftActive = draft?.kind === "ss";

  const dragCursor = useMemo(() => {
    const drag = dragStateRef.current;
    if (!drag) return null;
    if (drag.kind === "currentBias") return "ew-resize";
    if (drag.mode === "move") return "grabbing";
    if (drag.mode === "new") return "crosshair";
    return "ew-resize";
  }, [draft]);

  const hoverCursor = useMemo(() => {
    if (!hoverTarget) {
      return interactiveMode === "currentBias" ? "default" : "crosshair";
    }
    if (hoverTarget.kind === "currentBias") return "ew-resize";
    if (hoverTarget.kind === "ss" && hoverTarget.mode === "move") return "grab";
    if (hoverTarget.kind === "ss" && hoverTarget.mode === "new") return "crosshair";
    return "ew-resize";
  }, [hoverTarget, interactiveMode]);

  const overlayPlotRect = plotRect;
  if (
    !interactiveMode ||
    !overlayPlotRect ||
    overlayPlotRect.width <= 0 ||
    overlayPlotRect.height <= 0
  ) {
    return null;
  }

  return (
    <div
      className="absolute"
      style={{
        left: overlayPlotRect.left,
        top: overlayPlotRect.top,
        width: overlayPlotRect.width,
        height: overlayPlotRect.height,
        zIndex: 4,
        touchAction: "none",
        cursor: dragCursor ?? hoverCursor,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
        {currentBiasDisplayMarkers.map((marker) => {
          const isActive =
            (draft?.kind === "currentBias" &&
              draft.activeRole === marker.role) ||
            (hoverTarget?.kind === "currentBias" &&
              hoverTarget.role === marker.role);
          return (
            <Fragment key={`preview-${marker.key}`}>
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: xToPixel(marker.x),
                  width: CURRENT_BIAS_HIT_WIDTH_PX,
                  transform: "translateX(-50%)",
                  backgroundColor: isActive ? `${marker.stroke}1A` : "transparent",
                  pointerEvents: "none",
                }}
              />
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: xToPixel(marker.x),
                  borderLeft: `${marker.strokeWidth ?? 2}px ${marker.strokeDasharray ? "dashed" : "solid"} ${marker.stroke}`,
                  display: isCurrentBiasDraftActive ? "block" : "none",
                  opacity: isActive ? 1 : marker.strokeOpacity,
                  pointerEvents: "none",
                  transform: "translateX(-50%)",
                }}
              />
              <div
                className="absolute top-2"
                style={{
                  left: xToPixel(marker.x),
                  transform: "translateX(-50%)",
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${marker.stroke}`,
                  backgroundColor: isActive ? marker.stroke : "rgba(255,255,255,0.92)",
                  color: isActive ? "#ffffff" : marker.stroke,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                  display: isActive ? "block" : "none",
                  pointerEvents: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {marker.label ?? (marker.role === "ion" ? "Ion" : "Ioff")}
              </div>
            </Fragment>
          );
        })}

        {ssDisplayRange ? (
          <>
            {isSsDraftActive ? (
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: Math.min(
                    xToPixel(ssDisplayRange.x1),
                    xToPixel(ssDisplayRange.x2),
                  ),
                  width: Math.abs(
                    xToPixel(ssDisplayRange.x2) - xToPixel(ssDisplayRange.x1),
                  ),
                  backgroundColor: ssOverlayStyle.fill,
                  opacity: ssOverlayStyle.fillOpacity,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {hoverTarget?.kind === "ss" && hoverTarget.mode === "move" ? (
              <div
                className="absolute"
                style={{
                  left: Math.min(
                    xToPixel(ssDisplayRange.x1),
                    xToPixel(ssDisplayRange.x2),
                  ),
                  top: 0,
                  width: Math.abs(
                    xToPixel(ssDisplayRange.x2) - xToPixel(ssDisplayRange.x1),
                  ),
                  height: SS_MOVE_BAND_HEIGHT_PX,
                  backgroundColor: "rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <div
              className="absolute top-2"
              style={{
                left:
                  (xToPixel(ssDisplayRange.x1) + xToPixel(ssDisplayRange.x2)) / 2,
                transform: "translateX(-50%)",
                padding: "2px 8px",
                borderRadius: 999,
                border: `1px solid ${ssOverlayStyle.stroke}`,
                backgroundColor:
                  hoverTarget?.kind === "ss" && hoverTarget.mode === "move"
                    ? ssOverlayStyle.stroke
                    : "rgba(255,255,255,0.92)",
                color:
                  hoverTarget?.kind === "ss" && hoverTarget.mode === "move"
                    ? "#ffffff"
                    : ssOverlayStyle.stroke,
                fontSize: 11,
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                display:
                  hoverTarget?.kind === "ss" && hoverTarget.mode === "move"
                    ? "block"
                    : "none",
                pointerEvents: "none",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              SS window
            </div>
            {[
              { x: ssDisplayRange.x1, mode: "left" as const },
              { x: ssDisplayRange.x2, mode: "right" as const },
            ].map(({ x, mode }, index) => {
              const isActive =
                hoverTarget?.kind === "ss" && hoverTarget.mode === mode;
              return (
                <Fragment key={`ss-preview-edge-${index}`}>
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: xToPixel(x),
                      borderLeft: `2px solid ${ssOverlayStyle.stroke}`,
                      display: isSsDraftActive ? "block" : "none",
                      opacity: ssOverlayStyle.strokeOpacity,
                      pointerEvents: "none",
                      transform: "translateX(-50%)",
                    }}
                  />
                  <div
                    className="absolute top-1"
                    style={{
                      left: xToPixel(x),
                      width: SS_HANDLE_WIDTH_PX,
                      height: 28,
                      transform: "translateX(-50%)",
                      borderRadius: 999,
                      border: `1px solid ${ssOverlayStyle.stroke}`,
                      backgroundColor: isActive
                        ? ssOverlayStyle.stroke
                        : "rgba(255,255,255,0.94)",
                      color: isActive ? "#ffffff" : ssOverlayStyle.stroke,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                      pointerEvents: "none",
                    }}
                  >
                    {mode === "left" ? "[" : "]"}
                  </div>
                </Fragment>
              );
            })}
          </>
        ) : interactiveMode === "ss" ? (
          <div
            className="absolute top-2 left-2"
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.9)",
              color: ssOverlayStyle.stroke,
              border: `1px solid ${ssOverlayStyle.stroke}`,
              fontSize: 11,
              fontWeight: 700,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            Drag to create SS window
          </div>
        ) : null}

        {hoverTarget?.kind === "ss" && hoverTarget.mode === "new" ? (
          <div
            className="absolute inset-0"
            style={{
              outline: "1px dashed rgba(15,23,42,0.14)",
              outlineOffset: -1,
              pointerEvents: "none",
            }}
          />
        ) : null}
    </div>
  );
});

const MainPlotChart = memo(function MainPlotChart({
  plotType,
  activeFile,
  seriesList,
  xDomain,
  xTicks,
  plotXFactor,
  plotXUnitLabel,
  xTickDigits,
  xTooltipDigits,
  xLabelInterval,
  effectiveYScale,
  yDomain,
  yTicks,
  yScaleMode,
  plotYFactor,
  plotYUnitLabel,
  focusedSeriesId,
  focusedFitLine,
  focusedSeriesColor = "#8884d8",
  highlightOverlays = [],
  currentBiasMarkers = [],
  focusedSsOverlay,
  ssOverlayStyle,
  interactiveSeriesXs = [],
  currentBiasInteraction = null,
  ssInteraction = null,
  legendWidth = 120,
  legendContent = undefined,
}: MainPlotChartProps) {
  const [chartPlotArea, setChartPlotArea] = useState<PlotRect | null>(null);
  const plotYKey = useMemo<"y" | "yPositive" | "yAbsPositive">(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") return "yPositive";
    return "y";
  }, [yScaleMode]);

  const chartYDataKey = useMemo(
    () => (effectiveYScale === "linear" ? plotYKey : LOG_CHART_Y_DATA_KEY),
    [effectiveYScale, plotYKey],
  );

  const chartSeriesList = useMemo<PlotSeries[]>(() => {
    if (effectiveYScale === "linear") return seriesList;
    return getCachedLogChartSeriesList(seriesList, plotYKey);
  }, [effectiveYScale, plotYKey, seriesList]);

  const tooltipSeriesOrder = useMemo(() => {
    const order = new Map<string, number>();
    chartSeriesList.forEach((series, index) => {
      order.set(String(series?.tooltipName ?? series?.name ?? ""), index);
    });
    return order;
  }, [chartSeriesList]);

  const chartFocusedFitLine = useMemo<PlotPoint[] | null>(() => {
    if (!Array.isArray(focusedFitLine)) return null;
    if (effectiveYScale === "linear") return focusedFitLine;
    return focusedFitLine.map((point) => ({
      ...point,
      [LOG_CHART_Y_DATA_KEY]: toLogChartValue(point?.y),
    }));
  }, [effectiveYScale, focusedFitLine]);

  const chartYTicks = useMemo<number[] | null>(() => {
    if (effectiveYScale === "linear") return Array.isArray(yTicks) ? yTicks : null;
    if (!Array.isArray(yTicks)) return null;
    const nextTicks = yTicks
      .map((tick) => toLogChartValue(tick))
      .filter((tick): tick is number => tick !== null);
    return nextTicks.length >= 2 ? nextTicks : null;
  }, [effectiveYScale, yTicks]);

  const chartYDomain = useMemo<[number, number]>(() => {
    if (effectiveYScale === "linear") {
      return yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : yDomain;
    }

    if (Array.isArray(chartYTicks) && chartYTicks.length >= 2) {
      return [chartYTicks[0], chartYTicks[chartYTicks.length - 1]];
    }

    const lo = Math.min(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const hi = Math.max(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const logLo = toLogChartValue(lo);
    const logHi = toLogChartValue(hi);
    if (logLo === null || logHi === null) return [0, 1];
    return [logLo, logHi];
  }, [chartYTicks, effectiveYScale, yDomain, yTicks]);

  const yTickDigits = useMemo(() => {
    if (effectiveYScale !== "linear") return 4;
    const scaledTicks = Array.isArray(chartYTicks)
      ? chartYTicks.map((v) => v * plotYFactor)
      : null;
    return inferTickDigitsFromTicks(scaledTicks);
  }, [chartYTicks, effectiveYScale, plotYFactor]);

  const yAxisNearZeroEpsilon = useMemo(() => {
    if (effectiveYScale !== "linear") return 0;
    const scaledTickStep =
      Array.isArray(yTicks) && yTicks.length >= 2
        ? Math.abs((Number(yTicks[1]) - Number(yTicks[0])) * plotYFactor)
        : 0;
    if (!Number.isFinite(scaledTickStep) || scaledTickStep <= 0) return 1e-18;
    // Keep only tiny floating-point residue around axis zero; do not alter meaningful small ticks.
    return Math.max(1e-18, scaledTickStep * 1e-9);
  }, [effectiveYScale, plotYFactor, yTicks]);

  const yLabelInterval = useMemo(
    () =>
      effectiveYScale === "linear"
        ? computeLabelInterval(yTicks, 7)
        : computeLabelInterval(chartYTicks, 7),
    [chartYTicks, effectiveYScale, yTicks],
  );

  const isSsPlot = plotType === "ss";

  const yAxisLabel = useMemo(
    () => withYAxisUnit(activeFile?.yLabel, plotYUnitLabel),
    [activeFile?.yLabel, plotYUnitLabel],
  );
  const xAxisLabel = useMemo(
    () => withYAxisUnit(activeFile?.xLabel, plotXUnitLabel),
    [activeFile?.xLabel, plotXUnitLabel],
  );

  const interactiveXDomain = useMemo<[number, number]>(
    () =>
      xTicks && xTicks.length >= 2
        ? [Number(xTicks[0]), Number(xTicks[xTicks.length - 1])]
        : xDomain,
    [xDomain, xTicks],
  );

  const handlePlotAreaChange = useCallback((nextPlotRect: PlotRect | null) => {
    setChartPlotArea((previousPlotRect) =>
      samePlotRect(previousPlotRect, nextPlotRect)
        ? previousPlotRect
        : nextPlotRect,
    );
  }, []);

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={1}
        minHeight={1}
        className="!outline-none"
      >
        <LineChart
          data={[]}
          margin={CHART_MARGIN}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
          <XAxis
            dataKey="x"
            type="number"
            domain={interactiveXDomain}
            ticks={xTicks ?? undefined}
            interval={xLabelInterval}
            label={
              xAxisLabel
                ? {
                    value: xAxisLabel,
                    position: "insideBottom",
                    offset: -15,
                    fill: "currentColor",
                    opacity: 0.9,
                    fontSize: 16,
                    fontWeight: 500,
                  }
                : undefined
            }
            tickFormatter={(v) => formatNumber(Number(v) * plotXFactor, { digits: xTickDigits })}
            stroke="currentColor"
            className="text-text-secondary text-xs"
            tick={{ fill: "currentColor", opacity: 0.6 }}
            allowDataOverflow
          />
          <YAxis
            label={
              yAxisLabel
                ? {
                    value: yAxisLabel,
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
            scale="linear"
            domain={chartYDomain}
            ticks={chartYTicks ?? undefined}
            interval={yLabelInterval}
            tickFormatter={(v) => {
              if (effectiveYScale !== "linear") {
                const raw = Number.isFinite(Number(v)) ? Math.pow(10, Number(v)) : Number.NaN;
                return formatLogTickLabel(raw * plotYFactor);
              }
              const scaled = Number(v) * plotYFactor;
              const normalized =
                Math.abs(scaled) <= yAxisNearZeroEpsilon ? 0 : scaled;
              return formatNumber(normalized, { digits: yTickDigits });
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
              `x=${formatNumber(Number(label) * plotXFactor, {
                digits: xTooltipDigits ?? xTickDigits,
              })} ${plotXUnitLabel}`
            }
            itemSorter={(entry: any) =>
              tooltipSeriesOrder.get(String(entry?.name ?? "")) ?? Number.MAX_SAFE_INTEGER
            }
            formatter={(value, name, item: any) => {
              const rawFromPrimary = Number(item?.payload?.[plotYKey]);
              const rawFromY = Number(item?.payload?.y);
              const rawFromValue =
                effectiveYScale === "linear"
                  ? Number(value)
                  : Number.isFinite(Number(value))
                    ? Math.pow(10, Number(value))
                    : Number.NaN;
              const num = Number.isFinite(rawFromPrimary)
                ? rawFromPrimary
                : Number.isFinite(rawFromY)
                  ? rawFromY
                  : rawFromValue;
              const decodedName = decodeTooltipSeriesName(name);
              return [
                `${formatNumber(num * plotYFactor, { digits: yTickDigits })} ${plotYUnitLabel}`,
                decodedName.label,
              ];
            }}
          />
          <Customized
            component={<ChartPlotAreaReporter onChange={handlePlotAreaChange} />}
          />

          {highlightOverlays.map((overlay) => (<Fragment key={overlay.key}>
              <ReferenceArea
                x1={Math.min(overlay.x1, overlay.x2)}
                x2={Math.max(overlay.x1, overlay.x2)}
                fill={overlay.fill}
                fillOpacity={overlay.fillOpacity}
                ifOverflow="hidden"
              />
              {!overlay.hideStartLine ? (
                <ReferenceLine
                  x={Math.min(overlay.x1, overlay.x2)}
                  stroke={overlay.stroke}
                  strokeOpacity={overlay.strokeOpacity}
                  strokeWidth={overlay.strokeWidth ?? 1.5}
                  strokeDasharray={overlay.strokeDasharray}
                  ifOverflow="hidden"
                />
              ) : null}
              {!overlay.hideEndLine ? (
                <ReferenceLine
                  x={Math.max(overlay.x1, overlay.x2)}
                  stroke={overlay.stroke}
                  strokeOpacity={overlay.strokeOpacity}
                  strokeWidth={overlay.strokeWidth ?? 1.5}
                  strokeDasharray={overlay.strokeDasharray}
                  ifOverflow="hidden"
                />
              ) : null}
            </Fragment>))}

          {currentBiasMarkers.map((marker) => (
            <ReferenceLine
              key={marker.key}
              x={marker.x}
              stroke={marker.stroke}
              strokeOpacity={marker.strokeOpacity}
              strokeWidth={marker.strokeWidth ?? 2}
              strokeDasharray={marker.strokeDasharray}
              ifOverflow="hidden"
            />
          ))}

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
            width={legendWidth}
            wrapperStyle={{ right: 0, top: 0 }}
            content={legendContent}
          />

          {isSsPlot && focusedFitLine ? (
            <Line
              data={chartFocusedFitLine ?? undefined}
              dataKey={chartYDataKey}
              name="Fit"
              stroke={focusedSeriesColor}
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeOpacity={0.7}
            />
          ) : null}

          {chartSeriesList.map((series, idx) => (
            <Line
              key={series.id}
              data={series.data}
              dataKey={chartYDataKey}
              name={series.tooltipName ?? series.name}
              stroke={COLORS[idx % COLORS.length]}
              dot={false}
              isAnimationActive={false}
              strokeWidth={
                isSsPlot && focusedSeriesId && series.id === focusedSeriesId ? 2.5 : 2
              }
              strokeOpacity={
                isSsPlot && focusedSeriesId && series.id !== focusedSeriesId ? 0.35 : 1
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartInteractionOverlay
        key={`${plotType ?? "plot"}:${focusedSeriesId ?? "series"}:${currentBiasInteraction?.enabled ? "currentBias" : ssInteraction?.enabled ? "ss" : "off"}`}
        xDomain={interactiveXDomain}
        plotArea={chartPlotArea}
        interactiveSeriesXs={interactiveSeriesXs}
        currentBiasInteraction={currentBiasInteraction}
        ssInteraction={ssInteraction}
        ssOverlayStyle={ssOverlayStyle}
      />
    </div>
  );
});

MainPlotChart.displayName = "MainPlotChart";

export default MainPlotChart;
