/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";

import type { OriginFilteredCanvasKind, OriginCanvasExportScope } from "src/cs/workbench/services/export/common/export";
import type {
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/services/export/common/originExport";
import type {
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
export const createOriginCurveOptionsFromRecord = (
  file: OriginCurveOptionRecord,
  resolveSeriesLabel: (fileId: string, seriesId: string, fallback: string, index: number) => string =
    (_fileId, _seriesId, fallback, index) => fallback || `Series ${index + 1}`,
): OriginCurveExportSeriesOption[] =>
  file.seriesOrder
    .map((seriesId, index) => {
      const series = file.seriesById[seriesId];
      if (!series) return null;
      const fallback = String(
        series.labelOverride ??
          series.legendValue ??
          series.name ??
          `Series ${index + 1}`,
      );
      return {
        key: seriesId,
        label: resolveSeriesLabel(file.id, seriesId, fallback, index),
        sourceFileId: file.id,
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
    return localize("origin.canvasScope.summary.current", "The current thumbnail will export as a single result unit.");
  }

  if (originCanvasExportScope === "filtered") {
    return localize("origin.canvasScope.summary.filtered", "{count} {kind} thumbnails match the current filter.", {
      count: selectedCanvasCount,
      kind:
        originFilteredCanvasKind === "transfer"
          ? localize("origin.filteredCanvasKind.transfer", "Transfer")
          : localize("origin.filteredCanvasKind.output", "Output"),
    });
  }

  if (originCanvasExportScope === "all") {
    return localize("origin.canvasScope.summary.all", "All {count} thumbnails will export.", {
      count: selectedCanvasCount,
    });
  }

  return localize("origin.canvasScope.summary.selected", "{count} thumbnails are selected.", {
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
    ? localize("origin.collection.summary", "{curves} collected curve(s) from {files} file(s)", {
        curves: selectedOriginSeriesTotalCount,
        files: selectedCanvasCount,
      })
    : separateCanvasScopeSummary;
