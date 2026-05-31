export const TemplateContributionId = "workbench.contrib.template";

export const TemplateViewId = "workbench.template";

export type TemplateImportPayloadHandler = (
  payload: unknown,
  options: { fileName: string },
) => Promise<unknown> | unknown;

export interface ITemplateService {
  downloadTemplateBundle(bundle: unknown): string;
  importTemplateFile(
    file: File,
    importTemplatesFromPayload: TemplateImportPayloadHandler,
  ): Promise<void>;
}
