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
import "src/cs/workbench/services/export/browser/exportService";
import "src/cs/workbench/services/files/browser/rawTableRowsReaderService";
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

//#region --- workbench contrib services

import "src/cs/workbench/contrib/files/browser/explorerService";

//#endregion

//#region --- workbench service contributions

import "src/cs/workbench/services/calculation/browser/calculation.contribution";
import "src/cs/workbench/services/table/browser/tablePreviewLifecycle.contribution";
import "src/cs/workbench/services/assessment/browser/assessment.contribution";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/browser/style";
import "src/cs/workbench/browser/parts/titlebar/titlebarPart";

//#endregion

//#region --- workbench browser contributions

import "src/cs/workbench/browser/actions/layoutActions";
import "src/cs/workbench/browser/actions/windowActions";
import "src/cs/workbench/browser/workbench.contribution";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/chart/browser/chart.contribution";
import "src/cs/workbench/contrib/thumbnail/browser/thumbnail.contribution";
import "src/cs/workbench/contrib/sash/browser/sash.contribution";
import "src/cs/workbench/contrib/table/browser/table.contribution";
import "src/cs/workbench/contrib/workspaces/browser/workspaces.contribution";
import "src/cs/workbench/contrib/quickaccess/browser/quickAccess.contribution";
import "src/cs/workbench/contrib/commands/browser/commands.contribution";
import "src/cs/workbench/contrib/files/browser/files.contribution";
import "src/cs/workbench/contrib/search/browser/search.contribution";
import "src/cs/workbench/contrib/settings/browser/settings.contribution";
import "src/cs/workbench/contrib/template/browser/template.contribution";
import "src/cs/workbench/contrib/export/browser/export.contribution";
import "src/cs/workbench/contrib/parameters/browser/parameters.contribution";
import "src/cs/workbench/contrib/origin/browser/origin.contribution";

//#endregion
