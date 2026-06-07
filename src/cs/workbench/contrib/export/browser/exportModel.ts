import { localize } from "src/cs/nls";

import type { OriginCurveExportSeriesOption, OriginExportContentOption } from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import type { OriginFilteredCanvasKind, OriginCanvasExportScope } from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type {
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/services/session/common/sessionTypes";

export type ExportPaneState = {
  isExportListCanvasSelectionMode: boolean;
  isExportPaneActive: boolean;
  isManualCanvasScope: boolean;
  showFilteredCanvasKindSelect: boolean;
};

export const ORIGIN_EXPORT_CONTENT_OPTIONS: OriginExportContentOption[] = [
  { group: "basic", key: "iv", label: "IV" },
  { group: "derived", key: "gm", label: "gm" },
  { group: "derived", key: "ss", label: "SS" },
  { group: "derived", key: "vth", label: "Vth" },
];

export const createOriginCurveOptions = (
  file: CleanedEntry,
  resolveCurveLabelForSeries: (
    file: CleanedEntry,
    series: CleanedSeries,
    index: number,
  ) => string = (_file, series, index) =>
    String(series?.name ?? `Series ${index + 1}`),
): OriginCurveExportSeriesOption[] =>
  (Array.isArray(file?.series) ? file.series : [])
    .map((series, index) => {
      const seriesId = String(series?.id ?? "");
      if (!seriesId) return null;
      return {
        key: seriesId,
        label: resolveCurveLabelForSeries(file, series, index),
        sourceFileId: String(file?.fileId ?? ""),
        sourceSeriesId: seriesId,
      };
    })
    .filter((option): option is OriginCurveExportSeriesOption => Boolean(option));

export const normalizeOriginExportContentKeys = (
  keys: readonly OriginExportContentKey[],
): OriginExportContentKey[] => Array.from(new Set(keys));

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
    return localize("origin_canvas_scope_summary_current", "The current thumbnail will export as a single result unit.");
  }

  if (originCanvasExportScope === "filtered") {
    return localize("origin_canvas_scope_summary_filtered", "{count} {kind} thumbnails match the current filter.", {
      count: selectedCanvasCount,
      kind:
        originFilteredCanvasKind === "transfer"
          ? localize("origin_filtered_canvas_kind_transfer", "Transfer")
          : localize("origin_filtered_canvas_kind_output", "Output"),
    });
  }

  if (originCanvasExportScope === "all") {
    return localize("origin_canvas_scope_summary_all", "All {count} thumbnails will export.", {
      count: selectedCanvasCount,
    });
  }

  return localize("origin_canvas_scope_summary_selected", "{count} thumbnails are selected.", {
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
    ? localize("origin_collection_summary", "{curves} collected curve(s) from {files} file(s)", {
        curves: selectedOriginSeriesTotalCount,
        files: selectedCanvasCount,
      })
    : separateCanvasScopeSummary;
