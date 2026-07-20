// Browser workbench registrations shared by web and desktop renderers.

//#region --- platform browser

import "src/cs/base/browser/ui/lxicon/lxiconStyles";
import "src/cs/platform/contextkey/browser/contextKeyService";
import "src/cs/platform/contextview/browser/contextMenuService";
import "src/cs/platform/contextview/browser/contextViewService";
import "src/cs/platform/hover/browser/hoverService";
import "src/cs/platform/languagePacks/browser/languagePacks";
import "src/cs/platform/quickinput/browser/media/quickInput.css";
import "src/cs/platform/quickinput/browser/quickInputService";
import "src/cs/platform/webWorker/browser/webWorkerServiceImpl";

//#endregion

//#region --- workbench common

import "src/cs/workbench/workbench.common.main";

//#endregion

//#region --- workbench services

import "src/cs/workbench/services/appearance/browser/appearanceService";
import "src/cs/workbench/services/lifecycle/browser/lifecycleService";
import "src/cs/workbench/services/chart/browser/chartService";
import "src/cs/workbench/services/dataResource/browser/dataResource.contribution";
import "src/cs/workbench/services/export/browser/exportService";
import "src/cs/workbench/services/layout/browser/layoutService";
import "src/cs/workbench/services/localization/browser/localeService";
import "src/cs/workbench/services/keybinding/browser/keybindingService";
import "src/cs/workbench/services/origin/browser/originService";
import "src/cs/workbench/services/parameters/browser/parametersService";
import "src/cs/workbench/services/plot/browser/plot.contribution";
import "src/cs/workbench/services/progress/browser/progressService";
import "src/cs/workbench/services/settings/browser/settingsService";
import "src/cs/workbench/services/search/browser/searchService";
import "src/cs/workbench/services/schemaProfile/browser/schemaProfileStoreService";
import "src/cs/workbench/services/schemaProfile/browser/schemaProfileService";
import "src/cs/workbench/services/slice/browser/sliceService";
import "src/cs/workbench/services/userDataProfile/browser/userDataProfileResourceService";
import "src/cs/workbench/services/userTemplate/browser/userTemplateStoreService";
import "src/cs/workbench/services/userTemplate/browser/userTemplateService";
import "src/cs/workbench/services/userTemplate/browser/userTemplateImportExportService";
import "src/cs/workbench/services/review/browser/reviewService";
import "src/cs/workbench/services/themes/browser/themeService";
import "src/cs/workbench/services/thumbnail/browser/thumbnailService";
import "src/cs/workbench/services/views/browser/viewDescriptorService";
import "src/cs/workbench/services/views/browser/viewsService";
import "src/cs/workbench/services/workspaces/browser/workspaceService";
import "src/cs/workbench/services/table/common/tableModelResolverService";
import "src/cs/workbench/services/table/browser/tableService";
import "src/cs/workbench/services/table/browser/tableStructureParser.contribution";

//#endregion

//#region --- workbench contrib services

import "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import "src/cs/workbench/contrib/files/browser/explorerService";
import "src/cs/workbench/contrib/template/browser/templateViewStateService";

//#endregion

//#region --- workbench service contributions

import "src/cs/workbench/services/calculation/browser/calculation.contribution";
import "src/cs/workbench/services/slice/browser/slicePriority.contribution";

//#endregion

//#region --- workbench browser

import "src/cs/workbench/browser/style";
import "src/cs/workbench/browser/parts/titlebar/windowTitle";

//#endregion

//#region --- workbench browser contributions

import "src/cs/workbench/browser/actions/layoutActions";
import "src/cs/workbench/browser/actions/windowActions";
import "src/cs/workbench/browser/workbench.contribution";

//#endregion

//#region --- workbench contributions

import "src/cs/workbench/contrib/chart/browser/chart.contribution";
import "src/cs/workbench/contrib/plot/browser/plotExplorerPrefetch";
import "src/cs/workbench/contrib/performance/browser/performance.contribution";
import "src/cs/workbench/contrib/thumbnail/browser/thumbnail.contribution";
import "src/cs/workbench/contrib/sash/browser/sash.contribution";
import "src/cs/workbench/contrib/table/browser/table.contribution";
import "src/cs/workbench/contrib/workspaces/browser/workspaces.contribution";
import "src/cs/workbench/contrib/quickaccess/browser/quickAccess.contribution";
import "src/cs/workbench/contrib/dropOrPasteInto/browser/dropOrPasteInto.contribution";
import "src/cs/workbench/contrib/files/browser/files.contribution";
import "src/cs/workbench/contrib/keybindings/browser/keybindings.contribution";
import "src/cs/workbench/contrib/localization/browser/localization.contribution";
import "src/cs/workbench/contrib/search/browser/search.contribution";
import "src/cs/workbench/contrib/settings/browser/settings.contribution";
import "src/cs/workbench/contrib/slice/browser/slice.contribution";
import "src/cs/workbench/contrib/template/browser/template.contribution";
import "src/cs/workbench/contrib/themes/browser/themes.contribution";
import "src/cs/workbench/contrib/export/browser/export.contribution";
import "src/cs/workbench/contrib/parameters/browser/parameters.contribution";
import "src/cs/workbench/contrib/origin/browser/origin.contribution";

//#endregion
