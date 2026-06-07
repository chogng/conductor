import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import type { PlotMainRenderModel } from "src/cs/workbench/contrib/plot/browser/plotMainRenderModel";
import { SearchViewId } from "src/cs/workbench/contrib/search/common/search";
import { createSearchView } from "src/cs/workbench/contrib/search/browser/searchView";

import "src/cs/workbench/browser/parts/views/media/views.css";
import "src/cs/workbench/contrib/search/browser/media/search.css";

export class SearchViewPane extends ViewPane {
  private readonly pane = document.createElement("div");
  private readonly content = document.createElement("div");

  constructor() {
    super({
      id: SearchViewId,
      title: localize("search_heading", "Search"),
      className: "auxiliarybar_view_pane search_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.pane.className = "search_view";
    this.content.className = "search_view_content";
    this.pane.append(this.content);
    this.body.append(this.pane);
  }

  renderSearch(model: PlotMainRenderModel | null): void {
    this.content.replaceChildren(createSearchView(model));
  }

  public override dispose(): void {
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }
}
