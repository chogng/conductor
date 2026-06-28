/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
  isIMenuItem,
  MenuId,
  MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import {
  IFileDialogService,
  type IOpenDialogOptions,
  type ISaveDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";
import {
  FileSystemProviderCapabilities,
  FileType,
  IFileService,
  type IFileChange,
  type IFileContent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "src/cs/platform/files/common/files";
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { registerTemplateCommands } from "src/cs/workbench/contrib/template/browser/templateCommands";
import {
  ITemplateViewStateService,
  TemplateViewStateService,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import { TemplateCommandId } from "src/cs/workbench/contrib/template/common/template";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  INotificationService,
  NoOpNotification,
  type INotification,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
  IPathService,
  type IPathService as IPathServiceType,
} from "src/cs/workbench/services/path/common/pathService";
import type { Template } from "src/cs/workbench/services/template/common/template";
import {
  IUserTemplateImportExportService,
  IUserTemplateService,
  type UserTemplate,
  type UserTemplateChangeEvent,
  type UserTemplateImportInput,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import { UserTemplateImportExportService } from "src/cs/workbench/services/userTemplate/browser/userTemplateImportExportService";
import {
  IUserDataProfileResourceService,
  type IUserDataProfileResourceHandler,
  type UserDataProfileResourceChangeEvent,
  type UserDataProfileResourceId,
} from "src/cs/workbench/services/userDataProfile/common/userDataProfile";

suite("workbench/contrib/template/test/browser/templateCommands", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("template commands register command handlers", () => {
    const registration = registerTemplateCommands();

    try {
      for (const commandId of Object.values(TemplateCommandId)) {
        assert.ok(CommandsRegistry.getCommand(commandId), commandId);
      }
    } finally {
      registration.dispose();
    }
  });

  test("template library commands are command palette actions", () => {
    const registration = registerTemplateCommands();

    try {
      const commandPaletteIds = getCommandPaletteIds();
      assert.ok(commandPaletteIds.has(TemplateCommandId.createTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.deleteTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.importTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.editTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.exportTemplate));
    } finally {
      registration.dispose();
    }
  });

  test("import template command accepts native UserTemplate payload", async () => {
    const registration = registerTemplateCommands();
    const templateResource = URI.file("/imports/template.json");
    const userTemplate = createUserTemplate("template-a", "Transfer");
    const importState: { input?: UserTemplateImportInput } = {};
    const templateViewStateService = store.add(new TemplateViewStateService());
    const notifications: INotification[] = [];
    const userTemplateService = createUserTemplateService({
      importTemplates: async input => {
        importState.input = input;
        return {
          imported: [userTemplate],
          skipped: [],
        };
      },
    });
    const accessor = createAccessor([
      [IFileDialogService, createFileDialogService(templateResource)],
      [IFileService, new TestFileService(JSON.stringify({
        source: "conductor.userTemplate",
        templates: [userTemplate],
        version: 1,
      }))],
      [INotificationService, createNotificationService(notifications)],
      [IPathService, createPathService(URI.file("/imports"))],
      [ITemplateViewStateService, templateViewStateService],
      [IUserTemplateService, userTemplateService],
      [
        IUserTemplateImportExportService,
        store.add(new UserTemplateImportExportService(userTemplateService, createUserDataProfileResourceService())),
      ],
    ]);

    try {
      CommandsRegistry.getCommand(TemplateCommandId.importTemplate)?.handler(accessor);
      await waitFor(() => Boolean(importState.input));
      const importInput = importState.input;
      assert.ok(importInput);

      assert.deepStrictEqual({
        importedTemplateCount: importInput.templates.length,
        selectedTemplateId: templateViewStateService.getState().selectedTemplateId,
        notificationMessage: notifications[0]?.message,
      }, {
        importedTemplateCount: 1,
        selectedTemplateId: "template-a",
        notificationMessage: "template.import.success",
      });
    } finally {
      registration.dispose();
    }
  });

  test("import template command rejects legacy editor bundles", async () => {
    const registration = registerTemplateCommands();
    const templateResource = URI.file("/imports/template.json");
    let didImport = false;
    const notifications: INotification[] = [];
    const userTemplateService = createUserTemplateService({
      importTemplates: async () => {
        didImport = true;
        return {
          imported: [],
          skipped: [],
        };
      },
    });
    const accessor = createAccessor([
      [IFileDialogService, createFileDialogService(templateResource)],
      [IFileService, new TestFileService(JSON.stringify({
        name: "Legacy Transfer",
        source: "conductor",
        version: 1,
      }))],
      [INotificationService, createNotificationService(notifications)],
      [IPathService, createPathService(URI.file("/imports"))],
      [ITemplateViewStateService, store.add(new TemplateViewStateService())],
      [IUserTemplateService, userTemplateService],
      [
        IUserTemplateImportExportService,
        store.add(new UserTemplateImportExportService(userTemplateService, createUserDataProfileResourceService())),
      ],
    ]);

    try {
      CommandsRegistry.getCommand(TemplateCommandId.importTemplate)?.handler(accessor);
      await waitFor(() => notifications.length > 0);

      assert.deepStrictEqual({
        didImport,
        notificationMessage: notifications[0]?.message,
      }, {
        didImport: false,
        notificationMessage: "template.import.invalidFormat",
      });
    } finally {
      registration.dispose();
    }
  });
});

function getCommandPaletteIds(): Set<string> {
  return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
    .filter(isIMenuItem)
    .map(item => item.command.id));
}

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T =>
      values.get(id as ServiceIdentifier<unknown>) as T,
  };
}

function createFileDialogService(resource: URI): IFileDialogService {
  return {
    _serviceBrand: undefined,
    canSaveFile: () => true,
    showOpenDialog: async (_options: IOpenDialogOptions) => [resource],
    showSaveDialog: async (_options: ISaveDialogOptions) => undefined,
  };
}

function createUserDataProfileResourceService(): IUserDataProfileResourceService {
  return {
    _serviceBrand: undefined,
    onDidChangeResource: Event.None as Event<UserDataProfileResourceChangeEvent>,
    registerResourceHandler: (
      _resource: UserDataProfileResourceId,
      _handler: IUserDataProfileResourceHandler,
    ) => Disposable.None,
    exportProfile: async () => ({
      source: "conductor.userDataProfile",
      version: 1,
      resources: [],
    }),
    importProfileFromPayload: async () => null,
    readResource: <T extends object>(_resource: UserDataProfileResourceId): T | undefined => undefined,
    writeResource: (_resource: UserDataProfileResourceId, _value: object) => undefined,
  };
}

function createNotificationService(notifications: INotification[]): INotificationService {
  return {
    _serviceBrand: undefined,
    onDidChangeFilter: Event.None as Event<void>,
    error: () => undefined,
    getFilter: () => 0,
    getFilters: () => [],
    info: () => undefined,
    notify: notification => {
      notifications.push(notification);
      return new NoOpNotification();
    },
    prompt: () => new NoOpNotification(),
    removeFilter: () => undefined,
    setFilter: () => undefined,
    status: () => ({
      close: () => undefined,
      dispose: () => undefined,
    }),
    warn: () => undefined,
  };
}

function createPathService(userHome: URI): IPathServiceType {
  function resolveUserHome(options: { preferLocal: true }): URI;
  function resolveUserHome(options?: { preferLocal: boolean }): Promise<URI>;
  function resolveUserHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
    return options?.preferLocal ? userHome : Promise.resolve(userHome);
  }

  return {
    _serviceBrand: undefined,
    defaultUriScheme: "file",
    fileURI: async (path: string) => URI.file(path),
    path: Promise.resolve({} as IPathServiceType["path"] extends Promise<infer T> ? T : never),
    resolvedUserHome: userHome,
    userHome: resolveUserHome,
  };
}

function createUserTemplateService(options: {
  readonly importTemplates: IUserTemplateService["importTemplates"];
}): IUserTemplateService {
  return {
    _serviceBrand: undefined,
    onDidChangeUserTemplates: Event.None as Event<UserTemplateChangeEvent>,
    createTemplate: async () => {
      throw new Error("Not implemented.");
    },
    deleteTemplate: async () => undefined,
    duplicateTemplate: async () => {
      throw new Error("Not implemented.");
    },
    exportTemplates: () => ({
      source: "conductor.userTemplate",
      templates: [],
      version: 1,
    }),
    getSnapshot: () => ({
      effectiveFingerprint: "",
      profileFingerprint: "",
      profileVersion: 0,
      templates: [],
      version: 0,
      workspaceFingerprint: "",
      workspaceVersion: 0,
    }),
    getTemplate: () => undefined,
    importTemplates: options.importTemplates,
    refreshTemplates: async () => [],
    updateTemplate: async () => {
      throw new Error("Not implemented.");
    },
  };
}

function createUserTemplate(id: string, name: string): UserTemplate {
  const template = createTemplate(id, name);
  return {
    createdAt: 1,
    id,
    name,
    scope: "profile",
    source: "imported",
    template,
    templateFingerprint: `fingerprint:${id}`,
    updatedAt: 1,
    version: 1,
  };
}

function createTemplate(id: string, name: string): Template {
  return {
    blocks: [],
    id,
    name,
    schemaVersion: 1,
    stopOnError: false,
    version: 1,
  };
}

function waitFor(predicate: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > 1000) {
        reject(new Error("Timed out waiting for template command."));
        return;
      }
      setTimeout(check, 0);
    };
    check();
  });
}

class TestFileService implements IFileService {
  public readonly _serviceBrand = undefined;
  public readonly onDidFilesChange = Event.None as Event<readonly IFileChange[]>;

  public constructor(private readonly content: string) {}

  public registerProvider(_scheme: string, _provider: IFileSystemProvider): IDisposable {
    return Disposable.None;
  }

	public getProvider(_scheme: string): IFileSystemProvider | undefined {
		return undefined;
	}

	public getProviderCapabilities(): FileSystemProviderCapabilities {
		return FileSystemProviderCapabilities.FileRead |
			FileSystemProviderCapabilities.FileWrite |
			FileSystemProviderCapabilities.FileWatch;
	}

  public exists(_resource: URI): Promise<boolean> {
    return Promise.resolve(true);
  }

  public readDir(_resource: URI): Promise<readonly [string, FileType][]> {
    throw new Error("Not implemented.");
  }

  public readFile(_resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
    return Promise.resolve({
      value: new TextEncoder().encode(this.content),
    });
  }

  public writeFile(_resource: URI, _content: string): Promise<void> {
    throw new Error("Not implemented.");
  }

  public deleteFile(_resource: URI): Promise<void> {
    throw new Error("Not implemented.");
  }

  public moveFileToTrash(_resource: URI): Promise<void> {
    throw new Error("Not implemented.");
  }

  public realpath(resource: URI): Promise<URI> {
    return Promise.resolve(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return Promise.resolve({
      ctime: 0,
      mtime: 0,
      path: resource.fsPath,
      size: this.content.length,
      type: FileType.File,
    });
  }

  public watch(_resource: URI, _options?: IWatchOptions): IDisposable {
    return Disposable.None;
  }
}
