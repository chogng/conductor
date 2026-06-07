import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  downloadTemplateBundle,
} from "src/cs/workbench/contrib/template/browser/templateController";
import {
  ITemplateService as ITemplateServiceId,
  type ITemplateService,
  type TemplateRecord,
} from "src/cs/workbench/contrib/template/common/template";
import { filterUserTemplateRecords } from "src/cs/workbench/contrib/template/common/templateRecords";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { conductorStoreClient } from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreClient";

export class BrowserTemplateService implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  downloadTemplateBundle(bundle: unknown): string {
    return downloadTemplateBundle(bundle);
  }

  async getTemplates(): Promise<TemplateRecord[]> {
    const remote = await conductorStoreClient.getTemplates();
    return filterUserTemplateRecords(remote) as TemplateRecord[];
  }

  async deleteTemplate(id: string): Promise<void> {
    await conductorStoreClient.deleteTemplate(id);
  }

  async saveTemplate(template: TemplateConfig): Promise<TemplateRecord> {
    const saved = await conductorStoreClient.createTemplate({
      ...template,
    });
    return isTemplateRecord(saved) ? saved : template;
  }
}

const isTemplateRecord = (value: unknown): value is TemplateRecord =>
  Boolean(value) && typeof value === "object";

registerSingleton(ITemplateServiceId, BrowserTemplateService, InstantiationType.Delayed);
