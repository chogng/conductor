/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const getExcelColumnLabel = (index: number): string => {
  let label = "";
  let nextIndex = index;

  while (nextIndex >= 0) {
    label = String.fromCharCode(65 + (nextIndex % 26)) + label;
    nextIndex = Math.floor(nextIndex / 26) - 1;
  }

  return label;
};
