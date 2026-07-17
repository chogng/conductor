import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { CLOSE_SIDEBAR_COMMAND_ID } from "src/cs/workbench/browser/actions/layoutCommands";
import { SideBarVisibleContext } from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";

registerAction2(class extends Action2 {
  public constructor() {
    super({
      id: CLOSE_SIDEBAR_COMMAND_ID,
      title: localize("sidebar.close", "Close Primary Side Bar"),
      category: Categories.View,
      f1: true,
      precondition: SideBarVisibleContext.isEqualTo(true),
      metadata: {
        description: localize("sidebar.closeDescription", "Close the primary side bar."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.SIDEBAR_PART);
  }
});
