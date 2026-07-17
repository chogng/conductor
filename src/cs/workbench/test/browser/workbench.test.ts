/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import {
  resolveInitialPanelViewContainerId,
  resolveWorkbenchSidebarSurface,
} from "src/cs/workbench/browser/workbench";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

suite("workbench/browser/workbench", () => {
  test("starts in the table panel", () => {
    assert.equal(resolveInitialPanelViewContainerId(), TableViewContainerId);
  });

  test("derives the sidebar surface from panel mode and Explorer layout", () => {
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: TableViewContainerId,
      explorerViewLayout: "tree",
    }), "explorer");
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: ChartViewContainerId,
      explorerViewLayout: "tree",
    }), "explorer");
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: ChartViewContainerId,
      explorerViewLayout: "thumbnail",
    }), "thumbnail");
  });
});
