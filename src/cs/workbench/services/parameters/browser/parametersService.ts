/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  createParametersViewState,
  type ParametersViewState,
} from "src/cs/workbench/services/parameters/common/parameterModel";
import { localize } from "src/cs/nls";
import {
  IParametersService,
  type ParametersViewStateInput,
} from "src/cs/workbench/services/parameters/common/parameters";

export class ParametersService extends Disposable implements IParametersService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeParametersViewStateEmitter = this._register(new Emitter<ParametersViewState>());
  public readonly onDidChangeParametersViewState = this.onDidChangeParametersViewStateEmitter.event;

  private viewStateInputKey: string | null = null;
  private viewState: ParametersViewState = createDefaultParametersViewState();

  constructor() {
    super();
  }

  public getViewState(): ParametersViewState {
    return this.viewState;
  }

  public createViewState(input: ParametersViewStateInput): ParametersViewState {
    const fileId = String(input.fileId ?? "").trim();
    if (fileId) {
      const fileRecord = input.snapshot.filesById[fileId] ?? null;
      return createParametersViewState(
        null,
        fileRecord,
      );
    }

    return createDefaultParametersViewState();
  }

  public updateViewState(input: ParametersViewStateInput): ParametersViewState {
    const inputKey = createParametersViewStateInputKey(input);
    if (this.viewStateInputKey === inputKey) {
      return this.viewState;
    }

    const viewState = this.createViewState(input);
    this.viewStateInputKey = inputKey;
    this.viewState = viewState;
    this.onDidChangeParametersViewStateEmitter.fire(viewState);
    return viewState;
  }

}

const createDefaultParametersViewState = (): ParametersViewState => ({
  kind: "empty",
  message: localize("parameters.empty.noData", "No parameter data."),
});

const createParametersViewStateInputKey = (input: ParametersViewStateInput): string =>
  `${String(input.fileId ?? "").trim()}\0${input.snapshot.sessionVersion}`;

registerSingleton(IParametersService, ParametersService, InstantiationType.Delayed);
