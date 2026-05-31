import {
  downloadTemplateBundle,
  importTemplateFile,
} from "src/cs/workbench/contrib/template/browser/templateController";
import type {
  ITemplateService,
  TemplateImportPayloadHandler,
} from "src/cs/workbench/contrib/template/common/template";

export class BrowserTemplateService implements ITemplateService {
  downloadTemplateBundle(bundle: unknown): string {
    return downloadTemplateBundle(bundle);
  }

  importTemplateFile(
    file: File,
    importTemplatesFromPayload: TemplateImportPayloadHandler,
  ): Promise<void> {
    return importTemplateFile(file, importTemplatesFromPayload);
  }
}
