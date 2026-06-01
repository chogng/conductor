import {
  DESKTOP_STORE_UNAVAILABLE,
  requestAnalysisDesktopStore,
} from "src/cs/workbench/services/storage/electron-sandbox/storageService";

const isDesktopStoreUnavailableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === DESKTOP_STORE_UNAVAILABLE;

class AnalysisStoreClient {
  async getDeviceAnalysisTemplates(): Promise<unknown> {
    return this.requestStore("/analysis/templates");
  }

  async createDeviceAnalysisTemplate(template: unknown): Promise<unknown> {
    return this.requestStore("/analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id: string): Promise<unknown> {
    return this.requestStore(`/analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  async getDeviceAnalysisPersistencePath(): Promise<unknown> {
    return this.requestStore("/analysis/persistence-path");
  }

  async chooseDeviceAnalysisPersistencePath(): Promise<unknown> {
    return this.requestStore(
      "/analysis/persistence-path/choose",
      {
        method: "POST",
      },
    );
  }

  async requestStore<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    try {
      return (await requestAnalysisDesktopStore(endpoint, options)) as T;
    } catch (error) {
      if (isDesktopStoreUnavailableError(error)) {
        throw new Error(
          "Desktop store bridge unavailable. Device Analysis data is persisted only via desktop config.json and template.json.",
        );
      }

      throw error;
    }
  }
}

export const analysisStoreClient = new AnalysisStoreClient();
