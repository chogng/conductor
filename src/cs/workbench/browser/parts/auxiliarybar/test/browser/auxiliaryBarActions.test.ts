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
  createAuxiliaryBarActions,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import { ParametersCommandId } from "src/cs/workbench/services/parameters/common/parameters";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/browser/parts/auxiliarybar/test/browser/auxiliaryBarActions", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("parameters action uses the parameters command id", () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activeWorkbenchMainPart", "chart");

    const actions = createAuxiliaryBarActions({
      activeView: "parameters",
      contextKeyService,
      menuService,
      mode: "chart",
    });

    assert.ok(actions.some(action =>
      action.id === ParametersCommandId.showParameters && action.checked === true
    ));
  });

  test("filters auxiliary bar title actions by workbench mode context", () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    contextKeyService.setContext("activeWorkbenchMainPart", "table");

    const actions = createAuxiliaryBarActions({
      activeView: "parameters",
      contextKeyService,
      menuService,
      mode: "chart",
    });

    assert.deepEqual(actions, []);
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
