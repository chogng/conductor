import React, { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow } from "lucide-react";
import Card from "../../../../components/ui/Card";
import Tabs from "../../../../components/ui/Tabs";
import FileCard from "./FileCard";

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

OverviewGrid.displayName = "OverviewGrid";

export default OverviewGrid;
