/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  createParametersViewState,
  type ParametersFileRecord,
  type ParametersViewState,
} from "src/cs/workbench/services/parameters/common/parameterModel";
import { localize } from "src/cs/nls";
import {
  IParametersService,
  type ParametersViewStateInput,
} from "src/cs/workbench/services/parameters/common/parameters";
import { ISessionService } from "src/cs/workbench/services/session/common/session";

type ResolvedParametersViewStateInput = {
  readonly fileId: string | null;
  readonly fileRecord: ParametersFileRecord | null;
  readonly sessionVersion: number;
};

export class ParametersService extends Disposable implements IParametersService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeParametersViewStateEmitter = this._register(new Emitter<ParametersViewState>());
  public readonly onDidChangeParametersViewState = this.onDidChangeParametersViewStateEmitter.event;

  private viewStateInputKey: string | null = null;
  private viewState: ParametersViewState = createDefaultParametersViewState();

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
  ) {
    super();
  }

  public getViewState(): ParametersViewState {
    return this.viewState;
  }

  public createViewState(input: ParametersViewStateInput): ParametersViewState {
    return this.createViewStateForResolvedInput(this.resolveViewStateInput(input));
  }

  public updateViewState(input: ParametersViewStateInput): ParametersViewState {
    const resolvedInput = this.resolveViewStateInput(input);
    const inputKey = createParametersViewStateInputKey(resolvedInput);
    if (this.viewStateInputKey === inputKey) {
      return this.viewState;
    }

    const viewState = this.createViewStateForResolvedInput(resolvedInput);
    this.viewStateInputKey = inputKey;
    this.viewState = viewState;
    this.onDidChangeParametersViewStateEmitter.fire(viewState);
    return viewState;
  }

  private resolveViewStateInput(input: ParametersViewStateInput): ResolvedParametersViewStateInput {
    const fileId = normalizeParametersFileId(input.fileId);
    const snapshot = this.sessionService.getSnapshot();
    return {
      fileId,
      fileRecord: fileId ? snapshot.filesById[fileId] ?? null : null,
      sessionVersion: snapshot.sessionVersion,
    };
  }

  private createViewStateForResolvedInput(
    input: ResolvedParametersViewStateInput,
  ): ParametersViewState {
    return createParametersViewState(
      null,
      input.fileRecord,
    );
  }

}

const createDefaultParametersViewState = (): ParametersViewState => ({
  kind: "empty",
  message: localize("parameters.empty.noData", "No parameter data."),
});

const normalizeParametersFileId = (fileId: string | null | undefined): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const createParametersViewStateInputKey = (input: ResolvedParametersViewStateInput): string =>
  `${String(input.fileId ?? "")}\0${input.fileId ? String(input.sessionVersion) : ""}`;

registerSingleton(IParametersService, ParametersService, InstantiationType.Delayed);
