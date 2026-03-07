import React, { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import ScrollArea from "../../../../components/ui/ScrollArea";
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
    <Card variant="panel" className="h-full min-h-0 flex flex-col !pr-0">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap pr-4">
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

          <Button
            id="device-analysis-overview-sort-ymax-btn"
            cta="Device Analysis"
            ctaPosition="overview-grid"
            ctaCopy="sort by ymax"
            variant={sortOrder !== "none" ? "secondary" : "ghost"}
            size="control"
            onClick={() => {
              setSortOrder((prev) => {
                if (prev === "none") return "desc";
                if (prev === "desc") return "asc";
                return "none";
              });
            }}
            title={`Sort by yMax: ${sortOrder === "none" ? "None" : sortOrder === "desc" ? "Descending" : "Ascending"}`}
            aria-label={`Sort by yMax: ${sortOrder === "none" ? "None" : sortOrder === "desc" ? "Descending" : "Ascending"}`}
          >
            {sortOrder === "asc" ? (
              <ArrowUpWideNarrow size={18} />
            ) : (
              <ArrowDownWideNarrow size={18} />
            )}
          </Button>

          {processingStatus?.state === "processing" && (
            <div className="text-xs text-text-secondary">
              Processing {processingStatus.processed}/{processingStatus.total}
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0" viewportClassName="pr-4" axis="y">
        <div className="grid grid-cols-1 auto-rows-max gap-2.5 content-start">
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
      </ScrollArea>
    </Card>
  );
});

OverviewGrid.displayName = "OverviewGrid";

export default OverviewGrid;
