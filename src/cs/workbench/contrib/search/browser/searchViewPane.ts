/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { replaceChildrenIfChanged } from "src/cs/base/browser/dom";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  createSearchView,
  type SearchViewElement,
  type SearchViewInput,
} from "src/cs/workbench/contrib/search/browser/searchView";
import {
  ISearchService,
  SearchViewId,
} from "src/cs/workbench/services/search/common/search";

import "src/cs/workbench/browser/parts/views/media/views.css";
import "src/cs/workbench/contrib/search/browser/media/search.css";

export class SearchViewPane extends ViewPane {
  private readonly pane = document.createElement("div");
  private readonly content = document.createElement("div");
  private currentView: SearchViewElement | null = null;

  constructor(
    @ISearchService private readonly searchService: ISearchService,
  ) {
    super({
      id: SearchViewId,
      title: localize("search.heading", "Search"),
      className: "auxiliarybar_view_pane search_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.pane.className = "search_view";
    this.content.className = "search_view_content";
    this.pane.append(this.content);
    this.body.append(this.pane);
    this._register(this.searchService.onDidChangeSearchPointLookupModel(() => {
      this.renderSearch();
    }));
    this._register(this.searchService.onDidChangeSearchState(() => {
      this.renderSearch();
    }));
    this.renderSearch();
  }

  private renderSearch(): void {
    const input = this.createSearchViewInput();
    if (!this.currentView) {
      this.currentView = createSearchView(input);
    } else {
      this.currentView.update(input);
    }
    replaceChildrenIfChanged(this.content, this.currentView);
  }

  private createSearchViewInput(): SearchViewInput {
    return {
      model: this.searchService.getPointLookupModel(),
      onInterpolationModeChange: this.searchService.setInterpolationMode,
      onSearchPointsAtText: (plotModel, text) =>
        this.searchService.searchPointsAtText(plotModel, text),
      searchState: this.searchService.getState(),
      onQueryTextChange: this.searchService.setQueryText,
    };
  }

  public override dispose(): void {
    this.currentView?.dispose?.();
    this.currentView = null;
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }
}
