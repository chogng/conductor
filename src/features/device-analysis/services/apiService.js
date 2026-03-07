import { requestDeviceAnalysisDesktopStore, DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE } from "./deviceAnalysisDesktopStore";
import { requestApi } from "../../../services/httpClient";

class ApiService {
  async request(endpoint, options = {}) {
    return requestApi(endpoint, options);
  }

  async getDeviceAnalysisTemplates() {
    return this._requestDeviceAnalysisStore("/device-analysis/templates");
  }

  async createDeviceAnalysisTemplate(template) {
    return this._requestDeviceAnalysisStore("/device-analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id) {
    return this._requestDeviceAnalysisStore(`/device-analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  async getDeviceAnalysisSettings() {
    return this._requestDeviceAnalysisStore("/device-analysis/settings");
  }

  async updateDeviceAnalysisSettings(updates) {
    return this._requestDeviceAnalysisStore("/device-analysis/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async getDeviceAnalysisPersistencePath() {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path");
  }

  async updateDeviceAnalysisPersistencePath(pathValue) {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path", {
      method: "PATCH",
      body: JSON.stringify({ path: pathValue ?? "" }),
    });
  }

  async chooseDeviceAnalysisPersistencePath() {
    return this._requestDeviceAnalysisStore(
      "/device-analysis/persistence-path/choose",
      {
        method: "POST",
      },
    );
  }

  async _requestDeviceAnalysisStore(endpoint, options = {}) {
    try {
      return await requestDeviceAnalysisDesktopStore(endpoint, options);
    } catch (error) {
      if (error?.message === DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE) {
        throw new Error(
          "Desktop store bridge unavailable. Device Analysis data is persisted only via desktop config.json.",
        );
      }

      throw error;
    }
  }
}

export const apiService = new ApiService();
