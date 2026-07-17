/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  ParametersViewState,
} from "src/cs/workbench/services/parameters/common/parameterModel";

export const IParametersService = createDecorator<IParametersService>("parametersService");
export const ParametersContributionId = "workbench.contrib.parameters";
export const ParametersViewContainerId = "workbench.viewContainer.parameters";
export const ParametersViewId = "workbench.parameters";

export const SHOW_PARAMETERS_COMMAND_ID = "workbench.action.showParameters";

export type ParametersViewStateInput = {
  readonly fileId?: string | null;
  readonly resource?: URI | null;
  readonly sheetId?: string | null;
};

export interface IParametersService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeParametersViewState: Event<ParametersViewState>;

  createViewState(input: ParametersViewStateInput): ParametersViewState;
  getViewState(): ParametersViewState;
  updateViewState(input: ParametersViewStateInput): ParametersViewState;
}
