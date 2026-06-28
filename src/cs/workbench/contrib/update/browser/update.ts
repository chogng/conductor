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
import {
  CONTEXT_UPDATE_STATE,
  IWorkbenchUpdateService,
  UpdateCommandId,
} from "src/cs/workbench/contrib/update/common/update";
import type { ReleaseNotesEditor } from "src/cs/workbench/contrib/update/browser/releaseNotesEditor";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";

type UpdateReleaseNotesEditor = Pick<ReleaseNotesEditor, "show">;

export const appendUpdateMenuItems = (menuId: MenuId, group: string): IDisposable => {
  const disposables = new DisposableStore();

  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UpdateCommandId.check,
      title: localize("update.menu.checkForUpdates", "Check for Updates..."),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("idle"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UpdateCommandId.checking,
      title: localize("update.menu.checkingForUpdates", "Checking for Updates..."),
      precondition: ContextKeyExpr.false(),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("checking"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UpdateCommandId.downloadNow,
      title: localize("update.menu.downloadNow", "Download Update"),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("available"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UpdateCommandId.downloading,
      title: localize("update.menu.downloading", "Downloading Update..."),
      precondition: ContextKeyExpr.false(),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("downloading"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UpdateCommandId.install,
      title: localize("update.menu.install", "Install Update..."),
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo("downloaded"),
  }));
  disposables.add(MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: UpdateCommandId.updating,
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
        id: UpdateCommandId.check,
        title: localize("update.commands.checkForUpdates", "Check for Updates..."),
        metadata: {
          description: localize("update.commands.checkForUpdates.description", "Check for app updates."),
        },
      });
    }

    public run(accessor: ServicesAccessor): Promise<unknown> {
      return accessor.get(IWorkbenchUpdateService).checkForUpdates();
    }
  }));

  disposables.add(registerAction2(class ShowCurrentReleaseNotesAction extends Action2 {
    public constructor() {
      super({
        category: localize("update.commands.category", "Update"),
        f1: true,
        id: UpdateCommandId.showCurrentReleaseNotes,
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
    id: UpdateCommandId.downloadNow,
    handler: accessor => accessor.get(IWorkbenchUpdateService).checkForUpdates(),
    metadata: {
      description: localize("update.commands.downloadNow.description", "Download the available app update."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UpdateCommandId.install,
    handler: accessor => accessor.get(IWorkbenchUpdateService).installDownloadedUpdate(),
    metadata: {
      description: localize("update.commands.install.description", "Install the downloaded app update."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UpdateCommandId.restart,
    handler: accessor => accessor.get(IWorkbenchUpdateService).installDownloadedUpdate(),
    metadata: {
      description: localize("update.commands.restart.description", "Restart to install the downloaded app update."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UpdateCommandId.state,
    handler: accessor => accessor.get(IWorkbenchUpdateService).getStatus(),
    metadata: {
      description: localize("update.commands.state.description", "Get the current app update state."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UpdateCommandId.checking,
    handler: () => undefined,
    metadata: {
      description: localize("update.commands.checking.description", "No-op command for the checking update state."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UpdateCommandId.downloading,
    handler: () => undefined,
    metadata: {
      description: localize("update.commands.downloading.description", "No-op command for the downloading update state."),
    },
  }));
  disposables.add(CommandsRegistry.registerCommand({
    id: UpdateCommandId.updating,
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
        id: UpdateCommandId.applyUpdate,
        title: localize("update.commands.applyUpdate", "Apply Update..."),
        metadata: {
          description: localize("update.commands.applyUpdate.description", "Apply a local Windows setup package for update debugging."),
        },
      });
    }

    public async run(accessor: ServicesAccessor): Promise<unknown> {
      const updateService = accessor.get(IWorkbenchUpdateService);
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
