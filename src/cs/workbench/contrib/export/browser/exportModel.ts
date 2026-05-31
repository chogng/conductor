import type { TranslateFn } from "src/cs/platform/language/common/language";

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
  t,
}: {
  originCanvasExportScope: OriginCanvasExportScope;
  originFilteredCanvasKind: OriginFilteredCanvasKind;
  selectedCanvasCount: number;
  t: TranslateFn;
}): string => {
  if (originCanvasExportScope === "current") {
    return t("da_origin_canvas_scope_summary_current");
  }

  if (originCanvasExportScope === "filtered") {
    return t("da_origin_canvas_scope_summary_filtered", {
      count: selectedCanvasCount,
      kind:
        originFilteredCanvasKind === "transfer"
          ? t("da_origin_filtered_canvas_kind_transfer")
          : t("da_origin_filtered_canvas_kind_output"),
    });
  }

  if (originCanvasExportScope === "all") {
    return t("da_origin_canvas_scope_summary_all", {
      count: selectedCanvasCount,
    });
  }

  return t("da_origin_canvas_scope_summary_selected", {
    count: selectedCanvasCount,
  });
};

export const getExportSelectionSummary = ({
  resolvedOriginExportMode,
  selectedCanvasCount,
  selectedOriginSeriesTotalCount,
  separateCanvasScopeSummary,
  t,
}: {
  resolvedOriginExportMode: OriginExportMode;
  selectedCanvasCount: number;
  selectedOriginSeriesTotalCount: number;
  separateCanvasScopeSummary: string;
  t: TranslateFn;
}): string =>
  resolvedOriginExportMode === "merged"
    ? t("da_origin_collection_summary", {
        curves: selectedOriginSeriesTotalCount,
        files: selectedCanvasCount,
      })
    : separateCanvasScopeSummary;
