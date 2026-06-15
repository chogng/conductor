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
import { isAutoTemplateId } from "src/cs/workbench/services/template/common/autoTemplate";
import { filterUserTemplateRecords } from "src/cs/workbench/services/template/common/templateRecords";
import {
  cloneTemplateConfig,
  createEmptyTemplateConfig,
  type TemplateConfig,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import {
  removeTemplateSelectionsForFiles,
  type TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";
import { ITemplateStoreService } from "src/cs/workbench/services/template/common/templateStore";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";

export class BrowserTemplateService extends Disposable implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplateStateEmitter = this._register(new Emitter<TemplateState>());
  public readonly onDidChangeTemplateState = this.onDidChangeTemplateStateEmitter.event;
  private readonly onDidChangeTemplateViewInputEmitter =
    this._register(new Emitter<void>());
  public readonly onDidChangeTemplateViewInput =
    this.onDidChangeTemplateViewInputEmitter.event;

  private state: TemplateState = createDefaultTemplateState();
  private viewInput: TemplateViewInput | null = null;

  public constructor(
    @ISessionService private readonly sessionService: ISessionService,
    @ITemplateStoreService private readonly templateStoreService: ITemplateStoreService,
  ) {
    super();

    this._register(this.sessionService.onDidChangeSession(this.handleSessionChanged));
  }

  downloadTemplateBundle(bundle: unknown): string {
    return downloadTemplateBundle(bundle);
  }

  selectTemplate(template: TemplateRecord | null = null): boolean {
    const stopOnError = getTemplateStopOnError(template, this.state.formState.stopOnError);
    if (!template) {
      this.updateState({
        selectedTemplateId: null,
        formState: createEmptyTemplateConfig({
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
        formState: createEmptyTemplateConfig({
          stopOnError,
        }),
        mode: "management",
      });
      return true;
    }

    this.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateConfig(template),
      mode: "management",
    });
    return true;
  }

  createTemplateDraft(template: Partial<TemplateConfig> | null = null): void {
    this.updateState({
      selectedTemplateId: null,
      formState: createEmptyTemplateConfig({
        stopOnError: getTemplateStopOnError(template, this.state.formState.stopOnError),
      }),
      mode: "editing",
    });
  }

  editTemplate(template: TemplateRecord): boolean {
    const templateId = getTemplateId(template);
    if (!templateId) {
      return false;
    }

    this.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateConfig(template),
      mode: "editing",
    });
    return true;
  }

  exportTemplate(template: TemplateRecord | TemplateConfig | null | undefined = this.state.formState): string | null {
    if (!template?.name) {
      return null;
    }

    return this.downloadTemplateBundle({
      version: 1,
      source: "conductor",
      ...cloneTemplateConfig(template),
    });
  }

  getState(): TemplateState {
    return this.state;
  }

  getViewInput(): TemplateViewInput | null {
    return this.viewInput;
  }

  async getTemplates(): Promise<TemplateRecord[]> {
    const remote = await this.templateStoreService.getTemplates();
    return filterUserTemplateRecords(remote) as TemplateRecord[];
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.templateStoreService.deleteTemplate(id);
    this.markTemplateListChanged();
  }

  async saveTemplate(template: TemplateConfig): Promise<TemplateRecord> {
    const saved = await this.templateStoreService.saveTemplate(template);
    this.markTemplateListChanged();
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
    if (this.viewInput && isSameTemplateViewInput(this.viewInput, input)) {
      return;
    }

    this.viewInput = input;
    this.onDidChangeTemplateViewInputEmitter.fire(undefined);
  }

  private markTemplateListChanged(): void {
    this.updateState({
      templateListVersion: this.state.templateListVersion + 1,
    });
  }

  private readonly handleSessionChanged = (event: SessionChangeEvent): void => {
    if (event.reason === "sessionCleared") {
      if (Object.keys(this.state.selectionsByFileId).length > 0) {
        this.updateState({ selectionsByFileId: {} });
      }
      return;
    }

    if (event.reason !== "filesRemoved" || !event.fileIds?.length) {
      return;
    }

    this.setSelectionsByFileId(previous =>
      removeTemplateSelectionsForFiles(previous, event.fileIds ?? []),
    );
  };
}

const isTemplateRecord = (value: unknown): value is TemplateRecord =>
  Boolean(value) && typeof value === "object";

const getTemplateId = (template: TemplateRecord): string | null => {
  const templateId = String(template.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
};

const getTemplateStopOnError = (
  template: Partial<TemplateConfig> | null,
  fallback: boolean,
): boolean =>
  typeof template?.stopOnError === "boolean"
    ? template.stopOnError
    : fallback;

const createDefaultTemplateState = (): TemplateState => ({
  mode: "management",
  selectedTemplateId: null,
  formState: createEmptyTemplateConfig(),
  selectionsByFileId: {},
  templateListVersion: 0,
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
  current.selectionsByFileId === next.selectionsByFileId &&
  current.templateListVersion === next.templateListVersion;

const isSameTemplateViewInput = (
  current: TemplateViewInput,
  next: TemplateViewInput,
): boolean =>
  areRawFilesEqual(current.rawFiles ?? [], next.rawFiles ?? []);

const areRawFilesEqual = (
  current: NonNullable<TemplateViewInput["rawFiles"]>,
  next: NonNullable<TemplateViewInput["rawFiles"]>,
): boolean =>
  current.length === next.length &&
  current.every((file, index) =>
    file.fileId === next[index]?.fileId &&
    file.fileName === next[index]?.fileName &&
    file.normalizedCsvPath === next[index]?.normalizedCsvPath &&
    file.relativePath === next[index]?.relativePath &&
    file.sourceKey === next[index]?.sourceKey &&
    file.sourcePath === next[index]?.sourcePath &&
    file.sourceVersion === next[index]?.sourceVersion);

registerSingleton(ITemplateServiceId, BrowserTemplateService, InstantiationType.Delayed);
