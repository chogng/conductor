/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { toDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { IDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import { FileService } from "src/cs/platform/files/common/fileService";
import type { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import type { IProgressService } from "src/cs/platform/progress/common/progress";
import { UriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentityService";
import type { IWorkspaceContextService } from "src/cs/platform/workspace/common/workspace";
import { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { ExplorerView } from "src/cs/workbench/contrib/files/browser/views/explorerView";
import { ExplorerViewer } from "src/cs/workbench/contrib/files/browser/views/explorerViewer";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  type ExplorerPaneInput,
  type IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import { DEFAULT_EXPLORER_APPEARANCE, type IAppearanceService } from "src/cs/workbench/services/appearance/common/appearance";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import type { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { ITableService, TableSource } from "src/cs/workbench/services/table/common/table";
import type { IThumbnailPreviewService, IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";
import type { IDecorationsService } from "src/cs/workbench/services/decorations/common/decorations";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type {
  IReviewService,
} from "src/cs/workbench/services/review/common/review";
import type { ReviewSummaryTarget } from "src/cs/workbench/services/review/common/reviewModel";

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
    const movedPaths: string[] = [];
    const fileUpdates: (readonly ExplorerFileEntry[])[] = [];
    const resource = URI.file("/tmp/source.csv");
    const pane = createExplorerViewPane({
      confirm: async () => ({ confirmed: true }),
      files: [{
        fileId: "file-a",
        fileName: "source.csv",
        relativePath: "source.csv",
        resource,
        sourcePath: "/tmp/source.csv",
      }],
      moveFileToTrash: async resource => {
        movedPaths.push(resource.fsPath);
      },
      onFilesChange: files => {
        fileUpdates.push([...files]);
      },
    });

    try {
      await pane.deleteFile({ resource });

      assert.deepEqual(movedPaths, ["/tmp/source.csv"]);
      assert.deepEqual(fileUpdates.at(-1), []);
    } finally {
      pane.dispose();
    }
  });

  test("does not move or remove a file when delete confirmation is canceled", async () => {
    const movedPaths: string[] = [];
    const fileUpdates: (readonly ExplorerFileEntry[])[] = [];
    const resource = URI.file("/tmp/source.csv");
    const pane = createExplorerViewPane({
      confirm: async () => ({ confirmed: false }),
      files: [{
        fileId: "file-a",
        fileName: "source.csv",
        relativePath: "source.csv",
        resource,
        sourcePath: "/tmp/source.csv",
      }],
      moveFileToTrash: async resource => {
        movedPaths.push(resource.fsPath);
      },
      onFilesChange: files => {
        fileUpdates.push([...files]);
      },
    });

    try {
      await pane.deleteFile({ resource });

      assert.deepEqual(movedPaths, []);
      assert.deepEqual(fileUpdates, []);
    } finally {
      pane.dispose();
    }
  });

  test("defers table open until folder source replacement finishes", () => {
    const openedResources: string[] = [];
    const reviewedResources: string[] = [];
    const pane = createExplorerViewPane({
      onOpenTable: source => {
        if (source?.resource) {
          openedResources.push(source.resource.toString());
        }
      },
      onResolveReviewSummary: target => {
        reviewedResources.push(target.resource.toString());
      },
    });
    const resource = URI.file("/workspace/293K/output/Output_.csv");
    const explorerEntry = createExplorerImportEntry({
      fileName: "Output_.csv",
      itemKey: "source-output",
      relativePath: "293K/output/Output_.csv",
      resource,
    });

    try {
      (pane as unknown as {
        beginSourceReplace(): void;
      }).beginSourceReplace();
      (pane as unknown as {
        replaceExplorerFiles(
          entries: readonly ExplorerFileEntry[],
          selectedItemKey: string | null,
        ): void;
      }).replaceExplorerFiles([explorerEntry], "source-output");

      assert.deepEqual(openedResources, []);
      assert.deepEqual(reviewedResources, [resource.toString()]);

      (pane as unknown as {
        finishSourceReplace(completed: boolean): void;
      }).finishSourceReplace(true);

      assert.deepEqual(openedResources, [resource.toString()]);
      assert.deepEqual(reviewedResources, [resource.toString()]);
    } finally {
      pane.dispose();
    }
  });

  test("reviews appended URI imports before hover summary reads", () => {
    const reviewedResources: string[] = [];
    const resource = URI.file("/workspace/transfer/3.csv");
    const pane = createExplorerViewPane({
      onResolveReviewSummary: target => {
        reviewedResources.push(target.resource.toString());
      },
    });
    const explorerEntry = createExplorerImportEntry({
      fileName: "3.csv",
      itemKey: "source-transfer",
      relativePath: "transfer/3.csv",
      resource,
    });

    try {
      (pane as unknown as {
        appendExplorerFiles(entries: readonly ExplorerFileEntry[]): void;
      }).appendExplorerFiles([explorerEntry]);

      assert.deepEqual(reviewedResources, [resource.toString()]);
    } finally {
      pane.dispose();
    }
  });
});

type CreateExplorerViewPaneOptions = {
  readonly confirm?: IDialogService["confirm"];
  readonly files?: readonly ExplorerFileEntry[];
  readonly moveFileToTrash?: (resource: URI) => Promise<void>;
  readonly onFilesChange?: (files: readonly ExplorerFileEntry[]) => void;
  readonly onOpenTable?: (source: TableSource | null) => void;
  readonly onResolveReviewSummary?: (target: ReviewSummaryTarget) => void;
  readonly onUpdatePaneInput?: (input: ExplorerPaneInput) => void;
  readonly paneInput?: ExplorerPaneInput | null;
};

const createExplorerViewPane = (options: CreateExplorerViewPaneOptions = {}): ExplorerViewPane => {
  const uriFileService = new FileService();
  const uriIdentityService = new UriIdentityService(uriFileService);
  const decorationsService = createDecorationsService();
  const reviewService = createReviewService(options.onResolveReviewSummary);
  const pane = new ExplorerViewPane(
    {
      executeCommand: async () => undefined,
    } as unknown as ICommandService,
    createContextMenuService(),
    {
      confirm: options.confirm ?? (async () => ({ confirmed: false })),
      onDidShowDialog: Event.None,
      onWillShowDialog: Event.None,
    } as unknown as IDialogService,
    createExplorerService(
      options.paneInput ?? null,
      options.onUpdatePaneInput,
      options.files ?? [],
      options.onFilesChange,
    ),
    {
      getProvider: () => undefined,
      moveFileToTrash: options.moveFileToTrash ?? (async () => undefined),
    } as unknown as IFileService,
    createInstantiationService(createContextMenuService(), decorationsService, reviewService),
    {
      getAppearance: () => ({ explorer: DEFAULT_EXPLORER_APPEARANCE }),
      onDidChangeAppearance: Event.None,
    } as unknown as IAppearanceService,
    createViewsService(),
    {
      notify: () => undefined,
    } as unknown as INotificationService,
    {
      _serviceBrand: undefined,
      withProgress: async (_options, task) => task({ report: () => undefined }),
    } as IProgressService,
    {
      open: (source: TableSource | null) => options.onOpenTable?.(source),
    } as unknown as ITableService,
    createSliceService(),
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
    reviewService,
    uriIdentityService,
    {
      closeFolder: async () => undefined,
      openFolder: async () => undefined,
    } as unknown as IWorkspaceContextService,
  );
  const disposePane = pane.dispose.bind(pane);
  let disposed = false;
  pane.dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    disposePane();
    uriIdentityService.dispose();
    uriFileService.dispose();
  };
  return pane;
};

const createContextMenuService = (): IContextMenuService => ({
  showContextMenu: () => undefined,
} as unknown as IContextMenuService);

const createContextViewService = (): IContextViewService => ({
  getContextViewElement: () => document.createElement("div"),
  hideContextView: () => undefined,
  layout: () => undefined,
  showContextView: () => ({
    close: () => undefined,
  }),
} as unknown as IContextViewService);

const createInstantiationService = (
  contextMenuService: IContextMenuService,
  decorationsService: IDecorationsService,
  reviewService: IReviewService,
): IInstantiationService => {
  const contextViewService = createContextViewService();
  let instantiationService: IInstantiationService;
  const createInstance = (
    ctor: new (...args: never[]) => unknown,
    ...args: unknown[]
  ): unknown => {
    if (ctor === ExplorerView) {
      return new ExplorerView(
        args[0] as HTMLElement,
        args[1] as ConstructorParameters<typeof ExplorerView>[1],
        instantiationService,
        decorationsService,
      );
    }

    if (ctor === ExplorerViewer) {
      return new ExplorerViewer(
        args[0] as HTMLElement,
        args[1] as HTMLElement,
        args[2] as ConstructorParameters<typeof ExplorerViewer>[2],
        args[3] as ConstructorParameters<typeof ExplorerViewer>[3],
        contextMenuService,
        contextViewService,
        decorationsService,
        reviewService,
      );
    }

    throw new Error("Unexpected constructor in ExplorerViewPane test instantiation service.");
  };

  instantiationService = {
    _serviceBrand: undefined,
    createChild: () => {
      throw new Error("Unexpected child instantiation service request.");
    },
    createInstance,
    dispose: () => undefined,
    invokeFunction: () => {
      throw new Error("Unexpected function invocation in ExplorerViewPane test instantiation service.");
    },
  } as unknown as IInstantiationService;

  return instantiationService;
};

const createViewsService = (): IViewsService => ({
  _serviceBrand: undefined,
  getViewContainerNavigationState: (location: ViewContainerLocation) => ({
    activeViewContainerId: null,
    historyIndex: -1,
    historyLength: 0,
    location,
  }),
  openViewContainer: async () => null,
} as unknown as IViewsService);

const createExplorerService = (
  paneInput: ExplorerPaneInput | null,
  onUpdatePaneInput?: (input: ExplorerPaneInput) => void,
  initialFiles: readonly ExplorerFileEntry[] = [],
  onFilesChange?: (files: readonly ExplorerFileEntry[]) => void,
): IExplorerService => {
  let files = [...initialFiles];
  const updateFiles = (nextFiles: readonly ExplorerFileEntry[]): void => {
    files = [...nextFiles];
    onFilesChange?.(files);
  };

  return {
    _serviceBrand: undefined,
    expandedFolderKeys: [],
    get files() {
      return files;
    },
    isImportingSources: false,
    hoveredResource: null,
    onDidChangeExpandedFolderKeys: Event.None,
    onDidChangeFiles: Event.None,
    onDidChangeHoveredResource: Event.None,
    onDidChangePaneInput: Event.None,
    onDidChangeSelection: Event.None,
    onDidChangeViewLayout: Event.None,
    onDidChangeVisibleTargets: Event.None,
    selectedResource: null,
    selectedSheetId: null,
    viewLayout: "tree",
    appendFiles: (entries: readonly ExplorerFileEntry[]) => {
      updateFiles([...files, ...entries]);
      return entries;
    },
    applyBulkEdit: async () => undefined,
    getCollapsedFolderKeys: () => [],
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
    getPaneInput: () => paneInput,
    reconcileExpandedFolderKeys: () => [],
    refresh: async () => undefined,
    registerView: () => toDisposable(() => undefined),
    removeFiles: (fileIds: readonly string[]) => {
      const fileIdSet = new Set(fileIds);
      const removedFiles = files.filter(file => file.fileId && fileIdSet.has(file.fileId));
      updateFiles(files.filter(file => !file.fileId || !fileIdSet.has(file.fileId)));
      return removedFiles;
    },
    renameFile: () => undefined,
    replaceFiles: (entries: readonly ExplorerFileEntry[]) => {
      updateFiles(entries);
    },
    select: (resource: URI | null, _reveal?: unknown, sheetId?: string | null) => resource
      ? {
          resource,
          ...(sheetId ? { sheetId } : {}),
        }
      : null,
    setEditable: () => undefined,
    setExpandedFolderKeys: () => undefined,
    setHoveredResource: () => undefined,
    setImportingSources: () => undefined,
    setToCopy: () => undefined,
    setViewLayout: () => undefined,
    setVisibleTargets: () => undefined,
    toggleViewLayout: () => undefined,
    updatePaneInput: (input: ExplorerPaneInput) => {
      onUpdatePaneInput?.(input);
    },
  } as unknown as IExplorerService;
};

const createExplorerImportEntry = ({
  fileName,
  itemKey,
  relativePath,
  resource,
}: {
  readonly fileName: string;
  readonly itemKey: string;
  readonly relativePath: string;
  readonly resource: URI;
}): ExplorerFileEntry => {
  const file = new File(["A,B\n1,2"], fileName, {
    lastModified: 1,
    type: "text/csv",
  });
  const sourcePath = resource.fsPath;
  return {
    file,
    fileId: resource.toString(),
    fileName,
    itemKey,
    localImport: true,
    relativePath,
    resource,
    sourcePath,
  };
};

const createSliceService = (): ISliceService => ({
  _serviceBrand: undefined,
  onDidChangeResourceSliceResult: Event.None as ISliceService["onDidChangeResourceSliceResult"],
  onDidChangeSliceState: Event.None as ISliceService["onDidChangeSliceState"],
  onDidChangeTemplateSelection: Event.None as ISliceService["onDidChangeTemplateSelection"],
  cancelResource: () => undefined,
  getResourceResult: () => null,
  getResourceState: () => ({ state: "none" }),
  getState: () => ({
    queueLength: 0,
    templateSelections: [],
  }),
  getTemplateSelection: () => ({ kind: "auto" }),
  prioritizeResource: () => undefined,
  setTemplateSelection: () => undefined,
  submitResource: () => undefined,
});

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
    profileVersion: 0,
    workspaceFingerprint: "",
    profileFingerprint: "",
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

const createDecorationsService = (): IDecorationsService => ({
  _serviceBrand: undefined,
  onDidChangeDecorations: Event.None,
  getDecoration: () => undefined,
  getDecorationData: () => [],
  registerDecorationsProvider: () => toDisposable(() => undefined),
} as unknown as IDecorationsService);

const createReviewService = (
  onResolveReviewSummary?: (target: ReviewSummaryTarget) => void,
): IReviewService => ({
  _serviceBrand: undefined,
  onDidChangeReview: Event.None,
  getLatestReviewSummary: (target: ReviewSummaryTarget) => ({
    resource: target.resource,
    ...(target.sheetId ? { sheetId: target.sheetId } : {}),
    state: "missing",
    findingCodes: [],
  }),
  resolveReviewSummary: async (target: ReviewSummaryTarget) => {
    onResolveReviewSummary?.(target);
    return {
      resource: target.resource,
      ...(target.sheetId ? { sheetId: target.sheetId } : {}),
      state: "ready",
      findingCodes: [],
    };
  },
  reviewResourceManualTemplate: async () => {
    throw new Error("Unexpected URI manual review in explorer viewlet test.");
  },
  reviewResourceForExecution: async () => null,
} as unknown as IReviewService);
