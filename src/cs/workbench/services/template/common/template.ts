/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import type { Event } from "src/cs/base/common/event";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export type {
  Template,
  TemplateApplicability,
  TemplateAxisBinding,
  TemplateBlock,
  TemplateColumnRange,
  TemplateLegend,
  TemplateRowRange,
  TemplateSegmentation,
  TemplateTitles,
} from "src/cs/workbench/services/template/common/templateSpec";

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

export type TemplateApplyPresetRecord = Partial<TemplateApplyConfig> &
  Partial<{
    readonly id: string | null;
  }> & {
    readonly [key: string]: unknown;
  };

export type TemplateApplyPresetSaveInput = TemplateApplyConfig &
  Partial<{
    readonly id: string | null;
  }>;

export type TemplateSnapshot = {
  readonly version: number;
  readonly templates: readonly Template[];
};

export const ITemplateService = createDecorator<ITemplateService>("templateService");

export interface ITemplateService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeTemplates: Event<readonly TemplateApplyPresetRecord[]>;

  getSnapshot(): TemplateSnapshot;
  getTemplate(id: string): Template | undefined;
  getTemplateList(): readonly TemplateApplyPresetRecord[];
  hasLoadedTemplateList(): boolean;
  refreshTemplates(): Promise<readonly TemplateApplyPresetRecord[]>;
  deleteTemplate(id: string): Promise<void>;
  saveTemplate(template: TemplateApplyPresetSaveInput): Promise<TemplateApplyPresetRecord>;
}
