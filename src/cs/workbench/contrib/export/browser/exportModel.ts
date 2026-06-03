import { localize } from "src/cs/nls";

import type { OriginFilteredCanvasKind, OriginCanvasExportScope } from "./originCanvasExport.ts";
import type { OriginExportMode } from "../common/originSelectionExport.ts";

export type ExportPaneState = {
  isExportListCanvasSelectionMode: boolean;
  isExportPaneActive: boolean;
  isManualCanvasScope: boolean;
  showFilteredCanvasKindSelect: boolean;
};

export const createExportPaneState = ({
  originCanvasExportScope,
  resultsTab,
}: {
  originCanvasExportScope: OriginCanvasExportScope;
  resultsTab: string;
}): ExportPaneState => {
  const isExportPaneActive = resultsTab === "export" || resultsTab === "rc";
  const isManualCanvasScope =
    isExportPaneActive && originCanvasExportScope === "selected";

  return {
    isExportListCanvasSelectionMode: isManualCanvasScope,
    isExportPaneActive,
    isManualCanvasScope,
    showFilteredCanvasKindSelect: originCanvasExportScope === "filtered",
  };
};

export const getCanvasScopeSummary = ({
  originCanvasExportScope,
  originFilteredCanvasKind,
  selectedCanvasCount,
}: {
  originCanvasExportScope: OriginCanvasExportScope;
  originFilteredCanvasKind: OriginFilteredCanvasKind;
  selectedCanvasCount: number;
}): string => {
  if (originCanvasExportScope === "current") {
    return localize("da_origin_canvas_scope_summary_current", "The current thumbnail will export as a single result unit.");
  }

  if (originCanvasExportScope === "filtered") {
    return localize("da_origin_canvas_scope_summary_filtered", "{count} {kind} thumbnails match the current filter.", {
      count: selectedCanvasCount,
      kind:
        originFilteredCanvasKind === "transfer"
          ? localize("da_origin_filtered_canvas_kind_transfer", "Transfer")
          : localize("da_origin_filtered_canvas_kind_output", "Output"),
    });
  }

  if (originCanvasExportScope === "all") {
    return localize("da_origin_canvas_scope_summary_all", "All {count} thumbnails will export.", {
      count: selectedCanvasCount,
    });
  }

  return localize("da_origin_canvas_scope_summary_selected", "{count} thumbnails are selected.", {
    count: selectedCanvasCount,
  });
};

export const getExportSelectionSummary = ({
  resolvedOriginExportMode,
  selectedCanvasCount,
  selectedOriginSeriesTotalCount,
  separateCanvasScopeSummary,
}: {
  resolvedOriginExportMode: OriginExportMode;
  selectedCanvasCount: number;
  selectedOriginSeriesTotalCount: number;
  separateCanvasScopeSummary: string;
}): string =>
  resolvedOriginExportMode === "merged"
    ? localize("da_origin_collection_summary", "{curves} collected curve(s) from {files} file(s)", {
        curves: selectedOriginSeriesTotalCount,
        files: selectedCanvasCount,
      })
    : separateCanvasScopeSummary;
