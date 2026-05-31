// Browser workbench entry imports.

//#region --- workbench

import "src/cs/workbench/workbench.web.main";

//#endregion

//#region --- code/browser workbench

import "src/cs/code/browser/workbench/workbench";

//#endregion

//#region --- theme

import { startWorkbenchThemeContribution } from "src/cs/workbench/services/themes/browser/theme.contribution";

startWorkbenchThemeContribution();

//#endregion
