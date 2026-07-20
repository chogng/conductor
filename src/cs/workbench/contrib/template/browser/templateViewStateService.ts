/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { isAutoTemplateId } from "src/cs/workbench/services/slice/common/templateSelection";
import type {
  TemplateEditorRecord,
} from "src/cs/workbench/services/template/common/template";
import {
  cloneTemplateEditorConfig,
  createEmptyTemplateEditorConfig,
  type TemplateEditorConfig,
} from "src/cs/workbench/services/template/common/templateEditorConfig";
import type { Event } from "src/cs/base/common/event";

export const ITemplateViewStateService =
  createDecorator<ITemplateViewStateService>("templateViewStateService");

export type TemplateEditorCancelOptions = {
  readonly fallbackTemplate?: TemplateEditorRecord | null;
};

export type TemplateMode = "management" | "editor";

export type TemplateState = {
  readonly mode: TemplateMode;
  readonly selectedTemplateId: string | null;
  readonly formState: TemplateEditorConfig;
};

export type TemplateStateSetter<T> = (value: T | ((previous: T) => T)) => void;

export interface ITemplateViewStateService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeTemplateState: Event<TemplateState>;

  selectTemplate(template?: TemplateEditorRecord | null): boolean;
  createTemplateDraft(template?: Partial<TemplateEditorConfig> | null): void;
  cancelTemplateEditor(options?: TemplateEditorCancelOptions): void;
  editTemplate(template: TemplateEditorRecord): boolean;
  finishTemplateEditor(template: TemplateEditorRecord): void;
  getState(): TemplateState;
  setFormState: TemplateStateSetter<TemplateEditorConfig>;
}

export class TemplateViewStateService extends Disposable implements ITemplateViewStateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplateStateEmitter = this._register(new Emitter<TemplateState>());
  public readonly onDidChangeTemplateState = this.onDidChangeTemplateStateEmitter.event;

  private state: TemplateState = createDefaultTemplateState();

  public selectTemplate(template: TemplateEditorRecord | null = null): boolean {
    if (!template) {
      this.updateState({
        selectedTemplateId: null,
        formState: createEmptyTemplateEditorConfig(),
        mode: "management",
      });
      return true;
    }

    const templateId = getTemplateId(template);
    if (!templateId) {
      this.updateState({
        selectedTemplateId: null,
        formState: createEmptyTemplateEditorConfig(),
        mode: "management",
      });
      return true;
    }

    this.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateEditorConfig(template),
      mode: "management",
    });
    return true;
  }

  public createTemplateDraft(template: Partial<TemplateEditorConfig> | null = null): void {
    this.updateState({
      selectedTemplateId: null,
      formState: createEmptyTemplateEditorConfig(),
      mode: "editor",
    });
  }

  public cancelTemplateEditor(options: TemplateEditorCancelOptions = {}): void {
    const fallbackTemplate = options.fallbackTemplate;
    const templateId = fallbackTemplate ? getTemplateId(fallbackTemplate) : null;
    if (fallbackTemplate && templateId) {
      this.updateState({
        selectedTemplateId: templateId,
        formState: cloneTemplateEditorConfig(fallbackTemplate),
        mode: "management",
      });
      return;
    }

    this.updateState({
      selectedTemplateId: null,
      formState: createEmptyTemplateEditorConfig(),
      mode: "management",
    });
  }

  public editTemplate(template: TemplateEditorRecord): boolean {
    const templateId = getTemplateId(template);
    if (!templateId) {
      return false;
    }

    this.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateEditorConfig(template),
      mode: "editor",
    });
    return true;
  }

  public finishTemplateEditor(template: TemplateEditorRecord): void {
    this.updateState({
      selectedTemplateId: getTemplateId(template),
      formState: cloneTemplateEditorConfig(template),
      mode: "management",
    });
  }

  public getState(): TemplateState {
    return this.state;
  }

  public readonly setFormState = (value: TemplateEditorConfig | ((previous: TemplateEditorConfig) => TemplateEditorConfig)): void => {
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

const getTemplateId = (template: TemplateEditorRecord): string | null => {
  const templateId = String(template.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
};

const createDefaultTemplateState = (): TemplateState => ({
  mode: "management",
  selectedTemplateId: null,
  formState: createEmptyTemplateEditorConfig(),
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
