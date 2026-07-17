import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { AuxiliaryBarVisibleContext } from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";

const CLOSE_AUXILIARY_BAR_COMMAND_ID = "workbench.action.closeAuxiliaryBar";

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
