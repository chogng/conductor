import { toAction, type IAction } from "src/cs/base/common/actions";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import {
  Action2,
  cleanGroupedActions,
  MenuId,
  MenuRegistry,
  registerAction2,
  type IMenuService,
} from "src/cs/platform/actions/common/actions";
import type { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { ActiveWorkbenchMainPartContext } from "src/cs/workbench/browser/contextkeys";
import { AuxiliaryBarVisibleContext } from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
  type WorkbenchMainPart,
} from "src/cs/workbench/services/layout/browser/layoutService";
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
  TemplateViewId,
} from "src/cs/workbench/contrib/template/common/template";
import type { TemplateMode } from "src/cs/workbench/contrib/template/browser/templateViewStateService";

export type AuxiliaryBarView = "template" | "search" | "export" | "parameters" | "settings";
export type TemplateAuxiliaryBarMode = TemplateMode;

const CloseAuxiliaryBarCommandId = "workbench.action.closeAuxiliaryBar";

export type AuxiliaryBarViewDescriptor = {
  readonly id: AuxiliaryBarView;
  readonly commandId?: string;
  readonly icon?: LxIconDefinition;
  readonly workbenchMainPart: WorkbenchMainPart;
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
    workbenchMainPart: "table",
    order: 0,
    viewId: TemplateViewId,
    labelKey: "template.management.title",
    label: "Template Management",
  },
  {
    id: "search",
    commandId: SearchCommandId.showSearch,
    icon: LxIcon.search,
    workbenchMainPart: "chart",
    order: 0,
    viewId: SearchViewId,
    labelKey: "chart.views.search",
    label: "Search",
  },
  {
    id: "export",
    commandId: ExportCommandId.showExport,
    icon: LxIcon.origin,
    workbenchMainPart: "chart",
    order: 10,
    viewId: ExportViewId,
    labelKey: "chart.views.export",
    label: "Export",
  },
  {
    id: "parameters",
    commandId: ParametersCommandId.showParameters,
    icon: LxIcon.parameters,
    workbenchMainPart: "chart",
    order: 20,
    viewId: ParametersViewId,
    labelKey: "chart.views.parameters",
    label: "Parameters",
  },
  {
    id: "settings",
    commandId: OriginCommandId.showExportSettings,
    icon: LxIcon.settings,
    workbenchMainPart: "chart",
    order: 30,
    viewId: OriginExportSettingsViewId,
    labelKey: "origin.curveSettings.title",
    label: "Origin Settings",
  },
];

export const getAuxiliaryBarViews = (
  workbenchMainPart: WorkbenchMainPart,
): readonly AuxiliaryBarViewDescriptor[] =>
  AuxiliaryBarViews.filter((view) => view.workbenchMainPart === workbenchMainPart);

export const getDefaultAuxiliaryBarView = (
  workbenchMainPart: WorkbenchMainPart,
): AuxiliaryBarView | null => {
  if (workbenchMainPart === "chart") {
    return "export";
  }
  if (workbenchMainPart === "table") {
    return "template";
  }
  return null;
};

export const getAuxiliaryBarTitleForWorkbenchMainPart = (
  workbenchMainPart: WorkbenchMainPart,
  templateMode: TemplateAuxiliaryBarMode,
): string => {
  if (workbenchMainPart === "chart") {
    return localize("auxiliarybar.chart.title", "Chart");
  }

  return templateMode === "editor"
    ? localize("template.editor.title", "Template Editor")
    : localize("template.management.title", "Template Management");
};

export const resolveAuxiliaryBarView = (
  view: AuxiliaryBarView,
  workbenchMainPart: WorkbenchMainPart,
): AuxiliaryBarView | null =>
  getAuxiliaryBarViews(workbenchMainPart).some((candidate) => candidate.id === view)
    ? view
    : getDefaultAuxiliaryBarView(workbenchMainPart);

export const createAuxiliaryBarActions = ({
  activeView,
  contextKeyService,
  menuService,
  workbenchMainPart,
}: {
  readonly activeView: AuxiliaryBarView;
  readonly contextKeyService: IContextKeyService;
  readonly menuService: IMenuService;
  readonly workbenchMainPart: WorkbenchMainPart;
}): IAction[] => {
  const viewsByCommandId = new Map(
    getAuxiliaryBarViews(workbenchMainPart)
      .filter((view): view is AuxiliaryBarViewDescriptor & {
        readonly commandId: string;
        readonly icon: LxIconDefinition;
      } => !!view.commandId && !!view.icon)
      .map((view) => [view.commandId, view]),
  );
  return cleanGroupedActions(
    menuService.getMenuActions(MenuId.AuxiliaryBarTitle, contextKeyService),
  ).flatMap((menuAction): IAction[] => {
    const view = viewsByCommandId.get(menuAction.id);
    if (view) {
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

      return [{ ...action, icon: view.icon } satisfies AuxiliaryBarViewSwitchAction];
    }

    if (menuAction.id !== CloseAuxiliaryBarCommandId) {
      return [];
    }

    return [toAction({
      id: menuAction.id,
      label: menuAction.label,
      tooltip: menuAction.tooltip || menuAction.label,
      enabled: menuAction.enabled,
      icon: LxIcon.close,
      run: (...args) => menuAction.run(...args),
    })];
  });
};

export const isAuxiliaryBarViewSwitchAction = (
  action: IAction,
): action is AuxiliaryBarViewSwitchAction =>
  action.class?.split(/\s+/g).includes(AuxiliaryBarViewSwitchActionClass) === true &&
  "icon" in action;

registerAction2(class extends Action2 {
  public constructor() {
    super({
      id: CloseAuxiliaryBarCommandId,
      title: localize("auxiliarybar.close", "Close Secondary Side Bar"),
      category: Categories.View,
      f1: true,
      precondition: AuxiliaryBarVisibleContext,
      metadata: {
        description: localize("auxiliarybar.closeDescription", "Close the secondary side bar."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.AUXILIARYBAR_PART);
  }
});

for (const view of AuxiliaryBarViews) {
  if (view.workbenchMainPart !== "chart" || !view.commandId || !view.icon) {
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

MenuRegistry.appendMenuItem(MenuId.AuxiliaryBarTitle, {
  command: {
    id: CloseAuxiliaryBarCommandId,
    title: localize("auxiliarybar.close", "Close Secondary Side Bar"),
    icon: LxIcon.close,
  },
  group: "navigation",
  order: 100,
});
