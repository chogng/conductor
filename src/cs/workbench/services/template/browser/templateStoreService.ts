/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ITemplateStoreService,
  type TemplateStoreSaveInput,
} from "src/cs/workbench/services/template/common/templateStore";

const getServiceUnavailableMessage = (): string =>
  localize("templateStore.desktopBridgeUnavailable", "Template store desktop bridge unavailable.");

function unavailable(): Promise<never> {
  return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class BrowserTemplateStoreService implements ITemplateStoreService {
  public declare readonly _serviceBrand: undefined;

  public getTemplates(): Promise<unknown> {
    return unavailable();
  }

  public saveTemplate(_template: TemplateStoreSaveInput): Promise<unknown> {
    return unavailable();
  }

  public deleteTemplate(_id: string): Promise<void> {
    return unavailable();
  }
}

registerSingleton(ITemplateStoreService, BrowserTemplateStoreService, InstantiationType.Delayed);
