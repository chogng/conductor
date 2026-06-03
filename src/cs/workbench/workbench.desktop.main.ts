// Desktop renderer workbench registrations.

//#region --- platform desktop

import "src/cs/platform/platform.desktop.main.ts";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/workbench.browser.main.ts";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/contextmenu/electron-browser/contextmenuService.ts";
import "src/cs/workbench/services/dialogs/electron-browser/fileDialogService.ts";
import "src/cs/workbench/services/environment/electron-browser/environmentService.ts";
import "src/cs/workbench/services/files/electron-browser/fileService.ts";
import "src/cs/workbench/services/dataFile/electron-browser/dataFileService.ts";
import "src/cs/workbench/services/path/electron-browser/pathService.ts";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/splash/electron-sandbox/splash.contribution.ts";

//#endregion
