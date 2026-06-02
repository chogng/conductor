import {
  downloadTemplateBundle,
} from "src/cs/workbench/contrib/template/browser/templateController";
import type {
  ITemplateService,
  TemplateRecord,
} from "src/cs/workbench/contrib/template/common/template";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { analysisStoreClient } from "src/cs/workbench/services/storage/electron-sandbox/analysisStoreClient";

export class BrowserTemplateService implements ITemplateService {
  downloadTemplateBundle(bundle: unknown): string {
    return downloadTemplateBundle(bundle);
  }

  async getTemplates(): Promise<TemplateRecord[]> {
    const remote = await analysisStoreClient.getDeviceAnalysisTemplates();
    return Array.isArray(remote) ? remote.filter(isTemplateRecord) : [];
  }

  async deleteTemplate(id: string): Promise<void> {
    await analysisStoreClient.deleteDeviceAnalysisTemplate(id);
  }

  async saveTemplate(template: TemplateConfig): Promise<TemplateRecord> {
    const saved = await analysisStoreClient.createDeviceAnalysisTemplate({
      ...template,
    });
    return isTemplateRecord(saved) ? saved : template;
  }
}

const isTemplateRecord = (value: unknown): value is TemplateRecord =>
  Boolean(value) && typeof value === "object";
