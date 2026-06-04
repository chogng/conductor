import { localize } from "src/cs/nls";
import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";
import { locateSeriesAtX, type LocatorPoint } from "src/cs/workbench/contrib/plot/browser/mainPlotLocatorModel";
import type { MainPlotRenderModel } from "src/cs/workbench/contrib/plot/browser/mainPlotRenderModel";
import { getPlotColor } from "src/cs/workbench/contrib/plot/browser/plotColors";

export const createMainPlotLocatorView = (
  model: MainPlotRenderModel,
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "main_plot_locator_pane";
  section.setAttribute("aria-label", localize("chart_locator_heading", "Locator"));

  const header = document.createElement("div");
  header.className = "main_plot_auxiliary_header";
  header.textContent = localize("chart_locator_heading", "Locator");

  const control = document.createElement("label");
  control.className = "main_plot_locator_control";

  const label = document.createElement("span");
  label.className = "main_plot_locator_label";
  label.textContent = localize("chart_locator_x_input", "X value");

  const input = document.createElement("input");
  input.className = "main_plot_locator_input";
  input.type = "number";
  input.step = "any";
  input.value = formatInputValue(resolveInitialX(model.xDomain));
  input.setAttribute("aria-label", localize("chart_locator_x_input", "X value"));

  const summary = document.createElement("span");
  summary.className = "main_plot_locator_summary";
  summary.textContent = localize("chart_locator_summary", "{seriesCount} series, {pointsCount} points, X {xDomain}", {
    pointsCount: model.pointsCount,
    seriesCount: model.seriesList.length,
    xDomain: formatDomain(model.xDomain),
  });

  control.append(label, input, summary);

  const body = document.createElement("div");
  body.className = "main_plot_locator_results";

  const render = () => {
    const x = parseLocatorX(input.value);
    if (x === null) {
      body.replaceChildren(createLocatorEmpty(localize("chart_locator_invalid_x", "Enter a numeric X value.")));
      return;
    }

    const results = locateSeriesAtX(model.seriesList, x);
    if (!results.length) {
      body.replaceChildren(createLocatorEmpty(localize("chart_locator_no_series", "No series available.")));
      return;
    }

    body.replaceChildren(...results.map((result, index) => createLocatorResult(result, index)));
  };

  input.addEventListener("input", render);
  render();

  section.append(header, control, body);
  return section;
};

const createLocatorResult = (result: LocatorPoint, index: number): HTMLElement => {
  const row = document.createElement("div");
  row.className = "main_plot_locator_result";
  row.dataset.status = result.status;

  const swatch = document.createElement("span");
  swatch.className = "main_plot_locator_swatch";
  swatch.style.backgroundColor = result.color || getPlotColor(index);

  const name = document.createElement("span");
  name.className = "main_plot_locator_series";
  name.textContent = result.seriesName;

  const value = document.createElement("span");
  value.className = "main_plot_locator_value";
  value.textContent = formatLocatorValue(result);

  row.append(swatch, name, value);
  return row;
};

const createLocatorEmpty = (message: string): HTMLElement => {
  const empty = document.createElement("div");
  empty.className = "main_plot_locator_empty";
  empty.setAttribute("role", "status");
  empty.textContent = message;
  return empty;
};

const formatLocatorValue = (result: LocatorPoint): string => {
  if (result.status === "empty") {
    return localize("chart_locator_empty_series", "No data");
  }
  if (result.status === "outOfRange") {
    return localize("chart_locator_out_of_range", "Out of range");
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

const parseLocatorX = (value: string): number | null => {
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
