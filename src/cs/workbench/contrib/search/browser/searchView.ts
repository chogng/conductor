import { localize } from "src/cs/nls";
import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import type { MainPlotRenderModel } from "src/cs/workbench/contrib/plot/browser/mainPlotRenderModel";
import { getPlotColor } from "src/cs/workbench/contrib/plot/browser/plotColors";
import { searchSeriesAtX, type SearchPoint } from "src/cs/workbench/contrib/search/browser/searchModel";

export const createSearchView = (
  model: MainPlotRenderModel,
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "search_pane";
  section.setAttribute("aria-label", localize("search_heading", "Search"));

  const control = document.createElement("label");
  control.className = "search_control";

  const label = document.createElement("span");
  label.className = "search_label";
  label.textContent = localize("search_x_input", "X value");

  const input = document.createElement("input");
  input.className = "search_input";
  input.type = "number";
  input.step = "any";
  input.value = formatInputValue(resolveInitialX(model.xDomain));
  input.setAttribute("aria-label", localize("search_x_input", "X value"));

  const summary = document.createElement("span");
  summary.className = "search_summary";
  summary.textContent = localize("search_summary", "{seriesCount} series, {pointsCount} points, X {xDomain}", {
    pointsCount: model.pointsCount,
    seriesCount: model.seriesList.length,
    xDomain: formatDomain(model.xDomain),
  });

  control.append(label, input, summary);

  const body = document.createElement("div");
  body.className = "search_results";

  const render = () => {
    const x = parseSearchX(input.value);
    if (x === null) {
      body.replaceChildren(createSearchEmpty(localize("search_invalid_x", "Enter a numeric X value.")));
      return;
    }

    const results = searchSeriesAtX(model.seriesList, x);
    if (!results.length) {
      body.replaceChildren(createSearchEmpty(localize("search_no_series", "No series available.")));
      return;
    }

    body.replaceChildren(...results.map((result, index) => createSearchResult(result, index)));
  };

  input.addEventListener("input", render);
  render();

  section.append(control, body);
  return section;
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
  empty.setAttribute("role", "status");
  empty.textContent = message;
  return empty;
};

const formatSearchValue = (result: SearchPoint): string => {
  if (result.status === "empty") {
    return localize("search_empty_series", "No data");
  }
  if (result.status === "outOfRange") {
    return localize("search_out_of_range", "Out of range");
  }
  return formatNumber(result.y, { digits: 4 });
};

const resolveInitialX = (domain: readonly [number, number] | undefined): number | null => {
  if (!domain) return null;
  const min = Number(domain[0]);
  const max = Number(domain[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return min <= 0 && max >= 0 ? 0 : (min + max) / 2;
};

const formatInputValue = (value: number | null): string =>
  value === null ? "" : String(Number(value.toPrecision(12)));

const parseSearchX = (value: string): number | null => {
  const text = value.trim();
  if (!text) return null;
  const x = Number(text);
  return Number.isFinite(x) ? x : null;
};

const formatDomain = (domain: readonly [number, number] | undefined): string =>
  domain && domain.length >= 2
    ? `${formatDomainNumber(domain[0])} - ${formatDomainNumber(domain[1])}`
    : "";

const formatDomainNumber = (value: number): string =>
  Number.isFinite(value) ? Number(value).toPrecision(4) : "";
