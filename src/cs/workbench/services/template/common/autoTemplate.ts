/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const AUTO_TEMPLATE_ID = "0";
export const AUTO_TEMPLATE_CONFIG_FIELD = "autoExtractionMode";

const LEGACY_AUTO_TEMPLATE_ID = "__auto__";

export const isAutoTemplateId = (templateId: unknown): boolean => {
  const normalizedTemplateId = String(templateId ?? "").trim();
  return normalizedTemplateId === AUTO_TEMPLATE_ID ||
    normalizedTemplateId === LEGACY_AUTO_TEMPLATE_ID;
};

export const isAutoTemplateConfig = (config: unknown): boolean =>
  Boolean(
    config &&
      typeof config === "object" &&
      (config as Record<string, unknown>)[AUTO_TEMPLATE_CONFIG_FIELD],
  );
