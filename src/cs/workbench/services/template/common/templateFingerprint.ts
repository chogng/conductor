/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "src/cs/base/common/objects";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export const createTemplateFingerprint = (template: Template): string =>
  `template:${hashString(stableStringify(template))}`;

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};
