// Browser workbench registrations shared by web and desktop renderers.

//#region --- platform browser

import "src/cs/platform/platform.browser.main";

//#endregion

//#region --- workbench common

import "src/cs/workbench/workbench.common.main";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/assessment/browser/assessmentService";
import "src/cs/workbench/services/lifecycle/browser/lifecycleService";
import "src/cs/workbench/services/chart/browser/chartService";
import "src/cs/workbench/contrib/files/browser/explorerService";
import "src/cs/workbench/services/export/browser/exportService";
import "src/cs/workbench/services/layout/browser/layoutService";
import "src/cs/workbench/services/origin/browser/originService";
import "src/cs/workbench/services/parameters/browser/parametersService";
import "src/cs/workbench/services/plot/browser/plotService";
import "src/cs/workbench/services/search/browser/searchService";
import "src/cs/workbench/services/session/browser/sessionService";
import "src/cs/workbench/services/template/browser/templateApplyService";
import "src/cs/workbench/services/template/browser/templateService";
import "src/cs/workbench/services/thumbnail/browser/thumbnailService";
import "src/cs/workbench/services/views/browser/viewDescriptorService";
import "src/cs/workbench/services/views/browser/viewsService";
import "src/cs/workbench/services/table/browser/tableService";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/browser/style";
import "src/cs/workbench/browser/parts/titlebar/titlebarPart";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/workbench.contributions.main";

//#endregion
