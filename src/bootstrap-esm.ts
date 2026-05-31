import { product, pkg } from "./bootstrap-meta.js";

declare global {
  // eslint-disable-next-line no-var
  var _CONDUCTOR_PRODUCT_JSON: typeof product | undefined;
  // eslint-disable-next-line no-var
  var _CONDUCTOR_PACKAGE_JSON: typeof pkg | undefined;
  // eslint-disable-next-line no-var
  var _CONDUCTOR_FILE_ROOT: string | undefined;
}

globalThis._CONDUCTOR_PRODUCT_JSON = { ...product };
globalThis._CONDUCTOR_PACKAGE_JSON = { ...pkg };
globalThis._CONDUCTOR_FILE_ROOT = import.meta.dirname;

export async function bootstrapESM(): Promise<void> {
  return undefined;
}
