import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
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
  type ExplorerSelectionTarget,
} from "src/cs/workbench/contrib/files/browser/files";
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
    const provider = new DefaultQuickAccessProvider(createQuickInputService(shownPrefixes));
    const picks = await provider.provide("");

    picks.find(pick => pick.id === "quickAccess.gotoFiles")?.accept?.();
    picks.find(pick => pick.id === "quickAccess.gotoCommands")?.accept?.();

    assert.deepEqual(shownPrefixes, [
      FILES_QUICK_ACCESS_PREFIX,
      COMMANDS_QUICK_ACCESS_PREFIX,
    ]);
  });

  test("files provider reads Explorer pane input and selects through Explorer", async () => {
    const selections: Array<{
      readonly reveal: ExplorerRevealMode | undefined;
      readonly target: ExplorerSelectionTarget;
    }> = [];
    const paneInput: ExplorerPaneInput = {
      activePlotType: "iv",
      files: [
        { fileId: "file-a", fileName: "Alpha.csv" },
      ],
      quickAccessFiles: [
        { fileId: "file-a", fileName: "Alpha.csv", relativePath: "293K/input/Alpha.csv" },
        { fileId: "file-b", fileName: "Beta.csv", relativePath: "293K/output/Beta.csv" },
      ],
      mode: "chart",
      selectedFileId: "file-a",
      selectionKind: "chart",
      thumbnailFiles: [],
    };
    const provider = new FilesQuickAccessProvider(
      createExplorerService(paneInput, selections),
      { activeWorkbenchMainPart: "chart" } as unknown as IWorkbenchLayoutService,
    );
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
        candidateFileIds: ["file-a", "file-b"],
        fileId: "file-b",
        kind: "chart",
      },
    }]);
  });

  test("files provider falls back to rendered Explorer files", async () => {
    const selections: Array<{
      readonly reveal: ExplorerRevealMode | undefined;
      readonly target: ExplorerSelectionTarget;
    }> = [];
    const paneInput: ExplorerPaneInput = {
      activePlotType: "iv",
      files: [
        { fileId: "file-a", fileName: "Alpha.csv" },
        { fileId: "file-b", fileName: "Beta.csv" },
      ],
      mode: "chart",
      selectedFileId: "file-a",
      selectionKind: "chart",
      thumbnailFiles: [],
    };
    const provider = new FilesQuickAccessProvider(
      createExplorerService(paneInput, selections),
      { activeWorkbenchMainPart: "chart" } as unknown as IWorkbenchLayoutService,
    );
    const picks = await provider.provide("beta");

    assert.deepEqual(picks.map(pick => pick.label), ["Beta.csv"]);
    picks[0]?.accept?.();
    assert.deepEqual(selections, [{
      reveal: "force",
      target: {
        candidateFileIds: ["file-a", "file-b"],
        fileId: "file-b",
        kind: "chart",
      },
    }]);
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
    const provider = new CommandsQuickAccessProvider(commandService, menuService, contextKeyService);

    assert.deepEqual((await provider.provide("Command")).map(pick => pick.id), []);

    contextKeyService.setContext("showVisibleCommand", true);

    assert.deepEqual((await provider.provide("Command")).map(pick => pick.id), ["test.visibleCommand"]);
  });
});

function createQuickInputService(shownPrefixes: string[]): IQuickInputService {
  const quickAccess: IQuickAccessController = {
    show: (value = "") => {
      shownPrefixes.push(value);
    },
  };

  return {
    _serviceBrand: undefined,
    quickAccess,
    pick: async <T extends QuickPickItem>(_options: QuickPickOptions<T>): Promise<T | undefined> => undefined,
  };
}

function createExplorerService(
  paneInput: ExplorerPaneInput,
  selections: Array<{
    readonly reveal: ExplorerRevealMode | undefined;
    readonly target: ExplorerSelectionTarget;
  }>,
): IExplorerService {
	  return {
	    _serviceBrand: undefined,
	    hasPendingSourceFiles: false,
	    hoveredFileId: null,
	    selectedRawFileId: null,
    selectedProcessedFileId: null,
    expandedFolderKeys: [],
    viewLayout: "tree",
	    onDidChangePendingSourceFiles: Event.None as IExplorerService["onDidChangePendingSourceFiles"],
	    onDidChangeSelection: Event.None as IExplorerService["onDidChangeSelection"],
	    onDidChangeExpandedFolderKeys: Event.None as IExplorerService["onDidChangeExpandedFolderKeys"],
	    onDidChangeHoveredFile: Event.None as IExplorerService["onDidChangeHoveredFile"],
	    onDidChangeViewLayout: Event.None as IExplorerService["onDidChangeViewLayout"],
	    onDidChangeVisibleFileIds: Event.None as IExplorerService["onDidChangeVisibleFileIds"],
	    onDidChangePaneInput: Event.None as IExplorerService["onDidChangePaneInput"],
	    getContext: () => ({
	      editable: null,
	      expandedFolderKeys: [],
	      hoveredFileId: null,
	      selectedProcessedFileId: null,
      selectedRawFileId: null,
      toCopy: {
        isCut: false,
        resources: [],
      },
      viewLayout: "tree",
    }),
    registerView: () => ({ dispose: () => undefined }),
    select: (target, reveal) => {
      selections.push({ reveal, target });
      return target.fileId;
    },
	    setEditable: () => undefined,
	    setToCopy: () => undefined,
	    applyBulkEdit: async () => undefined,
	    refresh: async () => undefined,
	    setExpandedFolderKeys: () => undefined,
	    setHoveredFileId: () => undefined,
	    reconcileExpandedFolderKeys: folderKeys => folderKeys,
	    getCollapsedFolderKeys: () => [],
	    setPendingSourceFiles: () => undefined,
	    setVisibleFileIds: () => undefined,
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
