// Browser workbench entry imports.

//#region --- workbench

import "src/cs/workbench/workbench.web.main";

//#endregion

//#region --- code/browser workbench

import "src/cs/code/browser/workbench/workbench";

//#endregion

//#region --- renderer

import { startThemeThenLoadRenderer } from "src/cs/code/browser/workbench/boot";

startThemeThenLoadRenderer();

//#endregion
