import { toAction, type IAction } from "src/cs/base/common/actions";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  cleanGroupedActions,
  MenuId,
  MenuRegistry,
  type IMenuService,
} from "src/cs/platform/actions/common/actions";
import type { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import { ActiveWorkbenchMainPartContext } from "src/cs/workbench/browser/contextkeys";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  ExportCommandId,
  ExportViewId,
} from "src/cs/workbench/services/export/common/export";
import {
  OriginCommandId,
  OriginExportSettingsViewId,
} from "src/cs/workbench/services/origin/common/origin";
import {
  ParametersCommandId,
  ParametersViewId,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  SearchCommandId,
  SearchViewId,
} from "src/cs/workbench/services/search/common/search";
import {
  TemplateAuxiliaryBarViewId,
} from "src/cs/workbench/contrib/template/browser/templateIds";
import type { TemplateMode } from "src/cs/workbench/contrib/template/browser/templateViewStateService";

export type AuxiliaryBarView = "template" | "search" | "export" | "parameters" | "settings";
export type AuxiliaryBarMode = WorkbenchMainPart;
export type TemplateAuxiliaryBarMode = TemplateMode;

export type AuxiliaryBarViewDescriptor = {
  readonly id: AuxiliaryBarView;
  readonly commandId?: string;
  readonly icon?: LxIconDefinition;
  readonly mode: AuxiliaryBarMode;
  readonly order: number;
  readonly viewId: string;
  readonly labelKey: string;
  readonly label: string;
};

export const AuxiliaryBarViewSwitchActionClass = "auxiliarybar_view_switch_action";

export type AuxiliaryBarViewSwitchAction = IAction & {
  readonly icon: LxIconDefinition;
};

export const AuxiliaryBarViews: readonly AuxiliaryBarViewDescriptor[] = [
  {
    id: "template",
    mode: "table",
    order: 0,
    viewId: TemplateAuxiliaryBarViewId,
    labelKey: "template.management.title",
    label: "Template Management",
  },
  {
    id: "search",
    commandId: SearchCommandId.showSearch,
    icon: LxIcon.search,
    mode: "chart",
    order: 0,
    viewId: SearchViewId,
    labelKey: "chart.views.search",
    label: "Search",
  },
  {
    id: "export",
    commandId: ExportCommandId.showExport,
    icon: LxIcon.origin,
    mode: "chart",
    order: 10,
    viewId: ExportViewId,
    labelKey: "chart.views.export",
    label: "Export",
  },
  {
    id: "parameters",
    commandId: ParametersCommandId.showParameters,
    icon: LxIcon.parameters,
    mode: "chart",
    order: 20,
    viewId: ParametersViewId,
    labelKey: "chart.views.parameters",
    label: "Parameters",
  },
  {
    id: "settings",
    commandId: OriginCommandId.showExportSettings,
    icon: LxIcon.settings,
    mode: "chart",
    order: 30,
    viewId: OriginExportSettingsViewId,
    labelKey: "origin.curveSettings.title",
    label: "Origin Settings",
  },
];

export const getAuxiliaryBarViews = (
  mode: AuxiliaryBarMode,
): readonly AuxiliaryBarViewDescriptor[] =>
  AuxiliaryBarViews.filter((view) => view.mode === mode);

export const getDefaultAuxiliaryBarView = (
  mode: AuxiliaryBarMode,
): AuxiliaryBarView =>
  mode === "chart" ? "export" : "template";

export const getAuxiliaryBarTitleForMode = (
  mode: AuxiliaryBarMode,
  templateMode: TemplateAuxiliaryBarMode,
): string => {
  if (mode === "chart") {
    return localize("auxiliarybar.chart.title", "Chart");
  }

  return templateMode === "editor"
    ? localize("template.editor.title", "Template Editor")
    : localize("template.management.title", "Template Management");
};

export const getAuxiliaryBarTitle = (mode: AuxiliaryBarMode): string =>
  getAuxiliaryBarTitleForMode(mode, "management");

export const resolveAuxiliaryBarView = (
  view: AuxiliaryBarView,
  mode: AuxiliaryBarMode,
): AuxiliaryBarView =>
  getAuxiliaryBarViews(mode).some((candidate) => candidate.id === view)
    ? view
    : getDefaultAuxiliaryBarView(mode);

export const createAuxiliaryBarActions = ({
  activeView,
  contextKeyService,
  menuService,
  mode,
}: {
  readonly activeView: AuxiliaryBarView;
  readonly contextKeyService: IContextKeyService;
  readonly menuService: IMenuService;
  readonly mode: AuxiliaryBarMode;
}): IAction[] => {
  const viewsByCommandId = new Map(
    getAuxiliaryBarViews(mode)
      .filter((view): view is AuxiliaryBarViewDescriptor & {
        readonly commandId: string;
        readonly icon: LxIconDefinition;
      } => !!view.commandId && !!view.icon)
      .map((view) => [view.commandId, view]),
  );
  if (!viewsByCommandId.size) {
    return [];
  }

  return cleanGroupedActions(
    menuService.getMenuActions(MenuId.AuxiliaryBarTitle, contextKeyService),
  ).flatMap((menuAction) => {
    const view = viewsByCommandId.get(menuAction.id);
    if (!view) {
      return [];
    }

    const label = localize(view.labelKey, view.label);
    const action = toAction({
      id: menuAction.id,
      label,
      tooltip: label,
      class: AuxiliaryBarViewSwitchActionClass,
      enabled: menuAction.enabled,
      checked: activeView === view.id,
      icon: view.icon,
      run: (...args) => menuAction.run(...args),
    });

    return { ...action, icon: view.icon } satisfies AuxiliaryBarViewSwitchAction;
  });
};

export const isAuxiliaryBarViewSwitchAction = (
  action: IAction,
): action is AuxiliaryBarViewSwitchAction =>
  action.class?.split(/\s+/g).includes(AuxiliaryBarViewSwitchActionClass) === true &&
  "icon" in action;

for (const view of AuxiliaryBarViews) {
  if (view.mode !== "chart" || !view.commandId || !view.icon) {
    continue;
  }

  MenuRegistry.appendMenuItem(MenuId.AuxiliaryBarTitle, {
    command: {
      id: view.commandId,
      title: localize(view.labelKey, view.label),
      icon: view.icon,
    },
    group: "navigation",
    order: view.order,
    when: ActiveWorkbenchMainPartContext.isEqualTo("chart"),
  });
}
