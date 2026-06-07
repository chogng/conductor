// Browser workbench registrations shared by web and desktop renderers.

//#region --- platform browser

import "src/cs/platform/platform.browser.main";

//#endregion

//#region --- workbench common

import "src/cs/workbench/workbench.common.main";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/lifecycle/browser/lifecycleService";
import "src/cs/workbench/services/layout/browser/layoutService";
import "src/cs/workbench/services/origin/browser/originService";
import "src/cs/workbench/services/session/browser/sessionService";
import "src/cs/workbench/services/views/browser/viewDescriptorService";
import "src/cs/workbench/services/views/browser/viewsService";
import "src/cs/workbench/services/views/browser/workbenchViewModeService";
import "src/cs/workbench/contrib/table/browser/tableService";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/browser/style";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/workbench.contributions.main";

//#endregion
