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
// Singleton registration keeps the first implementation, so the desktop
// DataResource owner must be installed before browser defaults are imported.
import "src/cs/workbench/services/dataResource/electron-browser/rustDataResourceEvidenceContentService.ts";

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
import "src/cs/workbench/services/configuration/electron-browser/configurationService.ts";
import "src/cs/workbench/services/decorations/browser/decorationsService";
import "src/cs/workbench/services/dialogs/electron-browser/fileDialogService.ts";
import "src/cs/workbench/services/environment/electron-browser/environmentService.ts";
import "src/cs/workbench/services/files/electron-browser/elevatedFileService.ts";
import "src/cs/workbench/services/storage/electron-browser/storageService.ts";
import "src/cs/platform/files/electron-browser/fileService.ts";
import "src/cs/workbench/services/parameters/electron-browser/rcCalculationBackendService.ts";
import "src/cs/workbench/services/path/electron-browser/pathService.ts";
import "src/cs/workbench/services/tableFile/electron-browser/nativeTableFileService.ts";
import "src/cs/workbench/services/update/electron-browser/updateService.ts";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/files/electron-browser/fileActions.contribution.ts";
import "src/cs/workbench/contrib/update/browser/update.contribution.ts";
import "src/cs/workbench/electron-browser/parts/dialogs/dialog.contribution.ts";
import "src/cs/workbench/contrib/splash/electron-sandbox/splash.contribution.ts";

//#endregion
