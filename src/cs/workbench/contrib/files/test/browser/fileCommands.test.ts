import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { IExplorerService } from "../../../../../workbench/contrib/files/browser/files.ts";
import type { ExplorerViewPane } from "../../../../../workbench/contrib/files/browser/explorerViewlet.ts";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  ADD_FOLDER_ACTION_ID,
  CLOSE_FILE_ITEM_COMMAND_ID,
  CLOSE_FOLDER_ACTION_ID,
  DELETE_FILE_ITEM_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import "../../browser/fileActions.contribution.ts";
import {
  addFolderHandler,
  closeFileItemHandler,
  closeFolderHandler,
  deleteFileItemHandler,
  renameFileItemHandler,
  setFileTemplateHandler,
} from "../../browser/fileCommands.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("file item commands delegate to owning services", async () => {
    let closedFileId: string | null = null;
    let deletedFileId: string | null = null;
    let renameSelection: unknown = null;
    let editableState: unknown = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const sliceService = {
      _serviceBrand: undefined,
      setTemplateSelection: (fileId: string, selection: TemplateSelection) => {
        templateSelection = { fileId, selection };
      },
    } as unknown as ISliceService;
    const explorerService = createExplorerServiceStub({
      onSelect: (target, reveal) => {
        renameSelection = { reveal, target };
      },
      onSetEditable: (state) => {
        editableState = state;
      },
    });
    const explorerView = createExplorerViewStub({
      closeFile: fileId => {
        closedFileId = fileId;
      },
      deleteFile: fileId => {
        deletedFileId = fileId;
        return Promise.resolve();
      },
    });
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [IViewsService, createViewsServiceStub(explorerView)],
      [ISliceService, sliceService],
    ]);

    closeFileItemHandler(accessor, " file-1 ");
    deleteFileItemHandler(accessor, " file-2 ");
    await flushPromises();
    renameFileItemHandler(accessor, "file-1");
    setFileTemplateHandler(accessor, "file-1", {
      kind: "saved",
      templateId: "template-1",
    });
    setFileTemplateHandler(accessor, "file-2", {
      kind: "saved",
      templateId: " ",
    });

    assert.equal(closedFileId, "file-1");
    assert.equal(deletedFileId, "file-2");
    assert.deepEqual(renameSelection, {
      reveal: "force",
      target: {
        fileId: "file-1",
        kind: "table",
      },
    });
    assert.deepEqual(editableState, {
      isEditing: true,
      resource: {
        fileId: "file-1",
        kind: "table",
      },
    });
    assert.deepEqual(templateSelection, {
      fileId: "file-1",
      selection: {
        kind: "saved",
        templateId: "template-1",
      },
    });
  });

  test("folder commands open the explorer view and delegate to view-local workflow", async () => {
    let importRequests = 0;
    let closeRequests = 0;
    const explorerView = createExplorerViewStub({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: () => {
        closeRequests += 1;
      },
    });
    const accessor = createAccessor([
      [IViewsService, createViewsServiceStub(explorerView)],
    ]);

    addFolderHandler(accessor);
    closeFolderHandler(accessor);
    await flushPromises();

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
  });

  test("registered Action2 command entries delegate to files handlers", async () => {
    let importRequests = 0;
    let closeRequests = 0;
    let closedFileId: string | null = null;
    let deletedFileId: string | null = null;
    let renameSelection: unknown = null;
    let editableState: unknown = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const explorerView = createExplorerViewStub({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: () => {
        closeRequests += 1;
      },
      closeFile: fileId => {
        closedFileId = fileId;
      },
      deleteFile: fileId => {
        deletedFileId = fileId;
        return Promise.resolve();
      },
    });
    const explorerService = createExplorerServiceStub({
      onSelect: (target, reveal) => {
        renameSelection = { reveal, target };
      },
      onSetEditable: (state) => {
        editableState = state;
      },
    });
    const sliceService = {
      _serviceBrand: undefined,
      setTemplateSelection: (fileId: string, selection: TemplateSelection) => {
        templateSelection = { fileId, selection };
      },
    } as unknown as ISliceService;
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [IViewsService, createViewsServiceStub(explorerView)],
      [ISliceService, sliceService],
    ]);

    CommandsRegistry.getCommand(ADD_FOLDER_ACTION_ID)?.handler(accessor);
    CommandsRegistry.getCommand(CLOSE_FOLDER_ACTION_ID)?.handler(accessor);
    CommandsRegistry.getCommand(CLOSE_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");
    CommandsRegistry.getCommand(DELETE_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-2");
    await flushPromises();
    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");
    CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID)?.handler(accessor, "file-2", {
      kind: "auto",
    });

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    assert.equal(closedFileId, "file-1");
    assert.equal(deletedFileId, "file-2");
    assert.deepEqual(renameSelection, {
      reveal: "force",
      target: {
        fileId: "file-1",
        kind: "table",
      },
    });
    assert.deepEqual(editableState, {
      isEditing: true,
      resource: {
        fileId: "file-1",
        kind: "table",
      },
    });
    assert.deepEqual(templateSelection, {
      fileId: "file-2",
      selection: { kind: "auto" },
    });
    assert.ok(CommandsRegistry.getCommand(ADD_FOLDER_ACTION_ID));
    assert.ok(CommandsRegistry.getCommand(CLOSE_FOLDER_ACTION_ID));
    assert.ok(CommandsRegistry.getCommand(CLOSE_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(DELETE_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID));
  });
});

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T =>
      values.get(id as ServiceIdentifier<unknown>) as T,
  };
}

function createExplorerServiceStub({
  onSelect,
  onSetEditable,
}: {
  readonly onSelect: (target: unknown, reveal: unknown) => void;
  readonly onSetEditable: (state: unknown) => void;
}): IExplorerService {
  return {
    _serviceBrand: undefined,
    getPaneInput: () => ({
      files: [],
      mode: "table",
      selectedFileId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    }),
    select: (target: unknown, reveal: unknown) => {
      onSelect(target, reveal);
      return "file-1";
    },
    setEditable: (state: unknown) => {
      onSetEditable(state);
    },
  } as unknown as IExplorerService;
}

function createViewsServiceStub(explorerView: ExplorerViewPane): IViewsService {
  return {
    _serviceBrand: undefined,
    openView: async () => explorerView,
  } as unknown as IViewsService;
}

function createExplorerViewStub(methods: Partial<ExplorerViewPane>): ExplorerViewPane {
  return {
    openFolderImport: () => undefined,
    closeFolder: () => undefined,
    closeFile: () => undefined,
    deleteFile: () => Promise.resolve(),
    ...methods,
  } as unknown as ExplorerViewPane;
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
