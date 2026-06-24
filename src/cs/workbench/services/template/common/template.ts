/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";

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
