/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { Event } from "src/cs/base/common/event";
import type {
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";

export type {
  TemplateConfigRecord,
  TemplateInputRecord,
  TemplateRunRecord,
  TemplateSelectionRecord,
} from "src/cs/workbench/services/template/common/templateRun";

export const TemplateAuxiliaryBarViewId = "workbench.template.auxiliarybar";
export const TemplateCommandId = {
  selectTemplate: "template.selectTemplate",
  createTemplate: "template.createTemplate",
  deleteTemplate: "template.deleteTemplate",
  importTemplate: "template.importTemplate",
  editTemplate: "template.editTemplate",
  exportTemplate: "template.exportTemplate",
  applyTemplate: "template.applyTemplate",
  applyTemplateIncremental: "template.applyTemplateIncremental",
  setStopOnError: "template.setStopOnError",
} as const;

export type TemplateCommandId =
  typeof TemplateCommandId[keyof typeof TemplateCommandId];

export type TemplateImportPayloadHandler = (
  payload: unknown,
  options: { fileName: string },
) => Promise<unknown> | unknown;

export type TemplateRecord = Partial<TemplateConfig> &
  Partial<{
    readonly id: string | null;
  }> & {
    readonly [key: string]: unknown;
  };

export type TemplateSaveInput = TemplateConfig &
  Partial<{
    readonly id: string | null;
  }>;

export type TemplateEditorCancelOptions = {
  readonly fallbackTemplate?: TemplateRecord | null;
  readonly stopOnError?: boolean;
};

export type TemplateMode = "management" | "editor";

export type TemplateState = {
  readonly mode: TemplateMode;
  readonly selectedTemplateId: string | null;
  readonly formState: TemplateConfig;
  readonly selectionsByFileId: TemplateSelectionsByFileId;
  readonly templateListVersion: number;
};

export type TemplateStateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type TemplateViewInput = {
  readonly rawFiles?: SessionFile[];
};

export type TemplateApplyWorkflowInput = {
  activeFileId?: string | null;
  hasPendingSourceFiles?: boolean;
  processedFileIds?: readonly string[];
  rawFiles?: SessionFile[];
  templateSelection?: TemplateSelection;
  fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  templateRecords?: readonly TemplateRecord[];
};

export type TemplateApplyFileState =
  | { readonly state: "none" }
  | { readonly state: "queued" }
  | { readonly state: "processing" }
  | { readonly state: "ready" }
  | { readonly state: "skipped"; readonly code: string; readonly message: string }
  | { readonly state: "failed"; readonly code: string; readonly message: string };

export const ITemplateService = createDecorator<ITemplateService>("templateService");
export const ITemplateApplyService = createDecorator<ITemplateApplyService>("templateApplyService");
export const ITemplateApplyWorkflowService =
  createDecorator<ITemplateApplyWorkflowService>("templateApplyWorkflowService");

export interface ITemplateService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeTemplateState: Event<TemplateState>;
  readonly onDidChangeTemplateViewInput: Event<void>;

  downloadTemplateBundle(bundle: unknown): string;
  selectTemplate(template?: TemplateRecord | null): boolean;
  createTemplateDraft(template?: Partial<TemplateConfig> | null): void;
  cancelTemplateEditor(options?: TemplateEditorCancelOptions): void;
  editTemplate(template: TemplateRecord): boolean;
  exportTemplate(template?: TemplateRecord | TemplateConfig | null): string | null;
  finishTemplateEditor(template: TemplateRecord): void;
  getCachedTemplates(): readonly TemplateRecord[];
  getTemplates(): Promise<TemplateRecord[]>;
  getState(): TemplateState;
  getViewInput(): TemplateViewInput | null;
  deleteTemplate(id: string): Promise<void>;
  saveTemplate(template: TemplateSaveInput): Promise<TemplateRecord>;
  setMode: TemplateStateSetter<TemplateMode>;
  setSelectedTemplateId: TemplateStateSetter<string | null>;
  setFormState: TemplateStateSetter<TemplateConfig>;
  setFileTemplateSelection(fileId: string, selection: TemplateSelection): void;
  setSelectionsByFileId: TemplateStateSetter<TemplateSelectionsByFileId>;
  updateViewInput(input: TemplateViewInput): void;
}

export interface ITemplateApplyService<
  TProcessingJobOptions = unknown,
  TRuleProcessingJobOptions = unknown,
  TWorkerRef = unknown,
  TWorker = unknown,
> {
  readonly _serviceBrand: undefined;
  startProcessingJob(options: TProcessingJobOptions): void;
  startRuleProcessingJob(options: TRuleProcessingJobOptions): void;
  terminateProcessingWorker(workerRef: TWorkerRef, worker?: TWorker): void;
}

export interface ITemplateApplyWorkflowService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeProcessingStatus: Event<ProcessingStatus>;
  readonly onDidChangeFileStates: Event<readonly string[]>;
  readonly processingStatus: ProcessingStatus;

  applyTemplate(config: Record<string, unknown>): unknown;
  applyTemplateIncremental(config: Record<string, unknown>): unknown;
  getFileApplyStates(): ReadonlyMap<string, TemplateApplyFileState>;
  prioritizeProcessingFile(fileId: string): void;
  update(input: TemplateApplyWorkflowInput): void;
}
