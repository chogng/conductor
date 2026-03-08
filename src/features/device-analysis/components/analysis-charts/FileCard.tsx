// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import CanvasMultiLineChart from "../CanvasMultiLineChart";
import { formatNumber } from "../../lib/analysisMath";

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
      className={`flex flex-col w-full text-left rounded-xl border transition-colors overflow-hidden ${isActive
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
        className="relative w-full min-h-[120px] bg-bg-page"
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

FileCard.displayName = "FileCard";

export default FileCard;
