import assert from "assert";

import { Event } from "src/cs/base/common/event";
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
} from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";
import {
  DefaultQuickAccessProvider,
  FILES_QUICK_ACCESS_PREFIX,
  FilesQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/quickAccessProviders";
import type { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/quickaccess/test/browser/quickAccessProviders", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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
    selectedRawFileId: null,
    selectedProcessedFileId: null,
    expandedFolderKeys: [],
    viewLayout: "tree",
    onDidChangePendingSourceFiles: Event.None as IExplorerService["onDidChangePendingSourceFiles"],
    onDidChangeSelection: Event.None as IExplorerService["onDidChangeSelection"],
    onDidChangeExpandedFolderKeys: Event.None as IExplorerService["onDidChangeExpandedFolderKeys"],
    onDidChangeViewLayout: Event.None as IExplorerService["onDidChangeViewLayout"],
    onDidChangePaneInput: Event.None as IExplorerService["onDidChangePaneInput"],
    getContext: () => ({
      editable: null,
      expandedFolderKeys: [],
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
    reconcileExpandedFolderKeys: folderKeys => folderKeys,
    getCollapsedFolderKeys: () => [],
    setPendingSourceFiles: () => undefined,
    setViewLayout: () => undefined,
    toggleViewLayout: () => undefined,
    getPaneInput: () => paneInput,
    updatePaneInput: () => undefined,
  };
}
