/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateApplyPresetRecord } from "src/cs/workbench/services/template/common/template";
import { createTemplateApplyPresetRecordFromTemplate } from "src/cs/workbench/services/template/common/templateLegacyAdapter";
import type { UserTemplate } from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const createTemplateApplyPresetRecordFromUserTemplate = (
  userTemplate: UserTemplate,
): TemplateApplyPresetRecord => ({
  ...createTemplateApplyPresetRecordFromTemplate(userTemplate.template),
  id: userTemplate.id,
  name: userTemplate.name,
  version: userTemplate.version,
});
