import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import {
  Action2,
  MenuId,
  MenuRegistry,
  registerAction2,
} from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { CLOSE_AUXILIARY_BAR_COMMAND_ID } from "src/cs/workbench/browser/actions/layoutCommands";
import {
  ActivePanelViewContainerContext,
  AuxiliaryBarVisibleContext,
} from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { SHOW_EXPORT_COMMAND_ID } from "src/cs/workbench/services/export/common/export";
import { SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID } from "src/cs/workbench/services/origin/common/origin";
import { SHOW_PARAMETERS_COMMAND_ID } from "src/cs/workbench/services/parameters/common/parameters";
import { SHOW_SEARCH_COMMAND_ID } from "src/cs/workbench/services/search/common/search";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

type AuxiliaryBarTitleMenuItem = {
  readonly commandId: string;
  readonly icon?: LxIcon;
  readonly order: number;
  readonly labelKey: string;
  readonly label: string;
};

const AuxiliaryBarTitleMenuItems: readonly AuxiliaryBarTitleMenuItem[] = [
  {
    commandId: SHOW_SEARCH_COMMAND_ID,
    icon: LxIcon.search,
    order: 0,
    labelKey: "chart.views.search",
    label: "Search",
  },
  {
    commandId: SHOW_EXPORT_COMMAND_ID,
    icon: LxIcon.origin,
    order: 10,
    labelKey: "chart.views.export",
    label: "Export",
  },
  {
    commandId: SHOW_PARAMETERS_COMMAND_ID,
    icon: LxIcon.parameters,
    order: 20,
    labelKey: "chart.views.parameters",
    label: "Parameters",
  },
  {
    commandId: SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID,
    icon: LxIcon.settings,
    order: 30,
    labelKey: "origin.curveSettings.title",
    label: "Origin Settings",
  },
];

registerAction2(class extends Action2 {
  public constructor() {
    super({
      id: CLOSE_AUXILIARY_BAR_COMMAND_ID,
      title: localize("auxiliarybar.close", "Close Secondary Side Bar"),
      category: Categories.View,
      f1: true,
      precondition: AuxiliaryBarVisibleContext.isEqualTo(true),
      metadata: {
        description: localize("auxiliarybar.closeDescription", "Close the secondary side bar."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.AUXILIARYBAR_PART);
  }
});

for (const view of AuxiliaryBarTitleMenuItems) {
  MenuRegistry.appendMenuItem(MenuId.AuxiliaryBarTitle, {
    command: {
      id: view.commandId,
      title: localize(view.labelKey, view.label),
      icon: view.icon,
    },
    group: "navigation",
    order: view.order,
    when: ActivePanelViewContainerContext.isEqualTo(ChartViewContainerId),
  });
}
