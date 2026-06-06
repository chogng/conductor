import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { AnalysisPanelProps } from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import { getCalculatedData, type CalculatedSeries } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { getPlotColor, resolveSeriesPlotColor } from "src/cs/workbench/contrib/plot/browser/plotColors";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";

export type LegendContext = {
  readonly fileId: string;
  readonly plotType: PlotType;
  readonly seriesList: CalculatedSeries[];
};

export const getLegendContext = (
  props: AnalysisPanelProps,
  plotType: PlotType,
): LegendContext | null => {
  const calculatedData = getCalculatedData(
    props.calculatedDataByKey,
    plotType,
    props.activeFileId,
  );
  if (!calculatedData?.seriesList.length) {
    return null;
  }

  return {
    fileId: String(calculatedData.source.fileId ?? ""),
    plotType,
    seriesList: calculatedData.seriesList,
  };
};

export const isSameLegendContext = (
  left: LegendContext,
  right: LegendContext,
): boolean =>
  left.fileId === right.fileId &&
  left.plotType === right.plotType &&
  left.seriesList === right.seriesList;

const renderLegend = (
  container: HTMLElement,
  seriesList: readonly CalculatedSeries[],
  hiddenLegendKeys: readonly string[] = [],
  legendLabels: Readonly<Record<string, string>> = {},
  onToggleLegendItem?: (legendKey: string) => void,
  onEditLegendItem?: (legendKey: string, currentLabel: string) => void,
): void => {
  container.replaceChildren();

  const list = document.createElement("div");
  list.className = "chart_legend_list";
  for (const [index, series] of seriesList.entries()) {
    const row = document.createElement("div");
    row.className = "chart_legend_row";
    const legendKey = String(series.id ?? "");
    const isVisible = !hiddenLegendKeys.includes(legendKey);
    const labelText = String(legendLabels[legendKey] ?? series.name ?? `Series ${index + 1}`);
    row.dataset.hidden = isVisible ? "false" : "true";

    const toggle = document.createElement("button");
    toggle.className = "chart_legend_toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", String(isVisible));
    toggle.disabled = !legendKey || !onToggleLegendItem;
    toggle.addEventListener("click", () => {
      if (legendKey) {
        onToggleLegendItem?.(legendKey);
      }
    });

    const swatch = document.createElement("span");
    swatch.className = "chart_legend_swatch";
    swatch.style.backgroundColor = resolveSeriesPlotColor(series, index) || getPlotColor(index);
    const label = document.createElement("span");
    label.className = "chart_legend_label";
    label.textContent = labelText;
    toggle.append(swatch, label);
    row.append(toggle);

    if (onEditLegendItem) {
      const edit = document.createElement("button");
      edit.className = "chart_legend_edit";
      edit.type = "button";
      edit.disabled = !legendKey;
      edit.title = localize("chart_legend_edit_label", "Edit legend label");
      edit.setAttribute("aria-label", localize("chart_legend_edit_label_for", "Edit legend label for {label}", {
        label: labelText,
      }));
      edit.append(createLxIcon({
        className: "chart_legend_edit_icon",
        icon: LxIcon.edit,
        size: 14,
      }));
      edit.addEventListener("click", () => {
        if (legendKey) {
          onEditLegendItem(legendKey, labelText);
        }
      });

      const actions = document.createElement("div");
      actions.className = "chart_legend_actions";
      actions.appendChild(edit);
      row.append(actions);
    }

    list.appendChild(row);
  }
  container.appendChild(list);
};

export const createLegendPopover = (
  props: AnalysisPanelProps,
  context: LegendContext,
  options: {
    readonly hiddenLegendKeys?: readonly string[];
    readonly legendLabels?: Readonly<Record<string, string>>;
    readonly onToggleLegendItem?: (legendKey: string) => void;
    readonly onEditLegendItem?: (legendKey: string, currentLabel: string) => void;
  } = {},
): HTMLElement => {
  const axisSettings = normalizePlotAxisSettings(
    props.plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  const legend = document.createElement("div");
  legend.className = "chart_legend";
  legend.style.width = "120px";
  if (axisSettings.legendFontSize !== "") {
    legend.style.fontSize = `${axisSettings.legendFontSize}px`;
  }
  renderLegend(
    legend,
    context.seriesList,
    options.hiddenLegendKeys,
    options.legendLabels,
    options.onToggleLegendItem,
    options.onEditLegendItem,
  );
  legend.setAttribute("role", "dialog");
  legend.setAttribute("aria-label", localize("chart_legend_heading", "Legend"));
  return legend;
};
