import assert from "assert";

import {
  createWorkbenchLayoutAuxiliaryBarToggleButton,
  createWorkbenchLayoutSidebarToggleButton,
  WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID,
  WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID,
} from "src/cs/workbench/browser/actions/layoutActions";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";

suite("workbench/browser/actions/layoutActions", () => {
  test("creates sidebar toggle button from layout command state", () => {
    const visibleButton = createWorkbenchLayoutSidebarToggleButton(true);
    const hiddenButton = createWorkbenchLayoutSidebarToggleButton(false);

    assert.deepStrictEqual({
      visibleCommandId: visibleButton.commandId,
      visibleId: visibleButton.id,
      visibleIconId: getLayoutTestIconId(visibleButton.icon),
      visibleIsActive: visibleButton.isActive,
      hiddenCommandId: hiddenButton.commandId,
      hiddenId: hiddenButton.id,
      hiddenIconId: getLayoutTestIconId(hiddenButton.icon),
      hiddenIsActive: hiddenButton.isActive,
    }, {
      visibleCommandId: WorkbenchLayoutCommandId.toggleSidebar,
      visibleId: WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID,
      visibleIconId: "layout-sidebar-left-empty",
      visibleIsActive: true,
      hiddenCommandId: WorkbenchLayoutCommandId.toggleSidebar,
      hiddenId: WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID,
      hiddenIconId: "layout-sidebar-left-off-empty",
      hiddenIsActive: false,
    });
  });

  test("creates auxiliary bar toggle button from layout command state", () => {
    const visibleButton = createWorkbenchLayoutAuxiliaryBarToggleButton(true);
    const hiddenButton = createWorkbenchLayoutAuxiliaryBarToggleButton(false);

    assert.deepStrictEqual({
      visibleCommandId: visibleButton.commandId,
      visibleId: visibleButton.id,
      visibleIconId: getLayoutTestIconId(visibleButton.icon),
      visibleIsActive: visibleButton.isActive,
      hiddenCommandId: hiddenButton.commandId,
      hiddenId: hiddenButton.id,
      hiddenIconId: getLayoutTestIconId(hiddenButton.icon),
      hiddenIsActive: hiddenButton.isActive,
    }, {
      visibleCommandId: WorkbenchLayoutCommandId.toggleAuxiliaryBar,
      visibleId: WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID,
      visibleIconId: "layout-sidebar-right-empty",
      visibleIsActive: true,
      hiddenCommandId: WorkbenchLayoutCommandId.toggleAuxiliaryBar,
      hiddenId: WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID,
      hiddenIconId: "layout-sidebar-right-off-empty",
      hiddenIsActive: false,
    });
  });
});

const getLayoutTestIconId = (
  icon: ReturnType<typeof createWorkbenchLayoutSidebarToggleButton>["icon"],
): string | undefined =>
  typeof icon === "function" ? undefined : icon.id;
