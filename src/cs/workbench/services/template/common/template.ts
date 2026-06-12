/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { Event } from "src/cs/base/common/event";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ITableService } from "src/cs/workbench/services/table/common/table";
import type { TemplateSelectionsByFileId } from "src/cs/workbench/services/template/common/templateSelection";

export type {
  TemplateConfigRecord,
  TemplateInputRecord,
  TemplateRunRecord,
  TemplateSelectionRecord,
} from "src/cs/workbench/services/template/common/templateRun";

export const TemplateAuxiliaryBarViewId = "workbench.template.auxiliarybar";

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

export type TemplateMode = "select" | "save";

export type TemplateState = {
  readonly mode: TemplateMode;
  readonly selectedTemplateId: string | null;
  readonly formState: TemplateConfig;
  readonly selectionsByFileId: TemplateSelectionsByFileId;
};

export type TemplateStateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type TemplateViewInput = {
  readonly conductorSettings?: Record<string, unknown> | null;
  readonly onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  readonly onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
  readonly onUpdateSettings?: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
  readonly rawFiles?: SessionFile[];
  readonly tableService?: Pick<
    ITableService,
    | "clearHighlight"
    | "getSelection"
    | "onDidChangeSelection"
    | "select"
  >;
};

export const ITemplateService = createDecorator<ITemplateService>("templateService");
export const ITemplateApplyService = createDecorator<ITemplateApplyService>("templateApplyService");

export interface ITemplateService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeTemplateState: Event<TemplateState>;
  readonly onDidChangeTemplateViewInput: Event<TemplateViewInput | null>;

  downloadTemplateBundle(bundle: unknown): string;
  getTemplates(): Promise<TemplateRecord[]>;
  getState(): TemplateState;
  getViewInput(): TemplateViewInput | null;
  deleteTemplate(id: string): Promise<void>;
  saveTemplate(template: TemplateConfig): Promise<TemplateRecord>;
  setMode: TemplateStateSetter<TemplateMode>;
  setSelectedTemplateId: TemplateStateSetter<string | null>;
  setFormState: TemplateStateSetter<TemplateConfig>;
  setSelectionsByFileId: TemplateStateSetter<TemplateSelectionsByFileId>;
  updateState(updates: Partial<TemplateState>): void;
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
