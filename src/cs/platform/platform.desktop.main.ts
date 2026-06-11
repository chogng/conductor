// Desktop renderer platform registrations.

import { mainWindow } from "src/cs/base/browser/window";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService, type IMainProcessService as IMainProcessServiceType } from "src/cs/platform/ipc/common/mainProcessService";
import { INativeHostService } from "src/cs/platform/native/common/native";
import { NativeHostService } from "src/cs/platform/native/common/nativeHostService";

class DesktopNativeHostService extends NativeHostService {
  constructor(
    @IMainProcessService mainProcessService: IMainProcessServiceType,
  ) {
    super(mainProcessService, mainWindow.conductorWindowId);
  }
}

//#region --- platform browser

import "src/cs/platform/platform.browser.main";

//#endregion

//#region --- platform services

import "src/cs/platform/ipc/electron-browser/mainProcessService";
import "src/cs/platform/configuration/electron-browser/configurationService";

//#endregion

registerSingleton(
  INativeHostService,
  DesktopNativeHostService,
  InstantiationType.Delayed,
);
