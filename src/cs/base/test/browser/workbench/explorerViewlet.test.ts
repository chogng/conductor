/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { toDisposable } from "src/cs/base/common/lifecycle";
import type {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import {
  type IExplorerService,
  type IExplorerWorkflowService,
} from "src/cs/workbench/contrib/files/browser/files";
import { DEFAULT_EXPLORER_APPEARANCE } from "src/cs/workbench/services/appearance/common/appearance";
import type { ITemplateService, TemplateState } from "src/cs/workbench/services/template/common/template";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

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
});

const createExplorerViewPane = (): ExplorerViewPane =>
  new ExplorerViewPane(
    {
      executeCommand: async () => undefined,
    },
    {
      showContextMenu: () => undefined,
    } as unknown as IContextMenuService,
    {} as unknown as IContextViewService,
    createExplorerService(),
    {
      registerHandler: () => toDisposable(() => undefined),
    } as unknown as IExplorerWorkflowService,
    {},
    {
      getProvider: () => undefined,
    },
    {
      getAppearance: () => ({ explorer: DEFAULT_EXPLORER_APPEARANCE }),
      onDidChangeAppearance: Event.None,
    },
    {},
    {
      notify: () => undefined,
    },
    {
      getSnapshot: () => ({ filesById: {}, fileOrder: [] }),
      removeFiles: () => undefined,
      renameFile: () => undefined,
    },
    {
      onDidChangePreview: Event.None,
      get: () => ({ kind: "idle" }),
      invalidate: () => undefined,
      prefetch: () => undefined,
      request: () => ({ kind: "idle" }),
    },
    {
      clear: () => undefined,
      drawPlotThumbnail: () => undefined,
      warmPlotThumbnail: () => undefined,
    },
    createTemplateService(),
  );

const createExplorerService = (): IExplorerService => ({
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
  getPaneInput: () => null,
  reconcileExpandedFolderKeys: () => [],
  refresh: async () => undefined,
  registerView: () => toDisposable(() => undefined),
  select: target => target.fileId,
  setEditable: () => undefined,
  setExpandedFolderKeys: () => undefined,
  setHoveredFileId: () => undefined,
  setPendingSourceFiles: () => undefined,
  setToCopy: () => undefined,
  setViewLayout: () => undefined,
  setVisibleFileIds: () => undefined,
  toggleViewLayout: () => undefined,
  updatePaneInput: () => undefined,
});

const createTemplateService = (): ITemplateService => ({
  _serviceBrand: undefined,
  onDidChangeTemplateList: Event.None,
  onDidChangeTemplateState: Event.None,
  onDidChangeTemplateViewInput: Event.None,
  cancelTemplateEditor: () => undefined,
  createTemplateDraft: () => undefined,
  deleteTemplate: async () => undefined,
  downloadTemplateBundle: () => "",
  editTemplate: () => false,
  exportTemplate: () => null,
  finishTemplateEditor: () => undefined,
  getCachedTemplates: () => [],
  getState: () => EmptyTemplateState,
  getTemplateList: () => [],
  getTemplates: async () => [],
  getViewInput: () => null,
  hasLoadedTemplateList: () => true,
  refreshTemplates: async () => [],
  saveTemplate: async template => template,
  selectTemplate: () => false,
  setFileTemplateSelection: () => undefined,
  setFormState: () => undefined,
  setMode: () => undefined,
  setSelectedTemplateId: () => undefined,
  setSelectionsByFileId: () => undefined,
  updateViewInput: () => undefined,
});

const EmptyTemplateState: TemplateState = {
  formState: {},
  mode: "management",
  selectedTemplateId: null,
  selectionsByFileId: {},
  templateListVersion: 0,
};
