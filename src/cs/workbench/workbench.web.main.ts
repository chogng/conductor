// Web workbench registrations.

//#region --- workbench browser

import "src/cs/workbench/workbench.browser.main.ts";

//#endregion

//#region --- workbench services

import "src/cs/platform/files/common/fileService";
import "src/cs/platform/configuration/browser/configurationService";
import "src/cs/workbench/services/files/browser/fileConverterBackendService.ts";
import "src/cs/workbench/services/table/browser/tableBackendService.ts";
import "src/cs/workbench/services/template/browser/templateProcessingBackendService.ts";
import "src/cs/workbench/services/parameters/browser/rcAnalysisBackendService.ts";
import "src/cs/workbench/services/analysisFile/browser/analysisResourceDisposalService.ts";
import "src/cs/workbench/services/dialogs/browser/fileDialogService.ts";
import "src/cs/workbench/services/lifecycle/browser/lifecycleService.ts";
import "src/cs/workbench/services/path/browser/pathService.ts";

//#endregion
