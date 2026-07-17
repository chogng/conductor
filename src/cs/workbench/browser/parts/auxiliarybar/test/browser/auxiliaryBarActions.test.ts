/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { MenuService } from "src/cs/platform/actions/common/menuService";
import {
  AuxiliaryBarPart,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import { SHOW_PARAMETERS_COMMAND_ID } from "src/cs/workbench/contrib/parameters/browser/parametersCommands";
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

  test("parameters action uses the parameters command id", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activePanelViewContainer", ChartViewContainerId);

    const actions = auxiliaryBarPart.updateState({
      activeView: "parameters",
      contextKeyService,
      menuService,
      templateMode: "management",
      visible: true,
      activePanelViewContainerId: ChartViewContainerId,
    }).actions;

    assert.ok(actions.some(action =>
      action.id === SHOW_PARAMETERS_COMMAND_ID && action.checked === true
    ));
  });

  test("filters view switch actions by active panel view container context", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activePanelViewContainer", TableViewContainerId);

    const actions = auxiliaryBarPart.updateState({
      activeView: "parameters",
      contextKeyService,
      menuService,
      templateMode: "management",
      visible: true,
      activePanelViewContainerId: ChartViewContainerId,
    }).actions;

    assert.ok(!actions.some(action => action.id === SHOW_PARAMETERS_COMMAND_ID));
    assert.deepEqual(actions.map(action => action.id), []);
  });

  test("omits title actions when table auxiliary bar has no view switch actions", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activePanelViewContainer", TableViewContainerId);

    const actions = auxiliaryBarPart.updateState({
      activeView: "template",
      contextKeyService,
      menuService,
      templateMode: "management",
      visible: true,
      activePanelViewContainerId: TableViewContainerId,
    }).actions;

    assert.deepEqual(actions.map(action => action.id), []);
  });
});

function createCommandService(): ICommandService {
  return {
    _serviceBrand: undefined,
    onDidExecuteCommand: Event.None as Event<ICommandEvent>,
    onWillExecuteCommand: Event.None as Event<ICommandEvent>,
    executeCommand: async <R = unknown>(): Promise<R | undefined> => undefined,
  };
}

function createFakeDocument(): Pick<Document, "createElement"> {
  const createElement = (() => ({ className: "" }) as HTMLElement) as unknown as Document["createElement"];
  return {
    createElement,
  };
}
