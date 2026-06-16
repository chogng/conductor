/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createSelectBox, type SelectBox } from "src/cs/base/browser/ui/selectBox/selectBox";
import { localize } from "src/cs/nls";
import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import { getPlotColor } from "src/cs/workbench/services/plot/common/plotColors";
import type {
  SearchInterpolationMode,
  SearchPlotModel,
  SearchPlotPaneId,
  SearchPlotPaneModel,
  SearchPoint,
  SearchState,
} from "src/cs/workbench/services/search/common/search";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";

export type SearchViewInput = {
  readonly model: SearchPlotModel | null;
  readonly searchState: SearchState;
  readonly onQueryTextChange: (text: string) => void;
  readonly onSearchPlotModelAtText: (
    model: PlotMainRenderModel | null,
    text: string,
  ) => readonly SearchPoint[] | null;
  readonly onInterpolationModeChange: (mode: SearchInterpolationMode) => void;
};

export type SearchViewElement = HTMLElement & {
  readonly dispose?: () => void;
};

export const createSearchView = ({
  model,
  searchState,
  onInterpolationModeChange,
  onQueryTextChange,
  onSearchPlotModelAtText,
}: SearchViewInput): SearchViewElement => {
  const disposables: SelectBox<SearchInterpolationMode>[] = [];
  const primaryModel = getPrimarySearchModel(model);
  const section = document.createElement("section") as SearchViewElement;
  section.className = "search_pane";
  section.setAttribute("aria-label", localize("search.heading", "Search"));

  const control = document.createElement("div");
  control.className = "search_control";

  const label = document.createElement("span");
  label.className = "search_label";
  label.textContent = localize("search.xInput", "X value");

  const inputField = createInputBoxField({
    ariaLabel: localize("search.xInput", "X value"),
    className: "search_input",
    disabled: !primaryModel,
    inputClassName: "search_input_native",
    type: "text",
    value: primaryModel ? getSearchInputValue(searchState, primaryModel) : "",
  });
  const input = inputField.input;
  input.inputMode = "decimal";

  const algorithmLabel = document.createElement("span");
  algorithmLabel.className = "search_label";
  algorithmLabel.textContent = localize("search.interpolation.label", "Algorithm");

  let renderSearchResults = (): void => {};
  const algorithmSelect = createSearchInterpolationSelect({
    disabled: !primaryModel,
    onInterpolationModeChange: mode => {
      onInterpolationModeChange(mode);
      renderSearchResults();
    },
    value: searchState.query.interpolationMode,
  });
  disposables.push(algorithmSelect);

  const summary = document.createElement("span");
  summary.className = "search_summary";
  if (primaryModel) {
    summary.textContent = localize("search.summary", "{seriesCount} series, {pointsCount} points, X {xDomain}", {
      pointsCount: primaryModel.pointsCount,
      seriesCount: primaryModel.seriesList.length,
      xDomain: formatDomain(primaryModel.xDomain),
    });
  }

  control.append(label, inputField.element, algorithmLabel, algorithmSelect.domNode, summary);

  const body = document.createElement("div");
  body.className = "search_results";

  if (!model || !primaryModel) {
    body.replaceChildren(createSearchEmpty(localize("search.empty.model", "No chart data to search.")));
    section.append(control, body);
    return section;
  }

  const render = () => {
    const paneResults = model.panes.map(pane => ({
      pane,
      results: onSearchPlotModelAtText(pane.model, input.value),
    }));
    if (paneResults.some(result => !result.results)) {
      body.replaceChildren(createSearchEmpty(localize("search.invalidX", "Enter a numeric X value.")));
      return;
    }

    const populatedPaneResults = paneResults.filter((result): result is {
      readonly pane: SearchPlotPaneModel;
      readonly results: readonly SearchPoint[];
    } => Boolean(result.results?.length));
    if (!populatedPaneResults.length) {
      body.replaceChildren(createSearchEmpty(localize("search.noSeries", "No series available.")));
      return;
    }

    body.replaceChildren(
      ...populatedPaneResults.map(result => createSearchResultSection(result.pane, result.results)),
    );
  };
  renderSearchResults = render;

  input.addEventListener("input", () => {
    onQueryTextChange(input.value);
    render();
  });
  render();

  section.append(control, body);
  Object.defineProperty(section, "dispose", {
    value: (): void => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      section.replaceChildren();
    },
  });
  return section;
};

const getPrimarySearchModel = (model: SearchPlotModel | null): PlotMainRenderModel | null =>
  model?.panes[0]?.model ?? null;

const getSearchInputValue = (
  searchState: SearchState,
  model: PlotMainRenderModel,
): string => {
  const queryText = searchState.query.text;
  return queryText === "" ? formatInputValue(resolveInitialSearchX(model.xDomain)) : queryText;
};

const createSearchResultSection = (
  pane: SearchPlotPaneModel,
  results: readonly SearchPoint[],
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "search_result_section";

  const title = document.createElement("div");
  title.className = "search_result_section_title";
  title.textContent = getSearchPaneLabel(pane.id);

  section.append(
    title,
    createSearchResultsHeader(),
    ...results.map((result, index) => createSearchResult(result, index)),
  );
  return section;
};

const getSearchPaneLabel = (paneId: SearchPlotPaneId): string => {
  if (paneId === "inspector") {
    return localize("search.pane.inspector", "Second order");
  }
  return localize("search.pane.chart", "Main chart");
};

const createSearchResultsHeader = (): HTMLElement => {
  const row = document.createElement("div");
  row.className = "search_result search_result_header";

  const swatch = document.createElement("span");
  swatch.className = "search_swatch search_swatch_header";
  swatch.setAttribute("aria-hidden", "true");

  const series = document.createElement("span");
  series.className = "search_series";
  series.textContent = localize("search.column.series", "Series");

  const y = document.createElement("span");
  y.className = "search_value";
  y.textContent = localize("search.column.y", "Y");

  const x = document.createElement("span");
  x.className = "search_value";
  x.textContent = localize("search.column.x", "X");

  row.append(swatch, series, y, x);
  return row;
};

const createSearchResult = (result: SearchPoint, index: number): HTMLElement => {
  const row = document.createElement("div");
  row.className = "search_result";
  row.dataset.status = result.status;
  const columns = formatSearchColumns(result);

  const swatch = document.createElement("span");
  swatch.className = "search_swatch";
  swatch.style.backgroundColor = result.color || getPlotColor(index);

  const name = document.createElement("span");
  name.className = "search_series";
  name.textContent = result.seriesName;

  const value = document.createElement("span");
  value.className = "search_value";
  value.textContent = columns.yText;

  const x = document.createElement("span");
  x.className = "search_value";
  x.textContent = columns.xText;

  row.append(swatch, name, value, x);
  return row;
};

const createSearchEmpty = (message: string): HTMLElement => {
  const empty = document.createElement("div");
  empty.className = "search_empty";
  empty.textContent = message;
  return empty;
};

export const resolveInitialSearchX = (domain: readonly [number, number]): number => {
  const min = Number(domain[0]);
  const max = Number(domain[1]);
  if (!Number.isFinite(min)) {
    return 0;
  }
  if (!Number.isFinite(max)) {
    return min;
  }
  if (min <= 0 && max >= 0) {
    return 0;
  }
  return (min + max) / 2;
};

const formatInputValue = (value: number): string =>
  Number.isFinite(value) ? String(Number(value.toPrecision(8))) : "";

const formatDomain = (domain: readonly [number, number]): string =>
  `${formatNumber(domain[0], { digits: 4 })} - ${formatNumber(domain[1], { digits: 4 })}`;

const formatSearchColumns = (
  result: SearchPoint,
): { readonly xText: string; readonly yText: string } => {
  const xText = Number.isFinite(result.x)
    ? formatNumber(result.x, { digits: 6 })
    : "";
  if (result.status === "empty") {
    return {
      xText,
      yText: localize("search.missing", "Missing"),
    };
  }
  if (result.status === "noExactMatch") {
    return {
      xText,
      yText: localize("search.noExactPoint", "No exact point"),
    };
  }
  if (result.status === "outOfRange") {
    return {
      xText,
      yText: localize("search.outOfRange", "Out of Range"),
    };
  }
  return {
    xText,
    yText: result.y === null ? "" : formatNumber(result.y, { digits: 6 }),
  };
};

const createSearchInterpolationSelect = ({
  disabled,
  onInterpolationModeChange,
  value,
}: {
  readonly disabled: boolean;
  readonly onInterpolationModeChange: (mode: SearchInterpolationMode) => void;
  readonly value: SearchInterpolationMode;
}): SelectBox<SearchInterpolationMode> =>
  createSelectBox({
    ariaLabel: localize("search.interpolation.selectLabel", "Search algorithm"),
    className: "search_select",
    disabled,
    dropdownClassName: "search_select_surface",
    onDidSelect: onInterpolationModeChange,
    options: [
      {
        label: localize("search.interpolation.linear", "Linear interpolation"),
        value: "linear",
      },
      {
        label: localize("search.interpolation.none", "No interpolation"),
        value: "none",
      },
    ],
    value,
  });
