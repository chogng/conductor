/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateEditorRecord } from "src/cs/workbench/services/template/common/template";
import { createTemplateEditorRecordFromTemplate } from "src/cs/workbench/services/template/common/templateEditorAdapter";
import type { UserTemplate } from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const createTemplateEditorRecordFromUserTemplate = (
  userTemplate: UserTemplate,
): TemplateEditorRecord => ({
  ...createTemplateEditorRecordFromTemplate(userTemplate.template),
  id: userTemplate.id,
  name: userTemplate.name,
  version: userTemplate.version,
});
