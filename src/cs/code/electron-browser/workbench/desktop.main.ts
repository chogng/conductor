// Electron renderer workbench entry imports.

//#region --- workbench

import "src/cs/workbench/workbench.desktop.main";

//#endregion

//#region --- code/electron-browser workbench

import "src/cs/code/electron-browser/workbench/workbench";

//#endregion

//#region --- renderer

import { startThemeThenLoadRenderer } from "src/cs/code/browser/workbench/boot";

startThemeThenLoadRenderer();

//#endregion
