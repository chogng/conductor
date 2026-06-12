import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { PlotMainSeries } from "src/cs/workbench/services/plot/common/plotModel";
import { getPlotColor, resolveSeriesPlotColor } from "src/cs/workbench/services/plot/common/plotColors";
import type { PlotLegendModel, PlotType } from "src/cs/workbench/services/plot/common/plot";

const DEFAULT_LEGEND_FONT_SIZE = 12;

export type LegendContext = {
  readonly fileId: string;
  readonly plotType: PlotType;
  readonly seriesList: readonly PlotMainSeries[];
};

export const getLegendContext = (
  model: PlotLegendModel | null,
  plotType: PlotType,
): LegendContext | null => {
  const legendModel = model?.plotType === plotType ? model : null;
  if (!legendModel?.seriesList.length) {
    return null;
  }

  return {
    fileId: legendModel.fileId,
    plotType,
    seriesList: legendModel.seriesList,
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
  seriesList: readonly PlotMainSeries[],
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
      edit.title = localize("chart.legend.editLabel", "Edit legend label");
      edit.setAttribute("aria-label", localize("chart.legend.editLabelFor", "Edit legend label for {label}", {
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
  context: LegendContext,
  options: {
    readonly hiddenLegendKeys?: readonly string[];
    readonly legendLabels?: Readonly<Record<string, string>>;
    readonly onToggleLegendItem?: (legendKey: string) => void;
    readonly onEditLegendItem?: (legendKey: string, currentLabel: string) => void;
  } = {},
): HTMLElement => {
  const legend = document.createElement("div");
  legend.className = "chart_legend";
  legend.style.width = "120px";
  legend.style.fontSize = `${DEFAULT_LEGEND_FONT_SIZE}px`;
  renderLegend(
    legend,
    context.seriesList,
    options.hiddenLegendKeys,
    options.legendLabels,
    options.onToggleLegendItem,
    options.onEditLegendItem,
  );
  legend.setAttribute("role", "dialog");
  legend.setAttribute("aria-label", localize("chart.legend.heading", "Legend"));
  return legend;
};
