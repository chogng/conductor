import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { ExplorerWorkflowService } from "../../../../../workbench/contrib/files/browser/explorerWorkflowService.ts";
import { IExplorerService, IExplorerWorkflowService } from "../../../../../workbench/contrib/files/browser/files.ts";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import {
  ADD_FOLDER_ACTION_ID,
  CLOSE_FILE_ITEM_COMMAND_ID,
  CLOSE_FOLDER_ACTION_ID,
  DELETE_FILE_ITEM_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import "../../browser/fileActions.contribution.ts";
import {
  addFolderHandler,
  closeFileItemHandler,
  closeFolderHandler,
  deleteFileItemHandler,
  renameFileItemHandler,
  setFileTemplateHandler,
  sliceFileWithTemplateHandler,
} from "../../browser/fileCommands.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("file item commands delegate to owning services", () => {
    const explorerWorkflowService = store.add(new ExplorerWorkflowService());
    let closedFileId: string | null = null;
    let deletedFileId: string | null = null;
    let slicedFileId: string | null = null;
    let renameSelection: unknown = null;
    let editableState: unknown = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const workflowRegistration = store.add(explorerWorkflowService.registerHandler({
      openFolderImport: () => undefined,
      closeFolder: () => undefined,
      closeFile: fileId => {
        closedFileId = fileId;
      },
      deleteFile: fileId => {
        deletedFileId = fileId;
      },
      sliceFileWithTemplate: fileId => {
        slicedFileId = fileId;
      },
    }));
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
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [IExplorerWorkflowService, explorerWorkflowService],
      [ISliceService, sliceService],
    ]);

    closeFileItemHandler(accessor, " file-1 ");
    deleteFileItemHandler(accessor, " file-2 ");
    renameFileItemHandler(accessor, "file-1");
    setFileTemplateHandler(accessor, "file-1", {
      kind: "saved",
      templateId: "template-1",
    });
    setFileTemplateHandler(accessor, "file-2", {
      kind: "saved",
      templateId: " ",
    });
    sliceFileWithTemplateHandler(accessor, " file-3 ");

    assert.equal(closedFileId, "file-1");
    assert.equal(deletedFileId, "file-2");
    assert.equal(slicedFileId, "file-3");
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
    workflowRegistration.dispose();
    explorerWorkflowService.dispose();
  });

  test("folder commands delegate to explorer workflow service", () => {
    const explorerWorkflowService = store.add(new ExplorerWorkflowService());
    let importRequests = 0;
    let closeRequests = 0;
    const workflowRegistration = store.add(explorerWorkflowService.registerHandler({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: () => {
        closeRequests += 1;
      },
      closeFile: () => undefined,
      deleteFile: () => undefined,
      sliceFileWithTemplate: () => undefined,
    }));
    const accessor = createAccessor([
      [IExplorerWorkflowService, explorerWorkflowService],
    ]);

    addFolderHandler(accessor);
    closeFolderHandler(accessor);

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    workflowRegistration.dispose();
    explorerWorkflowService.dispose();
  });

  test("registered Action2 command entries delegate to files handlers", () => {
    const explorerWorkflowService = store.add(new ExplorerWorkflowService());
    let importRequests = 0;
    let closeRequests = 0;
    let closedFileId: string | null = null;
    let deletedFileId: string | null = null;
    let slicedFileId: string | null = null;
    let renameSelection: unknown = null;
    let editableState: unknown = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const workflowRegistration = store.add(explorerWorkflowService.registerHandler({
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
      },
      sliceFileWithTemplate: fileId => {
        slicedFileId = fileId;
      },
    }));
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
      [IExplorerWorkflowService, explorerWorkflowService],
      [ISliceService, sliceService],
    ]);

    CommandsRegistry.getCommand(ADD_FOLDER_ACTION_ID)?.handler(accessor);
    CommandsRegistry.getCommand(CLOSE_FOLDER_ACTION_ID)?.handler(accessor);
    CommandsRegistry.getCommand(CLOSE_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");
    CommandsRegistry.getCommand(DELETE_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-2");
    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");
    CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID)?.handler(accessor, "file-2", {
      kind: "auto",
    });
    CommandsRegistry.getCommand(SLICE_FILE_WITH_TEMPLATE_COMMAND_ID)?.handler(accessor, "file-2");

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
    assert.equal(slicedFileId, "file-2");
    assert.ok(CommandsRegistry.getCommand(ADD_FOLDER_ACTION_ID));
    assert.ok(CommandsRegistry.getCommand(CLOSE_FOLDER_ACTION_ID));
    assert.ok(CommandsRegistry.getCommand(CLOSE_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(DELETE_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(SLICE_FILE_WITH_TEMPLATE_COMMAND_ID));
    workflowRegistration.dispose();
    explorerWorkflowService.dispose();
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
