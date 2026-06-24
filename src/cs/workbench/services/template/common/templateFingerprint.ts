/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export const createTemplateFingerprint = (template: Template): string =>
  `template:${hashString(stableStringify(template))}`;

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

const stableStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): JsonLike => {
    if (!input || typeof input !== "object") return input as JsonLike;
    if (seen.has(input)) return null;
    seen.add(input);

    if (Array.isArray(input)) return input.map((item) => normalize(item));

    const out: Record<string, JsonLike> = {};
    for (const key of Object.keys(input).sort()) {
      const record = input as Record<string, unknown>;
      out[key] = normalize(record[key]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};
