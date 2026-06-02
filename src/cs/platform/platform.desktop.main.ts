// Desktop renderer platform registrations.

//#region --- platform browser

import "src/cs/platform/platform.browser.main";

//#endregion

//#region --- platform services

import "src/cs/platform/ipc/electron-browser/mainProcessService";
import "src/cs/platform/files/electron-browser/fileService";
import "src/cs/platform/native/electron-browser/nativeHostService";

//#endregion
