import assert from "assert";

import {
  createWorkbenchLayoutAuxiliaryBarToggleButton,
  createWorkbenchLayoutSidebarToggleButton,
  WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID,
  WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID,
} from "src/cs/workbench/browser/actions/layoutActions";
import {
  TOGGLE_AUXILIARY_BAR_COMMAND_ID,
  TOGGLE_SIDEBAR_COMMAND_ID,
} from "src/cs/workbench/browser/actions/layoutCommands";

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
      visibleCommandId: TOGGLE_SIDEBAR_COMMAND_ID,
      visibleId: WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID,
      visibleIconId: "layout-sidebar-left-empty",
      visibleIsActive: true,
      hiddenCommandId: TOGGLE_SIDEBAR_COMMAND_ID,
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
      visibleCommandId: TOGGLE_AUXILIARY_BAR_COMMAND_ID,
      visibleId: WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID,
      visibleIconId: "layout-sidebar-right-empty",
      visibleIsActive: true,
      hiddenCommandId: TOGGLE_AUXILIARY_BAR_COMMAND_ID,
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
