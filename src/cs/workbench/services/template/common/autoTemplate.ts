/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const AUTO_TEMPLATE_APPLY_CONFIG_FIELD = "autoExtractionMode";

const LEGACY_AUTO_TEMPLATE_IDS = new Set(["auto", "0", "__auto__"]);

export const isAutoTemplateId = (templateId: unknown): boolean => {
  const normalizedTemplateId = String(templateId ?? "").trim();
  return LEGACY_AUTO_TEMPLATE_IDS.has(normalizedTemplateId);
};

export const isAutoTemplateApplyConfig = (config: unknown): boolean =>
  Boolean(
    config &&
      typeof config === "object" &&
      (config as Record<string, unknown>)[AUTO_TEMPLATE_APPLY_CONFIG_FIELD],
  );
