/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  downloadTemplateBundle,
} from "src/cs/workbench/services/template/browser/templateFileTransfer";
import {
  ITemplateService as ITemplateServiceId,
  type ITemplateService,
  type TemplateRecord,
  type TemplateState,
  type TemplateMode,
  type TemplateViewInput,
} from "src/cs/workbench/services/template/common/template";
import { filterUserTemplateRecords } from "src/cs/workbench/services/template/common/templateRecords";
import {
  createEmptyTemplateConfig,
  type TemplateConfig,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { TemplateSelectionsByFileId } from "src/cs/workbench/services/template/common/templateSelection";
import { conductorStoreClient } from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreClient";

export class BrowserTemplateService extends Disposable implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplateStateEmitter = this._register(new Emitter<TemplateState>());
  public readonly onDidChangeTemplateState = this.onDidChangeTemplateStateEmitter.event;
  private readonly onDidChangeTemplateViewInputEmitter =
    this._register(new Emitter<TemplateViewInput | null>());
  public readonly onDidChangeTemplateViewInput =
    this.onDidChangeTemplateViewInputEmitter.event;

  private state: TemplateState = createDefaultTemplateState();
  private viewInput: TemplateViewInput | null = null;

  downloadTemplateBundle(bundle: unknown): string {
    return downloadTemplateBundle(bundle);
  }

  getState(): TemplateState {
    return this.state;
  }

  getViewInput(): TemplateViewInput | null {
    return this.viewInput;
  }

  async getTemplates(): Promise<TemplateRecord[]> {
    const remote = await conductorStoreClient.getTemplates();
    return filterUserTemplateRecords(remote) as TemplateRecord[];
  }

  async deleteTemplate(id: string): Promise<void> {
    await conductorStoreClient.deleteTemplate(id);
  }

  async saveTemplate(template: TemplateConfig): Promise<TemplateRecord> {
    const saved = await conductorStoreClient.createTemplate({
      ...template,
    });
    return isTemplateRecord(saved) ? saved : template;
  }

  readonly setMode = (value: TemplateMode | ((previous: TemplateMode) => TemplateMode)): void => {
    this.updateState({ mode: resolveNext(value, this.state.mode) });
  };

  readonly setSelectedTemplateId = (value: string | null | ((previous: string | null) => string | null)): void => {
    this.updateState({ selectedTemplateId: resolveNext(value, this.state.selectedTemplateId) });
  };

  readonly setFormState = (value: TemplateConfig | ((previous: TemplateConfig) => TemplateConfig)): void => {
    this.updateState({ formState: resolveNext(value, this.state.formState) });
  };

  readonly setSelectionsByFileId = (
    value: TemplateSelectionsByFileId | ((previous: TemplateSelectionsByFileId) => TemplateSelectionsByFileId),
  ): void => {
    this.updateState({ selectionsByFileId: resolveNext(value, this.state.selectionsByFileId) });
  };

  updateState(updates: Partial<TemplateState>): void {
    const nextState: TemplateState = {
      ...this.state,
      ...updates,
    };
    if (isSameTemplateState(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    this.onDidChangeTemplateStateEmitter.fire(nextState);
  }

  updateViewInput(input: TemplateViewInput): void {
    this.viewInput = input;
    this.onDidChangeTemplateViewInputEmitter.fire(input);
  }
}

const isTemplateRecord = (value: unknown): value is TemplateRecord =>
  Boolean(value) && typeof value === "object";

const createDefaultTemplateState = (): TemplateState => ({
  mode: "select",
  selectedTemplateId: null,
  formState: createEmptyTemplateConfig(),
  selectionsByFileId: {},
});

const resolveNext = <T,>(value: T | ((previous: T) => T), previous: T): T =>
  typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;

const isSameTemplateState = (
  current: TemplateState,
  next: TemplateState,
): boolean =>
  current.mode === next.mode &&
  current.selectedTemplateId === next.selectedTemplateId &&
  current.formState === next.formState &&
  current.selectionsByFileId === next.selectionsByFileId;

registerSingleton(ITemplateServiceId, BrowserTemplateService, InstantiationType.Delayed);
