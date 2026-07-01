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
import { ParametersCommandId } from "src/cs/workbench/services/parameters/common/parameters";
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
    contextKeyService.setContext("activeWorkbenchMainPart", "chart");

    const actions = auxiliaryBarPart.updateState({
      activeView: "parameters",
      contextKeyService,
      menuService,
      templateMode: "management",
      visible: true,
      workbenchMainPart: "chart",
    }).actions;

    assert.ok(actions.some(action =>
      action.id === ParametersCommandId.showParameters && action.checked === true
    ));
  });

  test("filters view switch actions by workbench main part context", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activeWorkbenchMainPart", "table");

    const actions = auxiliaryBarPart.updateState({
      activeView: "parameters",
      contextKeyService,
      menuService,
      templateMode: "management",
      visible: true,
      workbenchMainPart: "chart",
    }).actions;

    assert.ok(!actions.some(action => action.id === ParametersCommandId.showParameters));
    assert.deepEqual(actions.map(action => action.id), []);
  });

  test("omits title actions when table auxiliary bar has no view switch actions", () => {
    const disposables = store.add(new DisposableStore());
    const auxiliaryBarPart = disposables.add(new AuxiliaryBarPart());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activeWorkbenchMainPart", "table");

    const actions = auxiliaryBarPart.updateState({
      activeView: "template",
      contextKeyService,
      menuService,
      templateMode: "management",
      visible: true,
      workbenchMainPart: "table",
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
