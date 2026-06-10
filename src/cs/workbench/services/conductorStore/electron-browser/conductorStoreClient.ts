import {
  CONDUCTOR_STORE_UNAVAILABLE,
  requestConductorStore,
} from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreIpcClient";

const isDesktopStoreUnavailableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === CONDUCTOR_STORE_UNAVAILABLE;

class ConductorStoreClient {
  async getTemplates(): Promise<unknown> {
    return this.requestStore("/templates");
  }

  async createTemplate(template: unknown): Promise<unknown> {
    return this.requestStore("/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteTemplate(id: string): Promise<unknown> {
    return this.requestStore(`/templates/${id}`, {
      method: "DELETE",
    });
  }

  async requestStore<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    try {
      return (await requestConductorStore(endpoint, options)) as T;
    } catch (error) {
      if (isDesktopStoreUnavailableError(error)) {
        throw new Error(
          "Desktop store bridge unavailable. Conductor data is persisted only via desktop config.json and template.json.",
        );
      }

      throw error;
    }
  }
}

export const conductorStoreClient = new ConductorStoreClient();
