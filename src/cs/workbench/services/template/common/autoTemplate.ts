/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const AUTO_TEMPLATE_ID = "__auto__";
export const AUTO_TEMPLATE_CONFIG_FIELD = "autoExtractionMode";

export const isAutoTemplateId = (templateId: unknown): boolean =>
  templateId === AUTO_TEMPLATE_ID;

export const isAutoTemplateConfig = (config: unknown): boolean =>
  Boolean(
    config &&
      typeof config === "object" &&
      (config as Record<string, unknown>)[AUTO_TEMPLATE_CONFIG_FIELD],
  );
