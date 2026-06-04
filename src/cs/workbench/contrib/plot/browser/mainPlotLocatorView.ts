import { localize } from "src/cs/nls";
import type { MainPlotModel } from "src/cs/workbench/contrib/plot/browser/mainPlotModel";

export const createMainPlotLocatorView = (
  model: MainPlotModel,
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "main_plot_locator_pane";
  section.setAttribute("aria-label", localize("chart_locator_heading", "Locator"));

  const header = document.createElement("div");
  header.className = "main_plot_auxiliary_header";
  header.textContent = localize("chart_locator_heading", "Locator");

  const body = document.createElement("div");
  body.className = "main_plot_locator_grid";
  body.append(
    createLocatorMetric(localize("analysis.seriesCount", "Series"), String(model.seriesList.length)),
    createLocatorMetric(localize("analysis.pointsCount", "Points"), String(model.pointsCount)),
    createLocatorMetric(localize("analysis.xDomain", "X domain"), formatDomain(model.xDomain)),
    createLocatorMetric(localize("analysis.yDomain", "Y domain"), formatDomain(model.yDomain)),
  );

  section.append(header, body);
  return section;
};

const createLocatorMetric = (labelText: string, valueText: string): HTMLElement => {
  const item = document.createElement("div");
  item.className = "main_plot_locator_metric";

  const label = document.createElement("div");
  label.className = "main_plot_locator_metric_label";
  label.textContent = labelText;

  const value = document.createElement("div");
  value.className = "main_plot_locator_metric_value";
  value.textContent = valueText;

  item.append(label, value);
  return item;
};

const formatDomain = (domain: readonly [number, number] | undefined): string =>
  domain && domain.length >= 2
    ? `${formatDomainNumber(domain[0])} - ${formatDomainNumber(domain[1])}`
    : "";

const formatDomainNumber = (value: number): string =>
  Number.isFinite(value) ? Number(value).toPrecision(4) : "";
