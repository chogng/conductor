/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { isAutoTemplateId } from "src/cs/workbench/services/template/common/autoTemplate";
import type {
  TemplateApplyPresetRecord,
} from "src/cs/workbench/services/template/common/template";
import {
  cloneTemplateApplyConfig,
  createEmptyTemplateApplyConfig,
  type TemplateApplyConfig,
} from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import type { Event } from "src/cs/base/common/event";

export const ITemplateViewStateService =
  createDecorator<ITemplateViewStateService>("templateViewStateService");

export type TemplateEditorCancelOptions = {
  readonly fallbackTemplate?: TemplateApplyPresetRecord | null;
  readonly stopOnError?: boolean;
};

export type TemplateMode = "management" | "editor";

export type TemplateState = {
  readonly mode: TemplateMode;
  readonly selectedTemplateId: string | null;
  readonly formState: TemplateApplyConfig;
};

export type TemplateStateSetter<T> = (value: T | ((previous: T) => T)) => void;

export interface ITemplateViewStateService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeTemplateState: Event<TemplateState>;

  selectTemplate(template?: TemplateApplyPresetRecord | null): boolean;
  createTemplateDraft(template?: Partial<TemplateApplyConfig> | null): void;
  cancelTemplateEditor(options?: TemplateEditorCancelOptions): void;
  editTemplate(template: TemplateApplyPresetRecord): boolean;
  finishTemplateEditor(template: TemplateApplyPresetRecord): void;
  getState(): TemplateState;
  setFormState: TemplateStateSetter<TemplateApplyConfig>;
}

export class TemplateViewStateService extends Disposable implements ITemplateViewStateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplateStateEmitter = this._register(new Emitter<TemplateState>());
  public readonly onDidChangeTemplateState = this.onDidChangeTemplateStateEmitter.event;

  private state: TemplateState = createDefaultTemplateState();

  public selectTemplate(template: TemplateApplyPresetRecord | null = null): boolean {
    const stopOnError = getTemplateStopOnError(template, this.state.formState.stopOnError);
    if (!template) {
      this.updateState({
        selectedTemplateId: null,
        formState: createEmptyTemplateApplyConfig({
          stopOnError,
        }),
        mode: "management",
      });
      return true;
    }

    const templateId = getTemplateId(template);
    if (!templateId) {
      this.updateState({
        selectedTemplateId: null,
        formState: createEmptyTemplateApplyConfig({
          stopOnError,
        }),
        mode: "management",
      });
      return true;
    }

    this.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateApplyConfig(template),
      mode: "management",
    });
    return true;
  }

  public createTemplateDraft(template: Partial<TemplateApplyConfig> | null = null): void {
    this.updateState({
      selectedTemplateId: null,
      formState: createEmptyTemplateApplyConfig({
        stopOnError: getTemplateStopOnError(template, this.state.formState.stopOnError),
      }),
      mode: "editor",
    });
  }

  public cancelTemplateEditor(options: TemplateEditorCancelOptions = {}): void {
    const fallbackTemplate = options.fallbackTemplate;
    const templateId = fallbackTemplate ? getTemplateId(fallbackTemplate) : null;
    if (fallbackTemplate && templateId) {
      this.updateState({
        selectedTemplateId: templateId,
        formState: cloneTemplateApplyConfig(fallbackTemplate),
        mode: "management",
      });
      return;
    }

    const stopOnError = typeof options.stopOnError === "boolean"
      ? options.stopOnError
      : this.state.formState.stopOnError;
    this.updateState({
      selectedTemplateId: null,
      formState: createEmptyTemplateApplyConfig({
        stopOnError,
      }),
      mode: "management",
    });
  }

  public editTemplate(template: TemplateApplyPresetRecord): boolean {
    const templateId = getTemplateId(template);
    if (!templateId) {
      return false;
    }

    this.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateApplyConfig(template),
      mode: "editor",
    });
    return true;
  }

  public finishTemplateEditor(template: TemplateApplyPresetRecord): void {
    this.updateState({
      selectedTemplateId: getTemplateId(template),
      formState: cloneTemplateApplyConfig(template),
      mode: "management",
    });
  }

  public getState(): TemplateState {
    return this.state;
  }

  public readonly setFormState = (value: TemplateApplyConfig | ((previous: TemplateApplyConfig) => TemplateApplyConfig)): void => {
    this.updateState({ formState: resolveNext(value, this.state.formState) });
  };

  private updateState(updates: Partial<TemplateState>): void {
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
}

const getTemplateId = (template: TemplateApplyPresetRecord): string | null => {
  const templateId = String(template.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
};

const getTemplateStopOnError = (
  template: Partial<TemplateApplyConfig> | null,
  fallback: boolean,
): boolean =>
  typeof template?.stopOnError === "boolean"
    ? template.stopOnError
    : fallback;

const createDefaultTemplateState = (): TemplateState => ({
  mode: "management",
  selectedTemplateId: null,
  formState: createEmptyTemplateApplyConfig(),
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
  current.formState === next.formState;

registerSingleton(ITemplateViewStateService, TemplateViewStateService, InstantiationType.Delayed);
