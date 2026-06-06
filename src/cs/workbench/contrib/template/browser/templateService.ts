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
import { storeClient } from "src/cs/workbench/services/storage/electron-sandbox/storeClient";

export class BrowserTemplateService implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  downloadTemplateBundle(bundle: unknown): string {
    return downloadTemplateBundle(bundle);
  }

  async getTemplates(): Promise<TemplateRecord[]> {
    const remote = await storeClient.getTemplates();
    return filterUserTemplateRecords(remote) as TemplateRecord[];
  }

  async deleteTemplate(id: string): Promise<void> {
    await storeClient.deleteTemplate(id);
  }

  async saveTemplate(template: TemplateConfig): Promise<TemplateRecord> {
    const saved = await storeClient.createTemplate({
      ...template,
    });
    return isTemplateRecord(saved) ? saved : template;
  }
}

const isTemplateRecord = (value: unknown): value is TemplateRecord =>
  Boolean(value) && typeof value === "object";

registerSingleton(ITemplateServiceId, BrowserTemplateService, InstantiationType.Delayed);
