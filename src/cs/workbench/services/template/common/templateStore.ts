/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";

export const ITemplateStoreService =
  createDecorator<ITemplateStoreService>("templateStoreService");

export interface ITemplateStoreService {
  readonly _serviceBrand: undefined;

  getTemplates(): Promise<unknown>;
  saveTemplate(template: TemplateConfig): Promise<unknown>;
  deleteTemplate(id: string): Promise<void>;
}
