/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { SearchViewPane } from "src/cs/workbench/contrib/search/browser/searchViewPane";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { searchSeriesAtX } from "src/cs/workbench/services/search/browser/searchModel";
import type {
  ISearchService,
  SearchInterpolationMode,
  SearchPlotModel,
  SearchState,
} from "src/cs/workbench/services/search/common/search";

suite("base/browser/workbench/searchViewPane", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("keeps search controls mounted across plot model changes", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const service = new TestSearchService(createSearchPlotModel("a", [0, 2]));
    const pane = new SearchViewPane(service as unknown as ISearchService);
    document.body.append(pane.element);

    const content = pane.element.querySelector(".search_view_content") as HTMLElement | null;
    const input = pane.element.querySelector(".search_input_native") as HTMLInputElement | null;
    assert.ok(content);
    assert.ok(input);
    const searchPane = content.firstElementChild;
    assert.ok(searchPane);

    input.focus();
    const contentMutations = observeChildMutations(content);

    try {
      service.setPlotModel(createSearchPlotModel("b", [2, 4]));
      await Promise.resolve();

      assert.equal(contentMutations.records.length, 0);
      assert.equal(content.firstElementChild, searchPane);
      assert.equal(pane.element.querySelector(".search_input_native"), input);
      assert.equal(document.activeElement, input);
      assert.equal(input.value, "3");
    } finally {
      contentMutations.disconnect();
      pane.dispose();
      service.dispose();
    }
  });

  test("updates search results without replacing the search shell", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const service = new TestSearchService(createSearchPlotModel("a", [0, 2]));
    const pane = new SearchViewPane(service as unknown as ISearchService);
    document.body.append(pane.element);

    const content = pane.element.querySelector(".search_view_content") as HTMLElement | null;
    const body = pane.element.querySelector(".search_results") as HTMLElement | null;
    const input = pane.element.querySelector(".search_input_native") as HTMLInputElement | null;
    assert.ok(content);
    assert.ok(body);
    assert.ok(input);
    const searchPane = content.firstElementChild;
    assert.ok(searchPane);

    const contentMutations = observeChildMutations(content);
    const bodyMutations = observeChildMutations(body);

    try {
      input.value = "1";
      input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
      await Promise.resolve();

      assert.equal(contentMutations.records.length, 0);
      assert.ok(bodyMutations.records.length > 0);
      assert.equal(content.firstElementChild, searchPane);
      assert.equal(pane.element.querySelector(".search_input_native"), input);
    } finally {
      contentMutations.disconnect();
      bodyMutations.disconnect();
      pane.dispose();
      service.dispose();
    }
  });

  test("skips search result DOM work when the effective result signature is unchanged", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const service = new TestSearchService(createSearchPlotModel("a", [0, 2]));
    const pane = new SearchViewPane(service as unknown as ISearchService);
    document.body.append(pane.element);

    const body = pane.element.querySelector(".search_results") as HTMLElement | null;
    assert.ok(body);
    const bodyMutations = observeChildMutations(body);

    try {
      service.fireSearchState();
      await Promise.resolve();

      assert.equal(bodyMutations.records.length, 0);
    } finally {
      bodyMutations.disconnect();
      pane.dispose();
      service.dispose();
    }
  });
});

class TestSearchService extends Disposable {
  private readonly onDidChangeSearchStateEmitter = this._register(new Emitter<SearchState>());
  private readonly onDidChangeSearchPlotModelEmitter = this._register(new Emitter<SearchPlotModel | null>());
  public readonly onDidChangeSearchState = this.onDidChangeSearchStateEmitter.event;
  public readonly onDidChangeSearchPlotModel = this.onDidChangeSearchPlotModelEmitter.event;
  private state = createSearchState();

  constructor(
    private plotModel: SearchPlotModel | null,
  ) {
    super();
  }

  public getState(): SearchState {
    return this.state;
  }

  public getPlotModel(): SearchPlotModel | null {
    return this.plotModel;
  }

  public setPlotModel(model: SearchPlotModel | null): void {
    this.plotModel = model;
    this.onDidChangeSearchPlotModelEmitter.fire(model);
  }

  public setQueryText = (text: string): void => {
    this.state = createSearchState(text, this.state.query.interpolationMode);
    this.onDidChangeSearchStateEmitter.fire(this.state);
  };

  public setInterpolationMode = (mode: SearchInterpolationMode): void => {
    this.state = createSearchState(this.state.query.text, mode);
    this.onDidChangeSearchStateEmitter.fire(this.state);
  };

  public searchPlotModelAtText = (
    model: PlotMainRenderModel | null,
    text: string,
  ) => {
    if (!model) {
      return null;
    }

    const x = Number(text);
    if (!Number.isFinite(x)) {
      return null;
    }

    return searchSeriesAtX(model.seriesList, x, this.state.query.interpolationMode);
  };

  public fireSearchState(): void {
    this.onDidChangeSearchStateEmitter.fire(this.state);
  }
}

const createSearchState = (
  text = "",
  interpolationMode: SearchInterpolationMode = "linear",
): SearchState => ({
  query: {
    caseSensitive: false,
    interpolationMode,
    kinds: ["curve"],
    scope: "curve",
    text,
  },
  selectedResultId: null,
});

const createSearchPlotModel = (
  id: string,
  xDomain: [number, number],
): SearchPlotModel => ({
  panes: [{
    id: "chart",
    model: createPlotMainRenderModel(id, xDomain),
  }],
});

const createPlotMainRenderModel = (
  id: string,
  xDomain: [number, number],
): PlotMainRenderModel => ({
  axisLabels: null,
  pointsCount: 2,
  seriesList: [{
    color: "#0066cc",
    data: [
      { x: xDomain[0], y: 0 },
      { x: xDomain[1], y: 20 },
    ],
    id: `series-${id}`,
    name: `Series ${id}`,
  }],
  xDomain,
  xUnitLabel: "V",
  yDomain: [0, 20],
  yUnitLabel: "A",
});

const observeChildMutations = (
  target: HTMLElement,
): {
  disconnect: () => void;
  records: MutationRecord[];
} => {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((mutations) => {
    records.push(...mutations.filter((mutation) => mutation.type === "childList"));
  });
  observer.observe(target, { childList: true });
  return {
    disconnect: () => observer.disconnect(),
    records,
  };
};
