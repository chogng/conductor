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
import {
  createProcessedEntryFromFileRecord,
} from "src/cs/workbench/services/session/common/sessionReadModel";

export class ParametersService extends Disposable implements IParametersService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeParametersViewStateEmitter = this._register(new Emitter<ParametersViewState>());
  public readonly onDidChangeParametersViewState = this.onDidChangeParametersViewStateEmitter.event;

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
        fileRecord ? createProcessedEntryFromFileRecord(fileRecord) : null,
        fileRecord,
      );
    }

    return createDefaultParametersViewState();
  }

  public updateViewState(input: ParametersViewStateInput): ParametersViewState {
    const viewState = this.createViewState(input);
    this.viewState = viewState;
    this.onDidChangeParametersViewStateEmitter.fire(viewState);
    return viewState;
  }

}

const createDefaultParametersViewState = (): ParametersViewState => ({
  kind: "empty",
  message: localize("parameters.empty.noData", "No parameter data."),
});

registerSingleton(IParametersService, ParametersService, InstantiationType.Delayed);
