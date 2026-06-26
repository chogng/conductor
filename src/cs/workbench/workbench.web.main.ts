// Web workbench registrations.

//#region --- workbench browser

import "src/cs/workbench/workbench.browser.main.ts";

//#endregion

//#region --- workbench services

import "src/cs/platform/files/common/fileService";
import "src/cs/workbench/services/configuration/browser/configurationService";
import "src/cs/workbench/services/storage/browser/storageService";
import "src/cs/workbench/services/files/browser/fileConverterBackendService.ts";
import "src/cs/workbench/services/parameters/browser/rcCalculationBackendService.ts";
import "src/cs/workbench/services/dialogs/browser/fileDialogService.ts";
import "src/cs/workbench/services/dialogs/browser/dialogService.ts";
import "src/cs/workbench/services/lifecycle/browser/lifecycleService.ts";
import "src/cs/workbench/services/path/browser/pathService.ts";
import "src/cs/workbench/services/update/browser/updateService.ts";

//#endregion
