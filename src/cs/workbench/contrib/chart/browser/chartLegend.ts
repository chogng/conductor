import { InlineEditableTextWidget } from "src/cs/base/browser/ui/InlineEditableText/inlineEditableTextWidget";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import type { PlotMainSeries } from "src/cs/workbench/services/plot/common/plotModel";
import { getPlotColor, resolveSeriesPlotColor } from "src/cs/workbench/services/plot/common/plotColors";
import type { PlotLegendModel, PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { URI } from "src/cs/base/common/uri";

const DEFAULT_LEGEND_FONT_SIZE = 12;

export type LegendContext = {
  readonly fileId: string;
  readonly plotType: PlotType;
  readonly seriesList: readonly PlotMainSeries[];
  readonly resource?: URI | null;
  readonly sheetId?: string | null;
};

export type LegendPopover = HTMLElement & {
  readonly dispose: () => void;
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
    resource: legendModel.resource ?? null,
    sheetId: legendModel.sheetId ?? null,
  };
};

export const isSameLegendContext = (
  left: LegendContext,
  right: LegendContext,
): boolean =>
  left.fileId === right.fileId &&
  getLegendResourceKey(left.resource) === getLegendResourceKey(right.resource) &&
  String(left.sheetId ?? "") === String(right.sheetId ?? "") &&
  left.plotType === right.plotType &&
  left.seriesList === right.seriesList;

const getLegendResourceKey = (resource: unknown): string => {
  const text = getLegendResourceString(resource);
  if (text) {
    return text.replace(/\\/g, "/");
  }

  const components = resource as {
    readonly authority?: unknown;
    readonly fragment?: unknown;
    readonly path?: unknown;
    readonly query?: unknown;
    readonly scheme?: unknown;
  } | null | undefined;
  const path = String(components?.path ?? "").trim();
  if (!path) {
    return "";
  }

  const scheme = String(components?.scheme ?? "").trim();
  const authority = String(components?.authority ?? "").trim();
  const query = String(components?.query ?? "").trim();
  const fragment = String(components?.fragment ?? "").trim();
  if (scheme === "file") {
    return [
      "file://",
      authority,
      path,
      query ? `?${query}` : "",
      fragment ? `#${fragment}` : "",
    ].join("").replace(/\\/g, "/");
  }

  return [
    scheme ? `${scheme}:` : "",
    authority ? `//${authority}` : "",
    path,
    query ? `?${query}` : "",
    fragment ? `#${fragment}` : "",
  ].join("").replace(/\\/g, "/");
};

const getLegendResourceString = (resource: unknown): string => {
  const toString = (resource as { readonly toString?: unknown } | null | undefined)?.toString;
  if (typeof toString !== "function") {
    return "";
  }

  const text = String(toString.call(resource) ?? "").trim();
  return text === "[object Object]" ? "" : text;
};

export const getLegendDefaultLabel = (
  series: PlotMainSeries,
  index: number,
): string =>
  String(series.name ?? `Series ${index + 1}`);

export const resolveLegendLabelOverride = (
  nextLabel: unknown,
  defaultLabel: string,
): string | null => {
  const normalized = String(nextLabel ?? "").trim();
  const normalizedDefault = String(defaultLabel ?? "").trim();

  if (!normalized || normalized === normalizedDefault) {
    return null;
  }

  return normalized;
};

const renderLegend = (
  container: HTMLElement,
  store: DisposableStore,
  seriesList: readonly PlotMainSeries[],
  hiddenLegendKeys: readonly string[] = [],
  legendLabels: Readonly<Record<string, string>> = {},
  onToggleLegendItem?: (legendKey: string) => void,
  onEditLegendItem?: (legendKey: string, currentLabel: string) => void,
  editingLegendKey?: string | null,
  onCommitLegendItemEdit?: (legendKey: string, nextLabel: string) => void,
  onCancelLegendItemEdit?: () => void,
): void => {
  container.replaceChildren();

  const list = document.createElement("div");
  list.className = "chart_legend_list";
  for (const [index, series] of seriesList.entries()) {
    const row = document.createElement("div");
    row.className = "chart_legend_row";
    const legendKey = String(series.id ?? "");
    const isVisible = !hiddenLegendKeys.includes(legendKey);
    const defaultLabel = getLegendDefaultLabel(series, index);
    const labelText = String(legendLabels[legendKey] ?? defaultLabel);
    const isEditing = legendKey !== "" && legendKey === editingLegendKey;
    row.dataset.hidden = isVisible ? "false" : "true";

    const swatch = document.createElement("span");
    swatch.className = "chart_legend_swatch";
    swatch.style.backgroundColor = resolveSeriesPlotColor(series, index) || getPlotColor(index);

    if (isEditing) {
      const editor = document.createElement("div");
      editor.className = "chart_legend_editor";
      let draftLabel = labelText;
      const editLabel = localize("chart.legend.editLabelFor", "Edit legend label for {label}", {
        label: labelText,
      });
      const inlineEditor = new InlineEditableTextWidget({
        className: "chart_legend_inline_editor",
        draftValue: draftLabel,
        editing: true,
        onCancel: () => onCancelLegendItemEdit?.(),
        onChange: (nextValue) => {
          draftLabel = nextValue;
        },
        onCommit: () => onCommitLegendItemEdit?.(legendKey, draftLabel),
        onStartEdit: () => undefined,
        title: editLabel,
        value: labelText,
      });
      store.add(inlineEditor);
      inlineEditor.inputElement.setAttribute("aria-label", editLabel);
      editor.append(swatch, inlineEditor.element);
      row.append(editor);
    } else {
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

      const label = document.createElement("span");
      label.className = "chart_legend_label";
      label.textContent = labelText;
      toggle.append(swatch, label);
      row.append(toggle);
    }

    if (onEditLegendItem && !isEditing) {
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
    readonly editingLegendKey?: string | null;
    readonly onToggleLegendItem?: (legendKey: string) => void;
    readonly onEditLegendItem?: (legendKey: string, currentLabel: string) => void;
    readonly onCommitLegendItemEdit?: (legendKey: string, nextLabel: string) => void;
    readonly onCancelLegendItemEdit?: () => void;
  } = {},
): LegendPopover => {
  const store = new DisposableStore();
  const legend = document.createElement("div");
  legend.className = "chart_legend";
  legend.style.fontSize = `${DEFAULT_LEGEND_FONT_SIZE}px`;
  renderLegend(
    legend,
    store,
    context.seriesList,
    options.hiddenLegendKeys,
    options.legendLabels,
    options.onToggleLegendItem,
    options.onEditLegendItem,
    options.editingLegendKey,
    options.onCommitLegendItemEdit,
    options.onCancelLegendItemEdit,
  );
  legend.setAttribute("role", "dialog");
  legend.setAttribute("aria-label", localize("chart.legend.heading", "Legend"));
  Object.defineProperty(legend, "dispose", {
    value: (): void => {
      store.dispose();
    },
  });
  return legend as unknown as LegendPopover;
};
