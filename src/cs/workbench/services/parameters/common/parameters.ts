/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  ParametersViewState,
} from "src/cs/workbench/services/parameters/common/parameterModel";

export const IParametersService = createDecorator<IParametersService>("parametersService");
export const ParametersContributionId = "workbench.contrib.parameters";
export const ParametersViewContainerId = "workbench.viewContainer.parameters";
export const ParametersViewId = "workbench.parameters";

export const ParametersCommandId = {
	showParameters: "workbench.action.showParameters",
} as const;

export type ParametersCommandId = typeof ParametersCommandId[keyof typeof ParametersCommandId];

export type ParametersViewStateInput = {
  readonly fileId?: string | null;
};

export interface IParametersService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeParametersViewState: Event<ParametersViewState>;

  createViewState(input: ParametersViewStateInput): ParametersViewState;
  getViewState(): ParametersViewState;
  updateViewState(input: ParametersViewStateInput): ParametersViewState;
}
