/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isAutoTemplateId } from "src/cs/workbench/services/template/common/autoTemplate";

export type UserTemplateApplyPresetRecord = Record<string, unknown> & {
  readonly id?: unknown;
};

const isTemplateApplyPresetRecord = (value: unknown): value is UserTemplateApplyPresetRecord =>
  Boolean(value) && typeof value === "object";

export const filterUserTemplateApplyPresetRecords = (templates: unknown): UserTemplateApplyPresetRecord[] => {
  if (!Array.isArray(templates)) {
    return [];
  }

  return templates.filter((template): template is UserTemplateApplyPresetRecord =>
    isTemplateApplyPresetRecord(template) && !isAutoTemplateId(template.id),
  );
};
