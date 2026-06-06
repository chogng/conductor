import {
  DESKTOP_STORE_UNAVAILABLE,
  requestDesktopStore,
} from "src/cs/workbench/services/storage/electron-sandbox/storageService";

const isDesktopStoreUnavailableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === DESKTOP_STORE_UNAVAILABLE;

class StoreClient {
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

  async getPersistencePath(): Promise<unknown> {
    return this.requestStore("/persistence-path");
  }

  async choosePersistencePath(): Promise<unknown> {
    return this.requestStore(
      "/persistence-path/choose",
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
      return (await requestDesktopStore(endpoint, options)) as T;
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

export const storeClient = new StoreClient();
