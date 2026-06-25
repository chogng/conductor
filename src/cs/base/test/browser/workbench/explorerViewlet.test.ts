/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { toDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { IDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  type ExplorerPaneInput,
  type IExplorerService,
  type ExplorerSelectionTarget,
  type ExplorerWorkflowHandler,
  type IExplorerWorkflowService,
} from "src/cs/workbench/contrib/files/browser/files";
import { DEFAULT_EXPLORER_APPEARANCE, type IAppearanceService } from "src/cs/workbench/services/appearance/common/appearance";
import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import type { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { ITableFileService } from "src/cs/workbench/services/tableFile/common/tableFile";
import type { IThumbnailPreviewService, IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type { IRawTableFactsService } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/contrib/files/browser/explorerViewlet", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("renders the empty explorer when pane input is not ready", () => {
    const pane = createExplorerViewPane();
    document.body.append(pane.element);

    try {
      assert.ok(pane.element.querySelector(".file-list"));
      assert.ok(pane.element.querySelector(".file-list-empty-import-button"));
    } finally {
      pane.dispose();
    }
  });

  test("moves a confirmed file delete to trash before removing the imported file", async () => {
    let workflowHandler: ExplorerWorkflowHandler | null = null;
    const movedPaths: string[] = [];
    const removedFileIds: string[][] = [];
    const pane = createExplorerViewPane({
      confirm: async () => ({ confirmed: true }),
      moveFileToTrash: async resource => {
        movedPaths.push(resource.fsPath);
      },
      onRegisterHandler: handler => {
        workflowHandler = handler;
      },
      paneInput: createPaneInput([{
        fileId: "file-a",
        fileName: "source.csv",
        relativePath: "source.csv",
        sourcePath: "/tmp/source.csv",
      }]),
      removeFiles: fileIds => {
        removedFileIds.push([...fileIds]);
      },
    });

    try {
      assert.ok(workflowHandler);
      (workflowHandler as ExplorerWorkflowHandler).deleteFile("file-a");
      await flushPromises();

      assert.deepEqual(movedPaths, ["/tmp/source.csv"]);
      assert.deepEqual(removedFileIds, [["file-a"]]);
    } finally {
      pane.dispose();
    }
  });

  test("does not move or remove a file when delete confirmation is canceled", async () => {
    let workflowHandler: ExplorerWorkflowHandler | null = null;
    const movedPaths: string[] = [];
    const removedFileIds: string[][] = [];
    const pane = createExplorerViewPane({
      confirm: async () => ({ confirmed: false }),
      moveFileToTrash: async resource => {
        movedPaths.push(resource.fsPath);
      },
      onRegisterHandler: handler => {
        workflowHandler = handler;
      },
      paneInput: createPaneInput([{
        fileId: "file-a",
        fileName: "source.csv",
        relativePath: "source.csv",
        sourcePath: "/tmp/source.csv",
      }]),
      removeFiles: fileIds => {
        removedFileIds.push([...fileIds]);
      },
    });

    try {
      assert.ok(workflowHandler);
      (workflowHandler as ExplorerWorkflowHandler).deleteFile("file-a");
      await flushPromises();

      assert.deepEqual(movedPaths, []);
      assert.deepEqual(removedFileIds, []);
    } finally {
      pane.dispose();
    }
  });
});

type CreateExplorerViewPaneOptions = {
  readonly confirm?: IDialogService["confirm"];
  readonly moveFileToTrash?: (resource: URI) => Promise<void>;
  readonly onRegisterHandler?: (handler: ExplorerWorkflowHandler) => void;
  readonly paneInput?: ExplorerPaneInput | null;
  readonly removeFiles?: (fileIds: readonly string[]) => void;
};

const createExplorerViewPane = (options: CreateExplorerViewPaneOptions = {}): ExplorerViewPane =>
  new ExplorerViewPane(
    {
      executeCommand: async () => undefined,
    } as unknown as ICommandService,
    {
      showContextMenu: () => undefined,
    } as unknown as IContextMenuService,
    {} as unknown as IContextViewService,
    {
      confirm: options.confirm ?? (async () => ({ confirmed: false })),
      onDidShowDialog: Event.None,
      onWillShowDialog: Event.None,
    } as unknown as IDialogService,
    createExplorerService(options.paneInput ?? null),
    {
      registerHandler: (handler: ExplorerWorkflowHandler) => {
        options.onRegisterHandler?.(handler);
        return toDisposable(() => undefined);
      },
    } as unknown as IExplorerWorkflowService,
    {} as unknown as FileConverterBackend,
    {
      getProvider: () => undefined,
      moveFileToTrash: options.moveFileToTrash ?? (async () => undefined),
    } as unknown as IFileService,
    {
      getAppearance: () => ({ explorer: DEFAULT_EXPLORER_APPEARANCE }),
      onDidChangeAppearance: Event.None,
    } as unknown as IAppearanceService,
    {} as unknown as IWorkbenchLayoutService,
    {
      notify: () => undefined,
    } as unknown as INotificationService,
    {
      clearTableFiles: () => undefined,
      commitImport: () => ({
        importedFileIds: [],
        skippedDuplicateFileIds: [],
      }),
      commitTableFacts: () => undefined,
      commitTableFactsBatch: () => undefined,
      getSnapshot: () => ({ filesById: {}, fileOrder: [] }),
      onDidChangeTableFiles: Event.None,
      removeFiles: options.removeFiles ?? (() => undefined),
      renameFile: () => undefined,
    } as unknown as ITableFileService,
    {} as unknown as IRawTableFactsService,
    {
      onDidChangePreview: Event.None,
      get: () => ({ kind: "idle" }),
      invalidate: () => undefined,
      prefetch: () => undefined,
      request: () => ({ kind: "idle" }),
    } as unknown as IThumbnailPreviewService,
    {
      clear: () => undefined,
      drawPlotThumbnail: () => undefined,
      warmPlotThumbnail: () => undefined,
    } as unknown as IThumbnailService,
    createUserTemplateService(),
  );

const createExplorerService = (paneInput: ExplorerPaneInput | null): IExplorerService => ({
  _serviceBrand: undefined,
  expandedFolderKeys: [],
  hasPendingSourceFiles: false,
  hoveredFileId: null,
  onDidChangeExpandedFolderKeys: Event.None,
  onDidChangeHoveredFile: Event.None,
  onDidChangePaneInput: Event.None,
  onDidChangePendingSourceFiles: Event.None,
  onDidChangeSelection: Event.None,
  onDidChangeViewLayout: Event.None,
  onDidChangeVisibleFileIds: Event.None,
  selectedProcessedFileId: null,
  selectedRawFileId: null,
  viewLayout: "tree",
  applyBulkEdit: async () => undefined,
  getCollapsedFolderKeys: () => [],
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
  getPaneInput: () => paneInput,
  reconcileExpandedFolderKeys: () => [],
  refresh: async () => undefined,
  registerView: () => toDisposable(() => undefined),
  select: (target: ExplorerSelectionTarget) => target.fileId,
  setEditable: () => undefined,
  setExpandedFolderKeys: () => undefined,
  setHoveredFileId: () => undefined,
  setPendingSourceFiles: () => undefined,
  setToCopy: () => undefined,
  setViewLayout: () => undefined,
  setVisibleFileIds: () => undefined,
  toggleViewLayout: () => undefined,
  updatePaneInput: () => undefined,
} as unknown as IExplorerService);

const createPaneInput = (files: ExplorerFileEntry[]): ExplorerPaneInput => ({
  files,
  mode: "table",
  selectedFileId: null,
  selectionKind: "table",
  thumbnailFiles: [],
});

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createUserTemplateService = (): IUserTemplateService => ({
  _serviceBrand: undefined,
  onDidChangeUserTemplates: Event.None,
  createTemplate: async () => {
    throw new Error("Unexpected user template create in explorer viewlet test.");
  },
  deleteTemplate: async () => undefined,
  duplicateTemplate: async () => {
    throw new Error("Unexpected user template duplicate in explorer viewlet test.");
  },
  exportTemplates: () => ({
    version: 1,
    source: "conductor.userTemplate",
    templates: [],
  }),
  getSnapshot: () => ({
    version: 0,
    workspaceVersion: 0,
    globalVersion: 0,
    workspaceFingerprint: "",
    globalFingerprint: "",
    effectiveFingerprint: "",
    templates: [],
  }),
  getTemplate: () => undefined,
  importTemplates: async () => ({
    imported: [],
    skipped: [],
  }),
  refreshTemplates: async () => [],
  updateTemplate: async () => {
    throw new Error("Unexpected user template update in explorer viewlet test.");
  },
} as unknown as IUserTemplateService);
