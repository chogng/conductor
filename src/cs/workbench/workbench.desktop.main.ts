// Desktop renderer workbench registrations.

//#region --- platform desktop

import "src/cs/platform/platform.desktop.main";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/workbench.browser.main";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/contextmenu/electron-browser/contextmenuService";
import "src/cs/workbench/services/environment/electron-browser/environmentService";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/splash/electron-sandbox/splash.contribution";

//#endregion
