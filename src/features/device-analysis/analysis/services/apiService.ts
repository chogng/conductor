import {
  DESKTOP_STORE_UNAVAILABLE,
  requestAnalysisDesktopStore,
} from "../../desktop/desktopStore";

const isDesktopStoreUnavailableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === DESKTOP_STORE_UNAVAILABLE;

class ApiService {
  async getDeviceAnalysisTemplates(): Promise<unknown> {
    return this._requestAnalysisStore("/analysis/templates");
  }

  async createDeviceAnalysisTemplate(template: unknown): Promise<unknown> {
    return this._requestAnalysisStore("/analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id: string): Promise<unknown> {
    return this._requestAnalysisStore(`/analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  async getSettings(): Promise<unknown> {
    return this._requestAnalysisStore("/analysis/settings");
  }

  async updateSettings(updates: unknown): Promise<unknown> {
    return this._requestAnalysisStore("/analysis/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async getDeviceAnalysisPersistencePath(): Promise<unknown> {
    return this._requestAnalysisStore("/analysis/persistence-path");
  }

  async updateDeviceAnalysisPersistencePath(pathValue: unknown): Promise<unknown> {
    return this._requestAnalysisStore("/analysis/persistence-path", {
      method: "PATCH",
      body: JSON.stringify({ path: pathValue ?? "" }),
    });
  }

  async chooseDeviceAnalysisPersistencePath(): Promise<unknown> {
    return this._requestAnalysisStore(
      "/analysis/persistence-path/choose",
      {
        method: "POST",
      },
    );
  }

  async _requestAnalysisStore<T = unknown>(
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

export const apiService = new ApiService();
