/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createAuxiliaryBarActions,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import { ParametersCommandId } from "src/cs/workbench/services/parameters/common/parameters";

suite("workbench/browser/parts/auxiliarybar/test/browser/auxiliaryBarActions", () => {
  test("parameters action uses the parameters command id", () => {
    const actions = createAuxiliaryBarActions({
      activeView: "parameters",
      mode: "chart",
      onSelect: () => undefined,
    });

    assert.ok(actions.some(action =>
      action.id === ParametersCommandId.showParameters && action.checked === true
    ));
  });
});
