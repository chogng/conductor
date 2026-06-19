/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import {
  createInputBoxField,
  getInputBoxFieldState,
} from "src/cs/base/browser/ui/inputbox/inputBoxField";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  createSelectBox,
  type SelectBox,
  type SelectBoxOptions,
} from "src/cs/base/browser/ui/selectBox/selectBox";
import { LxIcon } from "src/cs/base/common/lxicon";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import { getPlotColor } from "src/cs/workbench/services/plot/common/plotColors";
import type {
  SearchInterpolationMode,
  SearchPointLookupModel,
  SearchPointLookupPaneId,
  SearchPointLookupPaneModel,
  SearchPoint,
  SearchState,
} from "src/cs/workbench/services/search/common/search";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";

export type SearchViewInput = {
  readonly model: SearchPointLookupModel | null;
  readonly searchState: SearchState;
  readonly onQueryTextChange: (text: string) => void;
  readonly onSearchPointsAtText: (
    model: PlotMainRenderModel | null,
    text: string,
  ) => readonly SearchPoint[] | null;
  readonly onInterpolationModeChange: (mode: SearchInterpolationMode) => void;
};

export type SearchViewElement = HTMLElement & {
  readonly dispose: () => void;
  readonly update: (input: SearchViewInput) => void;
};

export const createSearchView = (input: SearchViewInput): SearchViewElement =>
  new SearchViewController(input).element;

class SearchViewController {
  private readonly store = new DisposableStore();
  private readonly section = document.createElement("section") as SearchViewElement;
  private readonly inputField = createInputBoxField({
    ariaLabel: localize("search.xInput", "X value"),
    className: "search_input",
    disabled: true,
    inputClassName: "search_input_native",
    type: "text",
    value: "",
  });
  private readonly input = this.inputField.input;
  private readonly algorithmSelect: SelectBox<SearchInterpolationMode>;
  private readonly summary = document.createElement("span");
  private readonly body = document.createElement("div");
  private currentInput: SearchViewInput;
  private bodyRenderSignature = "";
  private readonly collapsedPaneIds = new Set<SearchPointLookupPaneId>();
  private interpolationSelectSignature = "";

  constructor(input: SearchViewInput) {
    this.currentInput = input;
    this.section.className = "search_pane";
    this.section.setAttribute("aria-label", localize("search.heading", "Search"));
    Object.defineProperties(this.section, {
      dispose: {
        value: (): void => this.dispose(),
      },
      update: {
        value: (nextInput: SearchViewInput): void => this.update(nextInput),
      },
    });

    const control = document.createElement("div");
    control.className = "search_control";

    const label = document.createElement("span");
    label.className = "search_label";
    label.textContent = localize("search.xInput", "X value");
    this.input.inputMode = "decimal";

    const algorithmLabel = document.createElement("span");
    algorithmLabel.className = "search_label";
    algorithmLabel.textContent = localize("search.interpolation.label", "Interpolation algorithm");

    this.algorithmSelect = this.store.add(createSelectBox(
      this.createInterpolationSelectOptions(true, input.searchState.query.interpolationMode),
    ));

    this.summary.className = "search_summary";
    this.body.className = "search_results";
    control.append(label, this.inputField.element, algorithmLabel, this.algorithmSelect.domNode, this.summary);
    this.section.append(control, this.body);

    this.store.add(addDisposableListener(this.input, EventType.INPUT, () => {
      this.currentInput.onQueryTextChange(this.input.value);
      this.renderSearchResults();
    }));

    this.update(input);
  }

  public get element(): SearchViewElement {
    return this.section;
  }

  private update(input: SearchViewInput): void {
    this.currentInput = input;
    const primaryModel = getPrimarySearchModel(input.model);
    this.syncInput(primaryModel, input.searchState);
    this.syncInterpolationSelect(!primaryModel, input.searchState.query.interpolationMode);
    this.syncSummary(primaryModel);
    this.renderSearchResults();
  }

  private syncInput(
    primaryModel: PlotMainRenderModel | null,
    searchState: SearchState,
  ): void {
    const disabled = !primaryModel;
    this.input.disabled = disabled;
    this.inputField.field.dataset.state = getInputBoxFieldState({ disabled });
    const nextValue = primaryModel ? getSearchInputValue(searchState, primaryModel) : "";
    if (this.input.value !== nextValue) {
      this.input.value = nextValue;
    }
  }

  private syncInterpolationSelect(
    disabled: boolean,
    value: SearchInterpolationMode,
  ): void {
    const signature = `${disabled ? "disabled" : "enabled"}:${value}`;
    if (this.interpolationSelectSignature === signature) {
      return;
    }

    this.algorithmSelect.update(this.createInterpolationSelectOptions(disabled, value));
    this.interpolationSelectSignature = signature;
  }

  private syncSummary(primaryModel: PlotMainRenderModel | null): void {
    const nextSummary = primaryModel
      ? localize("search.summary", "{seriesCount} series, {pointsCount} points, X {xDomain}", {
          pointsCount: primaryModel.pointsCount,
          seriesCount: primaryModel.seriesList.length,
          xDomain: formatDomain(primaryModel.xDomain),
        })
      : "";
    if (this.summary.textContent !== nextSummary) {
      this.summary.textContent = nextSummary;
    }
  }

  private renderSearchResults(): void {
    const {
      model,
      onSearchPointsAtText,
    } = this.currentInput;
    const primaryModel = getPrimarySearchModel(model);
    if (!model || !primaryModel) {
      this.replaceBody("empty:model", createSearchEmpty(localize("search.empty.model", "No chart data to search.")));
      return;
    }

    const paneResults = model.panes.map(pane => ({
      pane,
      results: onSearchPointsAtText(pane.model, this.input.value),
    }));
    if (paneResults.some(result => !result.results)) {
      this.replaceBody("empty:invalid", createSearchEmpty(localize("search.invalidX", "Enter a numeric X value.")));
      return;
    }

    const populatedPaneResults = paneResults.filter((result): result is {
      readonly pane: SearchPointLookupPaneModel;
      readonly results: readonly SearchPoint[];
    } => Boolean(result.results?.length));
    if (!populatedPaneResults.length) {
      this.replaceBody("empty:no-series", createSearchEmpty(localize("search.noSeries", "No series available.")));
      return;
    }

    this.replaceBody(
      createSearchResultsSignature(populatedPaneResults),
      ...populatedPaneResults.map(result =>
        createSearchResultSection({
          collapsed: this.collapsedPaneIds.has(result.pane.id),
          onToggle: (paneId, collapsed) => this.setPaneCollapsed(paneId, collapsed),
          pane: result.pane,
          results: result.results,
        }),
      ),
    );
  }

  private replaceBody(signature: string, ...children: Node[]): void {
    if (this.bodyRenderSignature === signature) {
      return;
    }

    this.body.replaceChildren(...children);
    this.bodyRenderSignature = signature;
  }

  private setPaneCollapsed(
    paneId: SearchPointLookupPaneId,
    collapsed: boolean,
  ): void {
    if (collapsed) {
      this.collapsedPaneIds.add(paneId);
      return;
    }
    this.collapsedPaneIds.delete(paneId);
  }

  private createInterpolationSelectOptions(
    disabled: boolean,
    value: SearchInterpolationMode,
  ): SelectBoxOptions<SearchInterpolationMode> {
    return createSearchInterpolationSelectOptions({
      disabled,
      onInterpolationModeChange: mode => {
        this.currentInput.onInterpolationModeChange(mode);
        this.renderSearchResults();
      },
      value,
    });
  }

  private dispose(): void {
    this.store.dispose();
    this.section.replaceChildren();
  }
}

const getPrimarySearchModel = (model: SearchPointLookupModel | null): PlotMainRenderModel | null =>
  model?.panes[0]?.model ?? null;

const getSearchInputValue = (
  searchState: SearchState,
  model: PlotMainRenderModel,
): string => {
  const queryText = searchState.query.text;
  return queryText === "" ? formatInputValue(resolveInitialSearchX(model.xDomain)) : queryText;
};

const createSearchResultSection = ({
  collapsed,
  onToggle,
  pane,
  results,
}: {
  readonly collapsed: boolean;
  readonly onToggle: (paneId: SearchPointLookupPaneId, collapsed: boolean) => void;
  readonly pane: SearchPointLookupPaneModel;
  readonly results: readonly SearchPoint[];
}): HTMLElement => {
  const section = document.createElement("section");
  section.className = "search_result_section";
  section.dataset.collapsed = String(collapsed);
  section.dataset.paneId = pane.id;

  const bodyId = `search_result_section_${pane.id}_body`;
  const title = document.createElement("button");
  title.type = "button";
  title.className = "search_result_section_title";
  title.setAttribute("aria-controls", bodyId);
  title.setAttribute("aria-expanded", String(!collapsed));

  const twisty = document.createElement("span");
  twisty.className = "search_result_section_twisty";
  twisty.setAttribute("aria-hidden", "true");
  twisty.append(createLxIcon({ icon: LxIcon.chevronRight, size: 14 }));

  const label = document.createElement("span");
  label.className = "search_result_section_label";
  label.textContent = getSearchPaneLabel(pane.id);

  const count = document.createElement("span");
  count.className = "search_result_section_count";
  count.textContent = String(results.length);

  const body = document.createElement("div");
  body.id = bodyId;
  body.className = "search_result_section_body";
  body.hidden = collapsed;
  body.append(
    createSearchResultsHeader(),
    ...results.map((result, index) => createSearchResult(result, index)),
  );

  title.addEventListener(EventType.CLICK, () => {
    const nextCollapsed = section.dataset.collapsed !== "true";
    section.dataset.collapsed = String(nextCollapsed);
    title.setAttribute("aria-expanded", String(!nextCollapsed));
    body.hidden = nextCollapsed;
    onToggle(pane.id, nextCollapsed);
  });

  title.append(twisty, label, count);
  section.append(title, body);
  return section;
};

const getSearchPaneLabel = (paneId: SearchPointLookupPaneId): string => {
  if (paneId === "inspector") {
    return localize("search.pane.inspector", "Second order");
  }
  return localize("search.pane.main", "Main chart");
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

const createSearchResultsSignature = (
  paneResults: readonly {
    readonly pane: SearchPointLookupPaneModel;
    readonly results: readonly SearchPoint[];
  }[],
): string => {
  const parts: string[] = [];
  for (const { pane, results } of paneResults) {
    parts.push(pane.id, String(results.length));
    for (const result of results) {
      parts.push(
        result.seriesId,
        result.seriesName,
        result.status,
        String(result.x),
        String(result.y ?? ""),
        String(result.color ?? ""),
      );
    }
  }
  return parts.join("\u001f");
};

const createSearchInterpolationSelectOptions = ({
  disabled,
  onInterpolationModeChange,
  value,
}: {
  readonly disabled: boolean;
  readonly onInterpolationModeChange: (mode: SearchInterpolationMode) => void;
  readonly value: SearchInterpolationMode;
}): SelectBoxOptions<SearchInterpolationMode> => ({
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
