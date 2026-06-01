// Desktop renderer workbench registrations.

//#region --- platform desktop

import "src/cs/platform/platform.desktop.main.ts";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/workbench.browser.main.ts";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/contextmenu/electron-browser/contextmenuService.ts";
import "src/cs/workbench/services/environment/electron-browser/environmentService.ts";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/splash/electron-sandbox/splash.contribution.ts";
import "src/cs/workbench/electron-browser/actions/windowActions.ts";

//#endregion
