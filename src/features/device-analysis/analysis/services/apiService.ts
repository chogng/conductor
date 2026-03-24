import {
  requestDeviceAnalysisDesktopStore,
  DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE,
} from "../../desktop/deviceAnalysisDesktopStore";

const isDesktopStoreUnavailableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE;

class ApiService {
  async getDeviceAnalysisTemplates(): Promise<unknown> {
    return this._requestDeviceAnalysisStore("/device-analysis/templates");
  }

  async createDeviceAnalysisTemplate(template: unknown): Promise<unknown> {
    return this._requestDeviceAnalysisStore("/device-analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id: string): Promise<unknown> {
    return this._requestDeviceAnalysisStore(`/device-analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  async getDeviceAnalysisSettings(): Promise<unknown> {
    return this._requestDeviceAnalysisStore("/device-analysis/settings");
  }

  async updateDeviceAnalysisSettings(updates: unknown): Promise<unknown> {
    return this._requestDeviceAnalysisStore("/device-analysis/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async getDeviceAnalysisPersistencePath(): Promise<unknown> {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path");
  }

  async updateDeviceAnalysisPersistencePath(pathValue: unknown): Promise<unknown> {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path", {
      method: "PATCH",
      body: JSON.stringify({ path: pathValue ?? "" }),
    });
  }

  async chooseDeviceAnalysisPersistencePath(): Promise<unknown> {
    return this._requestDeviceAnalysisStore(
      "/device-analysis/persistence-path/choose",
      {
        method: "POST",
      },
    );
  }

  async _requestDeviceAnalysisStore<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    try {
      return (await requestDeviceAnalysisDesktopStore(endpoint, options)) as T;
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
