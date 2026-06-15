// Desktop renderer workbench registrations.

import { mainWindow } from "src/cs/base/browser/window";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";
import { INativeHostService } from "src/cs/platform/native/common/native";
import { NativeHostService } from "src/cs/platform/native/common/nativeHostService";

class DesktopNativeHostService extends NativeHostService {
	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super(mainWindow.conductorWindowId, mainProcessService);
	}
}

//#region --- platform desktop

import "src/cs/platform/ipc/electron-browser/mainProcessService";
import "src/cs/platform/configuration/electron-browser/configurationService";

registerSingleton(
	INativeHostService,
	DesktopNativeHostService,
	InstantiationType.Delayed,
);

//#endregion

//#region --- workbench browser

import "src/cs/workbench/workbench.browser.main.ts";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/contextmenu/electron-browser/contextmenuService.ts";
import "src/cs/workbench/services/dialogs/electron-browser/fileDialogService.ts";
import "src/cs/workbench/services/environment/electron-browser/environmentService.ts";
import "src/cs/platform/files/electron-browser/fileService.ts";
import "src/cs/workbench/services/files/electron-browser/fileConversionService.ts";
import "src/cs/workbench/services/table/electron-browser/tableRowsReader.ts";
import "src/cs/workbench/services/template/electron-browser/templateStoreService.ts";
import "src/cs/workbench/services/template/electron-browser/templateProcessingBackendService.ts";
import "src/cs/workbench/services/parameters/electron-browser/rcCalculationBackendService.ts";
import "src/cs/workbench/services/path/electron-browser/pathService.ts";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/files/electron-browser/fileActions.contribution.ts";
import "src/cs/workbench/contrib/splash/electron-sandbox/splash.contribution.ts";

//#endregion
