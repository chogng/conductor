/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const LEGACY_AUTO_TEMPLATE_IDS = new Set(["auto", "0", "__auto__"]);

export const isAutoTemplateId = (templateId: unknown): boolean => {
  const normalizedTemplateId = String(templateId ?? "").trim();
  return LEGACY_AUTO_TEMPLATE_IDS.has(normalizedTemplateId);
};
