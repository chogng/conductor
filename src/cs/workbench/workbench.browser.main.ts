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
import "src/cs/workbench/services/table/browser/tableService";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/browser/style";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/workbench.contributions.main";

//#endregion
