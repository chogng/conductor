/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import { localize } from "src/cs/nls";
import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import { getPlotColor } from "src/cs/workbench/services/plot/common/plotColors";
import type {
  SearchPoint,
  SearchState,
} from "src/cs/workbench/services/search/common/search";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";

export type SearchViewInput = {
  readonly model: PlotMainRenderModel | null;
  readonly searchState: SearchState;
  readonly onQueryTextChange: (text: string) => void;
  readonly onSearchPlotModelAtText: (
    model: PlotMainRenderModel | null,
    text: string,
  ) => readonly SearchPoint[] | null;
};

export const createSearchView = ({
  model,
  searchState,
  onQueryTextChange,
  onSearchPlotModelAtText,
}: SearchViewInput): HTMLElement => {
  const section = document.createElement("section");
  section.className = "search_pane";
  section.setAttribute("aria-label", localize("search_heading", "Search"));

  const control = document.createElement("label");
  control.className = "search_control";

  const label = document.createElement("span");
  label.className = "search_label";
  label.textContent = localize("search_x_input", "X value");

  const inputField = createInputBoxField({
    ariaLabel: localize("search_x_input", "X value"),
    className: "search_input",
    disabled: !model,
    inputClassName: "search_input_native",
    type: "number",
    value: model ? getSearchInputValue(searchState, model) : "",
  });
  const input = inputField.input;
  input.step = "any";

  const summary = document.createElement("span");
  summary.className = "search_summary";
  if (model) {
    summary.textContent = localize("search_summary", "{seriesCount} series, {pointsCount} points, X {xDomain}", {
      pointsCount: model.pointsCount,
      seriesCount: model.seriesList.length,
      xDomain: formatDomain(model.xDomain),
    });
  }

  control.append(label, inputField.element, summary);

  const body = document.createElement("div");
  body.className = "search_results";

  if (!model) {
    body.replaceChildren(createSearchEmpty(localize("search_empty_model", "No chart data to search.")));
    section.append(control, body);
    return section;
  }

  const render = () => {
    const results = onSearchPlotModelAtText(model, input.value);
    if (!results) {
      body.replaceChildren(createSearchEmpty(localize("search_invalid_x", "Enter a numeric X value.")));
      return;
    }

    if (!results.length) {
      body.replaceChildren(createSearchEmpty(localize("search_no_series", "No series available.")));
      return;
    }

    body.replaceChildren(...results.map((result, index) => createSearchResult(result, index)));
  };

  input.addEventListener("input", () => {
    onQueryTextChange(input.value);
    render();
  });
  render();

  section.append(control, body);
  return section;
};

const getSearchInputValue = (
  searchState: SearchState,
  model: PlotMainRenderModel,
): string => {
  const queryText = searchState.query.text;
  return queryText === "" ? formatInputValue(resolveInitialX(model.xDomain)) : queryText;
};

const createSearchResult = (result: SearchPoint, index: number): HTMLElement => {
  const row = document.createElement("div");
  row.className = "search_result";
  row.dataset.status = result.status;

  const swatch = document.createElement("span");
  swatch.className = "search_swatch";
  swatch.style.backgroundColor = result.color || getPlotColor(index);

  const name = document.createElement("span");
  name.className = "search_series";
  name.textContent = result.seriesName;

  const value = document.createElement("span");
  value.className = "search_value";
  value.textContent = formatSearchValue(result);

  row.append(swatch, name, value);
  return row;
};

const createSearchEmpty = (message: string): HTMLElement => {
  const empty = document.createElement("div");
  empty.className = "search_empty";
  empty.textContent = message;
  return empty;
};

const resolveInitialX = (domain: readonly [number, number]): number => {
  const min = Number(domain[0]);
  const max = Number(domain[1]);
  if (!Number.isFinite(min)) {
    return 0;
  }
  if (!Number.isFinite(max)) {
    return min;
  }
  return (min + max) / 2;
};

const formatInputValue = (value: number): string =>
  Number.isFinite(value) ? String(Number(value.toPrecision(8))) : "";

const formatDomain = (domain: readonly [number, number]): string =>
  `${formatNumber(domain[0], { digits: 4 })} - ${formatNumber(domain[1], { digits: 4 })}`;

const formatSearchValue = (result: SearchPoint): string => {
  if (result.status === "empty") {
    return localize("search_missing", "Missing");
  }
  if (result.status === "outOfRange") {
    return localize("search_out_of_range", "Out of Range");
  }
  const yText = result.y === null ? "" : formatNumber(result.y, { digits: 6 });
  const xText = result.x === null ? "" : formatNumber(result.x, { digits: 6 });
  return xText ? `${yText} @ ${xText}` : yText;
};
