/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateRuleSnapshot } from "src/cs/workbench/services/templateRule/common/templateRule";

export const ITemplateRuleStoreService =
  createDecorator<ITemplateRuleStoreService>("templateRuleStoreService");

export interface ITemplateRuleStoreService {
  readonly _serviceBrand: undefined;

  getSnapshot(): TemplateRuleSnapshot;
  reload(): Promise<TemplateRuleSnapshot>;
}
