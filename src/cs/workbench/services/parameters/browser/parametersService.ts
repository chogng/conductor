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
  type IonIoffMethod,
  type IParametersService as IParametersServiceType,
  type ParametersState,
  type ParametersViewStateInput,
  type SsMethod,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  createProcessedEntryFromFileRecord,
} from "src/cs/workbench/services/session/common/sessionReadModel";

export class ParametersService extends Disposable implements IParametersServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeParametersStateEmitter = this._register(new Emitter<ParametersState>());
  public readonly onDidChangeParametersState = this.onDidChangeParametersStateEmitter.event;
  private readonly onDidChangeParametersViewStateEmitter = this._register(new Emitter<ParametersViewState>());
  public readonly onDidChangeParametersViewState = this.onDidChangeParametersViewStateEmitter.event;

  private state: ParametersState = createDefaultParametersState();
  private viewState: ParametersViewState = createDefaultParametersViewState();

  public getState(): ParametersState {
    return this.state;
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

  public setIonIoffMethod(method: IonIoffMethod): void {
    this.updateState({ ionIoffMethod: method });
  }

  public setSsMethod(method: SsMethod): void {
    this.updateState({ ssMethod: method });
  }

  public setShowFitLine(showFitLine: boolean): void {
    this.updateState({ showFitLine });
  }

  private updateState(updates: Partial<ParametersState>): void {
    const nextState: ParametersState = {
      ...this.state,
      ...updates,
    };
    if (isSameParametersState(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    this.onDidChangeParametersStateEmitter.fire(nextState);
  }
}

const createDefaultParametersState = (): ParametersState => ({
  activeMetricKey: null,
  selectedMetricKeys: [],
  ionIoffMethod: "auto",
  ssMethod: "auto",
  showFitLine: true,
});

const createDefaultParametersViewState = (): ParametersViewState => ({
  kind: "empty",
  message: localize("parameters.empty.noData", "No parameter data."),
});

const isSameParametersState = (
  current: ParametersState,
  next: ParametersState,
): boolean =>
  current.activeMetricKey === next.activeMetricKey &&
  current.ionIoffMethod === next.ionIoffMethod &&
  current.ssMethod === next.ssMethod &&
  current.showFitLine === next.showFitLine &&
  current.selectedMetricKeys.length === next.selectedMetricKeys.length &&
  current.selectedMetricKeys.every((key, index) => key === next.selectedMetricKeys[index]);

registerSingleton(IParametersService, ParametersService, InstantiationType.Delayed);
