import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import {
  Action2,
  MenuId,
  MenuRegistry,
  registerAction2,
} from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { ActiveWorkbenchMainPartContext } from "src/cs/workbench/browser/contextkeys";
import { AuxiliaryBarVisibleContext } from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
  ExportCommandId,
} from "src/cs/workbench/services/export/common/export";
import {
  OriginCommandId,
} from "src/cs/workbench/services/origin/common/origin";
import {
  ParametersCommandId,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  SearchCommandId,
} from "src/cs/workbench/services/search/common/search";

const CloseAuxiliaryBarCommandId = "workbench.action.closeAuxiliaryBar";

type AuxiliaryBarTitleMenuItem = {
  readonly commandId: string;
  readonly icon?: LxIconDefinition;
  readonly order: number;
  readonly labelKey: string;
  readonly label: string;
};

const AuxiliaryBarTitleMenuItems: readonly AuxiliaryBarTitleMenuItem[] = [
  {
    commandId: SearchCommandId.showSearch,
    icon: LxIcon.search,
    order: 0,
    labelKey: "chart.views.search",
    label: "Search",
  },
  {
    commandId: ExportCommandId.showExport,
    icon: LxIcon.origin,
    order: 10,
    labelKey: "chart.views.export",
    label: "Export",
  },
  {
    commandId: ParametersCommandId.showParameters,
    icon: LxIcon.parameters,
    order: 20,
    labelKey: "chart.views.parameters",
    label: "Parameters",
  },
  {
    commandId: OriginCommandId.showExportSettings,
    icon: LxIcon.settings,
    order: 30,
    labelKey: "origin.curveSettings.title",
    label: "Origin Settings",
  },
];

registerAction2(class extends Action2 {
  public constructor() {
    super({
      id: CloseAuxiliaryBarCommandId,
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
    when: ActiveWorkbenchMainPartContext.isEqualTo("chart"),
  });
}
