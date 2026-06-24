/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const AUTO_TEMPLATE_IDS = new Set(["auto"]);

export const isAutoTemplateId = (templateId: unknown): boolean => {
  const normalizedTemplateId = String(templateId ?? "").trim();
  return AUTO_TEMPLATE_IDS.has(normalizedTemplateId);
};
