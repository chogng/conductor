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
  readonly dataFolderName: string;
  readonly portable?: string;
  readonly version: string;
}

let pkgObj: IPackageConfiguration & { BUILD_INSERT_PACKAGE_CONFIGURATION?: string } = {
  BUILD_INSERT_PACKAGE_CONFIGURATION: "BUILD_INSERT_PACKAGE_CONFIGURATION",
};
if (pkgObj.BUILD_INSERT_PACKAGE_CONFIGURATION) {
  pkgObj = require("../package.json") as IPackageConfiguration;
}

export const pkg = pkgObj;

export const product: IProductConfiguration = {
  applicationName: pkg.name ?? "conductor",
  nameShort: pkg.build?.productName ?? "Conductor Studio",
  nameLong: pkg.build?.productName ?? "Conductor Studio",
  appId: pkg.build?.appId ?? "com.conductor.desktop",
  dataFolderName: "Conductor Studio",
  portable: "data",
  version: pkg.version ?? "0.0.0",
};
