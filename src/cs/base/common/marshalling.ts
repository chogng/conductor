/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { MarshalledId } from "./marshallingIds.js";

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
