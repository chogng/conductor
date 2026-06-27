/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { MarshalledId } from "./marshallingIds.js";

export interface MarshalledObject {
  readonly $mid: (typeof MarshalledId)[keyof typeof MarshalledId];
}

type MarshalledUint8Array = {
  readonly $mid: typeof MarshalledId.Uint8Array;
  readonly bytes: readonly number[];
};

const isByteArray = (value: unknown): value is readonly number[] =>
  Array.isArray(value) && value.every(item =>
    Number.isInteger(item) &&
    item >= 0 &&
    item <= 255
  );

const isMarshalledUint8Array = (value: unknown): value is MarshalledUint8Array =>
  Boolean(
    value &&
      typeof value === "object" &&
      (value as { readonly $mid?: unknown }).$mid === MarshalledId.Uint8Array &&
      isByteArray((value as { readonly bytes?: unknown }).bytes),
  );

export const transformOutgoingMarshalledValue = (
  value: unknown,
): unknown => {
  if (value instanceof Uint8Array) {
    return {
      $mid: MarshalledId.Uint8Array,
      bytes: Array.from(value),
    } satisfies MarshalledUint8Array;
  }

  return undefined;
};

export const reviveIncomingMarshalledValue = (
  value: unknown,
): unknown => {
  if (isMarshalledUint8Array(value)) {
    return Uint8Array.from(value.bytes);
  }

  return undefined;
};

function transformOutgoingMarshalledValueInTree(value: unknown, depth: number): unknown {
  if (!value || depth > 200) {
    return undefined;
  }

  const marshalled = transformOutgoingMarshalledValue(value);
  if (typeof marshalled !== "undefined") {
    return marshalled;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  let didChange = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const transformed = transformOutgoingMarshalledValueInTree(value[index], depth + 1);
      if (typeof transformed !== "undefined") {
        value[index] = transformed;
        didChange = true;
      }
    }
    return didChange ? value : undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const transformed = transformOutgoingMarshalledValueInTree(record[key], depth + 1);
    if (typeof transformed !== "undefined") {
      record[key] = transformed;
      didChange = true;
    }
  }

  return didChange ? value : undefined;
}

function reviveIncomingMarshalledValueInTree(value: unknown, depth: number): unknown {
  if (!value || depth > 200) {
    return undefined;
  }

  const revived = reviveIncomingMarshalledValue(value);
  if (typeof revived !== "undefined") {
    return revived;
  }

  if (typeof value !== "object" || value instanceof Uint8Array) {
    return undefined;
  }

  let didChange = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const revivedValue = reviveIncomingMarshalledValueInTree(value[index], depth + 1);
      if (typeof revivedValue !== "undefined") {
        value[index] = revivedValue;
        didChange = true;
      }
    }
    return didChange ? value : undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const revivedValue = reviveIncomingMarshalledValueInTree(record[key], depth + 1);
    if (typeof revivedValue !== "undefined") {
      record[key] = revivedValue;
      didChange = true;
    }
  }

  return didChange ? value : undefined;
}

export function transformOutgoingMarshalledValues<T>(value: T): T {
  const transformed = transformOutgoingMarshalledValueInTree(value, 0);
  return (typeof transformed === "undefined" ? value : transformed) as T;
}

export function reviveIncomingMarshalledValues<T>(value: T): T {
  const revived = reviveIncomingMarshalledValueInTree(value, 0);
  return (typeof revived === "undefined" ? value : revived) as T;
}
