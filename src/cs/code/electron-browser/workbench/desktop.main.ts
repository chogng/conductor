// Electron renderer workbench entry imports.

//#region --- workbench

import "src/cs/workbench/workbench.desktop.main";

//#endregion

//#region --- code/electron-browser workbench

import "src/cs/code/electron-browser/workbench/workbench";

//#endregion

//#region --- theme

import { startWorkbenchThemeContribution } from "src/cs/workbench/services/themes/browser/theme.contribution";

startWorkbenchThemeContribution();

//#endregion
