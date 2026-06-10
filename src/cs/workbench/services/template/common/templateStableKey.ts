/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

export const stableStringify = (value: unknown): string => {
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
