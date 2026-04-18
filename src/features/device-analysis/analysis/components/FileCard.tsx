import { memo, useEffect, useMemo, useRef, useState } from "react";
import CanvasMultiLineChart, {
  resolvePreviewChartDomain,
  type CanvasMultiLineChartProps,
} from "./CanvasMultiLineChart";
import { formatNumber } from "../lib/analysisMath";

type UseInViewOnceOptions = {
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number;
};

export type ProcessedFileLike = {
  fileId?: string;
  fileName: string;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  curveType?: string;
  curveTypeConfidence?: "high" | "medium" | "low";
  x?: {
    sampledPoints?: number | null;
  };
  xAxisRole?: "vg" | "vd" | null;
  xGroups?: number[][];
  series?: CanvasMultiLineChartProps["series"];
  domain?: {
    x?: [number, number];
    y?: [number, number];
  };
};

type FileCardProps = {
  file: ProcessedFileLike;
  isActive: boolean;
  onSelectFile?: (fileId: string | undefined) => void;
  isSelectionMode?: boolean;
  isOriginSelected?: boolean;
  showOriginSelectionBadge?: boolean;
  onToggleOriginSelected?: (fileId: string | undefined) => void;
  originSelectedBadgeLabel?: string;
  xUnitFactor?: number;
  xUnitLabel?: string;
  yUnitFactor?: number;
  yUnitLabel?: string;
  yScale?: string;
};

const toSafeIdSuffix = (value: string | undefined) => {
  const normalized = (value ?? "").trim();
  if (!normalized) return "unknown";
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
};

const useInViewOnce = (options: UseInViewOnceOptions = {}) => {
  const ref = useRef<HTMLButtonElement | null>(null);
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

const FileCard = memo(function FileCard({
  file,
  isActive,
  onSelectFile,
  isSelectionMode = false,
  isOriginSelected = false,
  showOriginSelectionBadge = false,
  onToggleOriginSelected,
  originSelectedBadgeLabel = "SELECT",
  xUnitFactor = 1,
  xUnitLabel = "V",
  yUnitFactor = 1,
  yUnitLabel = "A",
  yScale = "linear",
}: FileCardProps) {
  const { ref, inView } = useInViewOnce();
  const resolvedYScale = yScale === "log" ? "log" : "linear";
  const fileIdSuffix = toSafeIdSuffix(file?.fileId ?? file?.fileName);
  const seriesCount = Array.isArray(file?.series) ? file.series.length : 0;
  const sampledPoints = file?.x?.sampledPoints ?? null;
  const previewDomain = useMemo(
    () =>
      resolvePreviewChartDomain({
        xGroups: file?.xGroups,
        series: file?.series,
        domain: file?.domain,
        yScaleType: yScale === "log" ? "log" : "linear",
      }),
    [file?.domain, file?.series, file?.xGroups, yScale],
  );
  const yAxisMin = Number(previewDomain.y[0]);
  const yAxisMax = Number(previewDomain.y[1]);
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
      onMouseDown={(event) => {
        // Prevent the browser from scrolling the page to "fully reveal" the focused card.
        // (This happens before onClick in some browsers.)
        event.preventDefault();
      }}
      onClick={() => {
        if (isSelectionMode) {
          onToggleOriginSelected?.(file?.fileId);
          return;
        }
        onSelectFile?.(file?.fileId);
      }}
      className={`flex flex-col w-full text-left rounded-xl border transition-colors overflow-hidden ${
        isActive
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-bg-surface hover:bg-bg-surface-hover"
      }`}
    >
      <div className="px-2 pt-1.5 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-text-primary whitespace-normal break-words">
              {file.fileName}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              <div id={`file-card-series-${fileIdSuffix}`} className="break-words">
                series: {seriesCount}
                {sampledPoints ? ` points: ${sampledPoints}` : ""}
                {file.curveType ? (
                  <>
                    {" | "}
                    <span id={`file-card-type-${fileIdSuffix}`}>
                      Type: {file.curveType}
                      {file.curveTypeConfidence
                        ? ` (${file.curveTypeConfidence})`
                        : ""}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative w-full min-h-[120px] bg-bg-page"
        style={{ aspectRatio: "16 / 9" }}
      >
        {inView ? (
          <CanvasMultiLineChart
            xGroups={file.xGroups}
            series={file.series}
            domain={file.domain}
            xScaleFactor={xUnitFactor}
            xUnitLabel={xUnitLabel}
            yScaleFactor={yUnitFactor}
            yScaleType={resolvedYScale}
            yUnitLabel={yUnitLabel}
            title={file.fileName}
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-bg-page/40" />
        )}
        {showOriginSelectionBadge && isOriginSelected ? (
          <div className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded-md bg-accent-terracotta/90 text-white font-semibold tracking-wide">
            {originSelectedBadgeLabel}
          </div>
        ) : null}
        {(yAxisMinLabel || yAxisMaxLabel) && (
          <div className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded-md bg-black/50 text-white space-y-0.5">
            {yAxisMinLabel ? (
              <div>
                ymin: {yAxisMinLabel}
                {ySuffix}
              </div>
            ) : null}
            {yAxisMaxLabel ? (
              <div>
                ymax: {yAxisMaxLabel}
                {ySuffix}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </button>
  );
});

FileCard.displayName = "FileCard";

export default FileCard;
