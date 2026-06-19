/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IKeybindingService } from "src/cs/platform/keybinding/common/keybinding";
import { IQuickInputService, type QuickPickItem } from "src/cs/platform/quickinput/common/quickInput";

export const KeybindingsCommandId = {
  showConflicts: "workbench.action.showKeybindingConflicts",
} as const;

registerAction2(class ShowKeybindingConflictsAction extends Action2 {
  public constructor() {
    super({
      category: localize("keybindings.commands.category", "Keyboard Shortcuts"),
      f1: true,
      id: KeybindingsCommandId.showConflicts,
      title: localize("keybindings.commands.showConflicts", "Show Keybinding Conflicts"),
      metadata: {
        description: localize("keybindings.commands.showConflicts", "Show Keybinding Conflicts"),
      },
    });
  }

  public async run(accessor: ServicesAccessor): Promise<void> {
    const keybindingService = accessor.get(IKeybindingService);
    const quickInputService = accessor.get(IQuickInputService);
    const conflicts = keybindingService.getKeybindingConflicts();

    const items: QuickPickItem[] = conflicts.length
      ? conflicts.map(conflict => ({
          id: conflict.key,
          label: conflict.key,
          description: localize(
            "keybindings.conflict.commands.count",
            "{0} commands",
            { 0: conflict.commands.length },
          ),
          detail: conflict.commands.join(", "),
        }))
      : [{
          id: "no-conflicts",
          label: localize("keybindings.conflict.none", "No keybinding conflicts"),
        }];

    await quickInputService.pick({
      items,
      placeholder: localize("keybindings.conflict.placeholder", "Keybinding conflicts"),
    });
  }
});
