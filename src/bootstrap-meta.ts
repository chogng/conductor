import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface IPackageConfiguration {
  readonly name?: string;
  readonly version?: string;
  readonly build?: {
    readonly appId?: string;
    readonly productName?: string;
  };
}

export interface IProductConfiguration {
  readonly applicationName: string;
  readonly nameShort: string;
  readonly nameLong: string;
  readonly appId: string;
  readonly version: string;
}

export const pkg = require("../package.json") as IPackageConfiguration;

export const product: IProductConfiguration = {
  applicationName: pkg.name ?? "conductor",
  nameShort: pkg.build?.productName ?? "Conductor Studio",
  nameLong: pkg.build?.productName ?? "Conductor Studio",
  appId: pkg.build?.appId ?? "com.conductor.desktop",
  version: pkg.version ?? "0.0.0",
};
