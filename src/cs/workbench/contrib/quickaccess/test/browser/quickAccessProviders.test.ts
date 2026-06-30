import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
  MenuId,
  MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import { MenuService } from "src/cs/platform/actions/common/menuService";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import type { IQuickAccessController } from "src/cs/platform/quickinput/common/quickAccess";
import type {
  IQuickInputService,
  QuickPickOptions,
  QuickPickItem,
} from "src/cs/platform/quickinput/common/quickInput";
import {
  IExplorerService,
  type ExplorerPaneInput,
  type ExplorerRevealMode,
} from "src/cs/workbench/contrib/files/browser/files";
import type {
  ExplorerFileEntry,
  ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  COMMANDS_QUICK_ACCESS_PREFIX,
  CommandsQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";
import {
  DefaultQuickAccessProvider,
  FILES_QUICK_ACCESS_PREFIX,
  FilesQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/quickAccessProviders";
import type { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/quickaccess/test/browser/quickAccessProviders", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("default provider switches to file and command providers", async () => {
    const shownPrefixes: string[] = [];
    const provider = store.add(new DefaultQuickAccessProvider(createQuickInputService(shownPrefixes)));
    const picks = await provider.provide("");

    picks.find(pick => pick.id === "quickAccess.gotoFiles")?.accept?.();
    picks.find(pick => pick.id === "quickAccess.gotoCommands")?.accept?.();

    assert.deepEqual(shownPrefixes, [
      FILES_QUICK_ACCESS_PREFIX,
      COMMANDS_QUICK_ACCESS_PREFIX,
    ]);
  });

  test("files provider reads Explorer service files and selects through Explorer", async () => {
    const selections: Array<{
      readonly reveal: ExplorerRevealMode | undefined;
      readonly target: ExplorerResourceIdentity;
    }> = [];
    const explorerFiles = [
      { fileId: "file-a", fileName: "Alpha.csv", relativePath: "293K/input/Alpha.csv", resource: URI.file("/workspace/Alpha.csv") },
      { fileId: "file-b", fileName: "Beta.csv", relativePath: "293K/output/Beta.csv", resource: URI.file("/workspace/Beta.csv") },
    ];
    const paneInput: ExplorerPaneInput = {
      activePlotType: "iv",
      mode: "chart",
      selectedResource: URI.file("/workspace/Alpha.csv"),
      selectedSheetId: null,
      selectionKind: "chart",
    };
    const provider = store.add(new FilesQuickAccessProvider(
      createExplorerService(paneInput, explorerFiles, selections),
      { activeWorkbenchMainPart: "chart" } as unknown as IWorkbenchLayoutService,
    ));
    const picks = await provider.provide("beta");

    assert.deepEqual(picks.map(pick => ({
      description: pick.description,
      label: pick.label,
    })), [{
      description: "293K/output",
      label: "Beta.csv",
    }]);
    picks[0]?.accept?.();
    assert.deepEqual(selections, [{
      reveal: "force",
      target: {
        resource: URI.file("/workspace/Beta.csv"),
        sheetId: null,
      },
    }]);
  });

  test("files provider returns no picks when pane input is for another mode", async () => {
    const selections: Array<{
      readonly reveal: ExplorerRevealMode | undefined;
      readonly target: ExplorerResourceIdentity;
    }> = [];
    const explorerFiles = [
      { fileId: "file-a", fileName: "Alpha.csv", resource: URI.file("/workspace/Alpha.csv") },
      { fileId: "file-b", fileName: "Beta.csv", resource: URI.file("/workspace/Beta.csv") },
    ];
    const paneInput: ExplorerPaneInput = {
      activePlotType: "iv",
      mode: "chart",
      selectedResource: URI.file("/workspace/Alpha.csv"),
      selectedSheetId: null,
      selectionKind: "table",
    };
    const provider = store.add(new FilesQuickAccessProvider(
      createExplorerService(paneInput, explorerFiles, selections),
      { activeWorkbenchMainPart: "chart" } as unknown as IWorkbenchLayoutService,
    ));
    const picks = await provider.provide("beta");

    assert.deepEqual(picks, []);
    assert.deepEqual(selections, []);
  });

  test("commands provider reads context-aware command palette actions", async () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const commandService = createCommandService();
    const menuService = disposables.add(new MenuService(commandService));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: { id: "test.visibleCommand", title: "Visible Command" },
      when: ContextKeyExpr.has("showVisibleCommand"),
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id: "test.disabledCommand",
        precondition: ContextKeyExpr.has("canRunDisabledCommand"),
        title: "Disabled Command",
      },
    }));
    const provider = store.add(new CommandsQuickAccessProvider(commandService, menuService, contextKeyService));

    assert.deepEqual((await provider.provide("Command")).map(pick => pick.id), []);

    contextKeyService.setContext("showVisibleCommand", true);

    assert.deepEqual((await provider.provide("Command")).map(pick => pick.id), ["test.visibleCommand"]);
  });
});

function createQuickInputService(shownPrefixes: string[]): IQuickInputService {
  const quickAccess: IQuickAccessController = {
    pick: async () => undefined,
    show: (value = "") => {
      shownPrefixes.push(value);
    },
  };

  return {
    _serviceBrand: undefined,
    createQuickPick: () => {
      throw new Error("createQuickPick is not used by this test");
    },
    quickAccess,
    pick: async <T extends QuickPickItem>(_options: QuickPickOptions<T>): Promise<T | undefined> => undefined,
  };
}

function createExplorerService(
  paneInput: ExplorerPaneInput,
  explorerFiles: readonly ExplorerFileEntry[],
  selections: Array<{
    readonly reveal: ExplorerRevealMode | undefined;
    readonly target: ExplorerResourceIdentity;
  }>,
): IExplorerService {
	  return {
	    _serviceBrand: undefined,
	    files: explorerFiles,
	    hasPendingSourceFiles: false,
	    hoveredResource: null,
	    selectedResource: null,
	    selectedSheetId: null,
    expandedFolderKeys: [],
    viewLayout: "tree",
	    onDidChangePendingSourceFiles: Event.None as IExplorerService["onDidChangePendingSourceFiles"],
	    onDidChangeSelection: Event.None as IExplorerService["onDidChangeSelection"],
	    onDidChangeExpandedFolderKeys: Event.None as IExplorerService["onDidChangeExpandedFolderKeys"],
	    onDidChangeFiles: Event.None as IExplorerService["onDidChangeFiles"],
	    onDidChangeHoveredResource: Event.None as IExplorerService["onDidChangeHoveredResource"],
	    onDidChangeViewLayout: Event.None as IExplorerService["onDidChangeViewLayout"],
	    onDidChangeVisibleTargets: Event.None as IExplorerService["onDidChangeVisibleTargets"],
	    onDidChangePaneInput: Event.None as IExplorerService["onDidChangePaneInput"],
	    getContext: () => ({
	      editable: null,
	      expandedFolderKeys: [],
	      hoveredResource: null,
	      selectedResource: null,
	      selectedSheetId: null,
      toCopy: {
        isCut: false,
        resources: [],
      },
      viewLayout: "tree",
    }),
    registerView: () => ({ dispose: () => undefined }),
    select: (resource, reveal, sheetId) => {
      if (!resource) {
        return null;
      }

      const target = {
        resource,
        sheetId: sheetId ?? null,
      };
      selections.push({ reveal, target });
      return target;
    },
	    setEditable: () => undefined,
	    setToCopy: () => undefined,
	    applyBulkEdit: async () => undefined,
	    refresh: async () => undefined,
	    replaceFiles: () => undefined,
	    appendFiles: () => [],
	    removeFiles: () => [],
	    renameFile: () => undefined,
	    setExpandedFolderKeys: () => undefined,
	    setHoveredResource: () => undefined,
	    reconcileExpandedFolderKeys: folderKeys => folderKeys,
	    getCollapsedFolderKeys: () => [],
	    setPendingSourceFiles: () => undefined,
	    setVisibleTargets: () => undefined,
	    setViewLayout: () => undefined,
    toggleViewLayout: () => undefined,
    getPaneInput: () => paneInput,
    updatePaneInput: () => undefined,
  };
}

function createCommandService(): ICommandService {
  return {
    _serviceBrand: undefined,
    onDidExecuteCommand: Event.None as Event<ICommandEvent>,
    onWillExecuteCommand: Event.None as Event<ICommandEvent>,
    executeCommand: async () => undefined,
  };
}
