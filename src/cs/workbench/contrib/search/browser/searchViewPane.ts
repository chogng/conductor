/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createSearchView } from "src/cs/workbench/contrib/search/browser/searchView";
import {
  ISearchService,
  SearchViewId,
  type ISearchService as ISearchServiceType,
} from "src/cs/workbench/services/search/common/search";

import "src/cs/workbench/browser/parts/views/media/views.css";
import "src/cs/workbench/contrib/search/browser/media/search.css";

export class SearchViewPane extends ViewPane {
  private readonly pane = document.createElement("div");
  private readonly content = document.createElement("div");

  constructor(
    @ISearchService private readonly searchService: ISearchServiceType,
  ) {
    super({
      id: SearchViewId,
      title: localize("search_heading", "Search"),
      className: "auxiliarybar_view_pane search_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.pane.className = "search_view";
    this.content.className = "search_view_content";
    this.pane.append(this.content);
    this.body.append(this.pane);
    this._register(this.searchService.onDidChangeSearchPlotModel(() => {
      this.renderSearch();
    }));
    this.renderSearch();
  }

  private renderSearch(): void {
    this.content.replaceChildren(createSearchView({
      model: this.searchService.getPlotModel(),
      onSearchPlotModelAtText: (plotModel, text) =>
        this.searchService.searchPlotModelAtText(plotModel, text),
      searchState: this.searchService.getState(),
      onQueryTextChange: this.searchService.setQueryText,
    }));
  }

  public override dispose(): void {
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }
}
