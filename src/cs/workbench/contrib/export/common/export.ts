export const ExportViewId = "workbench.export";

export interface IExportService {
  exportOriginZip(options: unknown): Promise<void>;
  openInOrigin(options: unknown): Promise<void>;
}
