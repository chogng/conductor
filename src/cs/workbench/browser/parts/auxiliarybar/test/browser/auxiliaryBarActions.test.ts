/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import {
  AuxiliaryBarPart,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import { ParametersViewContainerId } from "src/cs/workbench/services/parameters/common/parameters";
import { SearchViewContainerId } from "src/cs/workbench/services/search/common/search";
import {
  type ViewContainer,
  ViewContainerLocation,
} from "src/cs/workbench/common/views";
import type {
  IViewContainerNavigationState,
  IViewsService,
} from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

await import("src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions");

suite("workbench/browser/parts/auxiliarybar/test/browser/auxiliaryBarActions", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("creates ordered switch actions from active auxiliary view containers", async () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const openCalls: string[] = [];
    const viewsService = createViewsService({
      activeContainerId: ParametersViewContainerId,
      activeContainerIds: [SearchViewContainerId, ParametersViewContainerId],
      containers: [
        createViewContainer(ParametersViewContainerId, "Parameters", LxIcon.parameters, 20),
        createViewContainer(SearchViewContainerId, "Search", LxIcon.search, 0),
      ],
      openCalls,
    });

    const actions = auxiliaryBarPart.updateState({
      templateMode: "management",
      visible: true,
      activePanelViewContainerId: ChartViewContainerId,
      viewsService,
    }).actions;

    assert.deepEqual(actions.map(action => ({
      checked: action.checked,
      id: action.id,
    })), [
      { checked: false, id: SearchViewContainerId },
      { checked: true, id: ParametersViewContainerId },
    ]);

    await actions[0]?.run();
    assert.deepEqual(openCalls, [SearchViewContainerId]);
  });

  test("filters inactive auxiliary view containers", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const viewsService = createViewsService({
      activeContainerId: null,
      activeContainerIds: [],
      containers: [
        createViewContainer(ParametersViewContainerId, "Parameters", LxIcon.parameters, 20),
      ],
    });

    const actions = auxiliaryBarPart.updateState({
      templateMode: "management",
      visible: true,
      activePanelViewContainerId: ChartViewContainerId,
      viewsService,
    }).actions;

    assert.deepEqual(actions.map(action => action.id), []);
  });

  test("omits title actions when table auxiliary bar has no view switch actions", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const viewsService = createViewsService({
      activeContainerId: "workbench.viewContainer.template",
      activeContainerIds: ["workbench.viewContainer.template"],
      containers: [
        createViewContainer("workbench.viewContainer.template", "Template"),
      ],
    });

    const actions = auxiliaryBarPart.updateState({
      templateMode: "management",
      visible: true,
      activePanelViewContainerId: TableViewContainerId,
      viewsService,
    }).actions;

    assert.deepEqual(actions.map(action => action.id), []);
  });
});

function createViewContainer(
  id: string,
  title: string,
  icon?: LxIcon,
  order?: number,
): ViewContainer {
  return {
    id,
    title,
    icon,
    order,
  } as ViewContainer;
}

function createViewsService({
  activeContainerId,
  activeContainerIds,
  containers,
  openCalls = [],
}: {
  readonly activeContainerId: string | null;
  readonly activeContainerIds: readonly string[];
  readonly containers: readonly ViewContainer[];
  readonly openCalls?: string[];
}): Pick<
  IViewsService,
  "getViewContainerNavigationState" | "getViewContainers" | "isViewContainerActive" | "openViewContainer"
> {
  const activeIds = new Set(activeContainerIds);
  return {
    getViewContainerNavigationState: location => ({
      activeViewContainerId: activeContainerId,
      historyIndex: activeContainerId ? 0 : -1,
      historyLength: activeContainerId ? 1 : 0,
      location,
    } satisfies IViewContainerNavigationState),
    getViewContainers: location =>
      location === ViewContainerLocation.AuxiliaryBar ? containers : [],
    isViewContainerActive: id => activeIds.has(id),
    openViewContainer: async id => {
      openCalls.push(id);
      return null;
    },
  };
}

function createFakeDocument(): Pick<Document, "createElement"> {
  const createElement = (() => ({ className: "" }) as HTMLElement) as unknown as Document["createElement"];
  return {
    createElement,
  };
}
