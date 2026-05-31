// Browser workbench registrations shared by web and desktop renderers.

//#region --- platform browser

import "src/cs/platform/platform.browser.main";

//#endregion

//#region --- workbench common

import "src/cs/workbench/workbench.common.main";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/import/browser/importService";
import "src/cs/workbench/services/lifecycle/browser/lifecycleService";
import "src/cs/workbench/services/origin/browser/originService";

//#endregion

//#region --- base browser styles

import "src/cs/base/browser/browser.main";

//#endregion

//#region --- workbench browser styles

import "src/cs/workbench/browser/media/style.css";
import "src/cs/workbench/browser/parts/previewArea/media/previewpart.css";
import "src/cs/workbench/browser/parts/sidebar/media/sidebarpart.css";
import "src/cs/workbench/browser/parts/titlebar/media/titlebar.css";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/workbench.contributions.main";

//#endregion
