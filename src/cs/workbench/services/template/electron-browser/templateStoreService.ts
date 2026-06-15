/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { conductorStoreClient } from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreClient";
import { ITemplateStoreService } from "src/cs/workbench/services/template/common/templateStore";
import type { TemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";

export class ElectronTemplateStoreService implements ITemplateStoreService {
  public declare readonly _serviceBrand: undefined;

  public getTemplates(): Promise<unknown> {
    return conductorStoreClient.getTemplates();
  }

  public saveTemplate(template: TemplateConfig): Promise<unknown> {
    return conductorStoreClient.createTemplate({ ...template });
  }

  public async deleteTemplate(id: string): Promise<void> {
    await conductorStoreClient.deleteTemplate(id);
  }
}

registerSingleton(ITemplateStoreService, ElectronTemplateStoreService, InstantiationType.Delayed);
