/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { FileId } from "src/cs/workbench/services/session/common/sessionModel";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";

export const IParametersService = createDecorator<IParametersService>("parametersService");
export const ParametersViewId = "workbench.parameters";

export type IonIoffMethod = "auto" | "manual";
export type SsMethod = "auto" | "manual";

export type ParametersState = {
  readonly activeMetricKey: string | null;
  readonly selectedMetricKeys: readonly string[];
  readonly ionIoffMethod: IonIoffMethod;
  readonly ssMethod: SsMethod;
  readonly showFitLine: boolean;
};

export type ParametersViewStateInput = {
  readonly fileId?: FileId | null;
  readonly snapshot: SessionSnapshot;
};

export interface IParametersService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeParametersState: Event<ParametersState>;
  readonly onDidChangeParametersViewState: Event<ParametersViewState>;

  createViewState(input: ParametersViewStateInput): ParametersViewState;
  getState(): ParametersState;
  getViewState(): ParametersViewState;
  updateViewState(input: ParametersViewStateInput): ParametersViewState;
  setIonIoffMethod(method: IonIoffMethod): void;
  setSsMethod(method: SsMethod): void;
  setShowFitLine(showFitLine: boolean): void;
}
