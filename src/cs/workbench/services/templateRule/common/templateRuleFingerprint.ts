/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateDerivationRule } from "src/cs/workbench/services/templateRule/common/templateRule";

export const createTemplateRuleSetFingerprint = (
  rules: readonly TemplateDerivationRule[],
): string => hashString(stableStringify(rules));

export const stableStringify = (value: unknown): string =>
  JSON.stringify(sortJsonValue(value));

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) {
      result[key] = sortJsonValue(entry);
    }
  }
  return result;
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `rule:${(hash >>> 0).toString(36)}`;
};
