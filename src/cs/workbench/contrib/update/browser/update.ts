/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  Action2,
  MenuId,
  MenuRegistry,
  registerAction2,
} from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IUpdateService } from "src/cs/platform/update/common/update";
import {
  CONTEXT_UPDATE_STATE,
} from "src/cs/workbench/contrib/update/common/update";
import type { ReleaseNotesEditor } from "src/cs/workbench/contrib/update/browser/releaseNotesEditor";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";

export const APPLY_UPDATE_COMMAND_ID = "_update.applyupdate";
export const CHECK_FOR_UPDATES_COMMAND_ID = "update.check";
export const UPDATE_CHECKING_COMMAND_ID = "update.checking";
export const DOWNLOAD_UPDATE_COMMAND_ID = "update.downloadNow";
export const UPDATE_DOWNLOADING_COMMAND_ID = "update.downloading";
export const INSTALL_UPDATE_COMMAND_ID = "update.install";
export const RESTART_TO_UPDATE_COMMAND_ID = "update.restart";
export const SHOW_CURRENT_RELEASE_NOTES_COMMAND_ID = "update.showCurrentReleaseNotes";
export const GET_UPDATE_STATE_COMMAND_ID = "_update.state";
export const UPDATE_INSTALLING_COMMAND_ID = "update.updating";

type UpdateReleaseNotesEditor = Pick<ReleaseNotesEditor, "show">;

export const appendUpdateMenuItems = (menuId: MenuId, group: string): IDisposable => {
  const disposables = new DisposableStore();

  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: CHECK_FOR_UPDATES_COMMAND_ID,
      title: localize("update.menu.checkForUpdates", "Check for Updates..."),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("idle"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UPDATE_CHECKING_COMMAND_ID,
      title: localize("update.menu.checkingForUpdates", "Checking for Updates..."),
      precondition: ContextKeyExpr.false(),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("checking"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: DOWNLOAD_UPDATE_COMMAND_ID,
      title: localize("update.menu.downloadNow", "Download Update"),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("available"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UPDATE_DOWNLOADING_COMMAND_ID,
      title: localize("update.menu.downloading", "Downloading Update..."),
      precondition: ContextKeyExpr.false(),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("downloading"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: INSTALL_UPDATE_COMMAND_ID,
      title: localize("update.menu.install", "Install Update..."),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("downloaded"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UPDATE_INSTALLING_COMMAND_ID,
      title: localize("update.menu.installing", "Installing Update..."),
      precondition: ContextKeyExpr.false(),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("updating"),
  }));

  return disposables;
};

export const registerUpdateCommands = (releaseNotesEditor?: UpdateReleaseNotesEditor): IDisposable => {
  const disposables = new DisposableStore();

  disposables.add(registerAction2(class CheckForUpdatesAction extends Action2 {
    public constructor() {
      super({
        category: localize("update.commands.category", "Update"),
        f1: true,
        id: CHECK_FOR_UPDATES_COMMAND_ID,
        title: localize("update.commands.checkForUpdates", "Check for Updates..."),
        metadata: {
          description: localize("update.commands.checkForUpdates.description", "Check for app updates."),
        },
      });
    }

    public run(accessor: ServicesAccessor): Promise<unknown> {
      return accessor.get(IUpdateService).checkForUpdates({ manual: true });
    }
  }));

  disposables.add(registerAction2(class ShowCurrentReleaseNotesAction extends Action2 {
    public constructor() {
      super({
        category: localize("update.commands.category", "Update"),
        f1: true,
        id: SHOW_CURRENT_RELEASE_NOTES_COMMAND_ID,
        title: localize("update.commands.showCurrentReleaseNotes", "Show Current Release Notes"),
        metadata: {
          description: localize("update.commands.showCurrentReleaseNotes.description", "Show bundled release notes for the current app version."),
        },
      });
    }

    public run(_accessor: ServicesAccessor, currentVersion?: unknown): boolean {
      return releaseNotesEditor?.show(normalizeReleaseNotesVersion(currentVersion)) ?? false;
    }
  }));

  disposables.add(CommandsRegistry.registerCommand({
    id: DOWNLOAD_UPDATE_COMMAND_ID,
    handler: accessor => accessor.get(IUpdateService).checkForUpdates({ manual: true }),
    metadata: {
      description: localize("update.commands.downloadNow.description", "Download the available app update."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: INSTALL_UPDATE_COMMAND_ID,
    handler: accessor => accessor.get(IUpdateService).installDownloadedUpdate(),
    metadata: {
      description: localize("update.commands.install.description", "Install the downloaded app update."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: RESTART_TO_UPDATE_COMMAND_ID,
    handler: accessor => accessor.get(IUpdateService).installDownloadedUpdate(),
    metadata: {
      description: localize("update.commands.restart.description", "Restart to install the downloaded app update."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: GET_UPDATE_STATE_COMMAND_ID,
    handler: accessor => accessor.get(IUpdateService).getStatus(),
    metadata: {
      description: localize("update.commands.state.description", "Get the current app update state."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UPDATE_CHECKING_COMMAND_ID,
    handler: () => undefined,
    metadata: {
      description: localize("update.commands.checking.description", "No-op command for the checking update state."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UPDATE_DOWNLOADING_COMMAND_ID,
    handler: () => undefined,
    metadata: {
      description: localize("update.commands.downloading.description", "No-op command for the downloading update state."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UPDATE_INSTALLING_COMMAND_ID,
    handler: () => undefined,
    metadata: {
      description: localize("update.commands.updating.description", "No-op command for the installing update state."),
    },
  }));

  return disposables;
};

export const registerDeveloperUpdateCommand = (
  environmentService: IWorkbenchEnvironmentService,
): IDisposable => {
  if (!environmentService.isWindowsDesktop) {
    return Disposable.None;
  }

  return registerAction2(class DeveloperApplyUpdateAction extends Action2 {
    public constructor() {
      super({
        category: localize("update.commands.developerCategory", "Developer"),
        f1: true,
        id: APPLY_UPDATE_COMMAND_ID,
        title: localize("update.commands.applyUpdate", "Apply Update..."),
        metadata: {
          description: localize("update.commands.applyUpdate.description", "Apply a local Windows setup package for update debugging."),
        },
      });
    }

    public async run(accessor: ServicesAccessor): Promise<unknown> {
      const updateService = accessor.get(IUpdateService);
      const fileDialogService = accessor.get(IFileDialogService);
      const updatePath = await fileDialogService.showOpenDialog({
        canSelectFiles: true,
        filters: [{ name: localize("update.commands.applyUpdate.setupFilter", "Setup"), extensions: ["exe"] }],
        openLabel: localize("update.commands.applyUpdate.openLabel", "Update"),
        title: localize("update.commands.applyUpdate.pickTitle", "Apply Update"),
      });

      if (!updatePath?.[0]) {
        return undefined;
      }

      return updateService.applySpecificUpdate(updatePath[0].fsPath);
    }
  });
};

const normalizeReleaseNotesVersion = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
