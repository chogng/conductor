import assert from "assert";

import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { ExplorerWorkflowService } from "../../../../../workbench/contrib/files/browser/explorerWorkflowService.ts";
import { IExplorerWorkflowService } from "../../../../../workbench/contrib/files/browser/files.ts";
import { ITemplateService } from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import {
  ADD_FOLDER_ACTION_ID,
  REMOVE_FILE_ITEM_COMMAND_ID,
  REMOVE_FOLDER_ACTION_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import "../../browser/fileActions.contribution.ts";
import {
  addFolderHandler,
  removeFileItemHandler,
  removeFolderHandler,
  setFileTemplateHandler,
} from "../../browser/fileCommands.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  test("file item commands delegate to owning services", () => {
    const explorerWorkflowService = new ExplorerWorkflowService();
    let removedFileId: string | null = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const workflowRegistration = explorerWorkflowService.registerHandler({
      openFolderImport: () => undefined,
      removeSelectedFolder: () => undefined,
      removeFile: fileId => {
        removedFileId = fileId;
      },
    });
    const templateService = {
      _serviceBrand: undefined,
      setSelectionsByFileId: (updater: (previous: Record<string, TemplateSelection>) => Record<string, TemplateSelection>) => {
        const next = updater({});
        const selection = next["file-1"];
        if (selection) {
          templateSelection = { fileId: "file-1", selection };
        }
      },
    } as unknown as ITemplateService;
    const accessor = createAccessor([
      [IExplorerWorkflowService, explorerWorkflowService],
      [ITemplateService, templateService],
    ]);

    removeFileItemHandler(accessor, " file-1 ");
    setFileTemplateHandler(accessor, "file-1", {
      kind: "template",
      templateId: "template-1",
    });
    setFileTemplateHandler(accessor, "file-2", {
      kind: "template",
      templateId: " ",
    });

    assert.equal(removedFileId, "file-1");
    assert.deepEqual(templateSelection, {
      fileId: "file-1",
      selection: {
        kind: "template",
        templateId: "template-1",
      },
    });
    workflowRegistration.dispose();
    explorerWorkflowService.dispose();
  });

  test("folder commands delegate to explorer workflow service", () => {
    const explorerWorkflowService = new ExplorerWorkflowService();
    let importRequests = 0;
    let removalRequests = 0;
    const workflowRegistration = explorerWorkflowService.registerHandler({
      openFolderImport: () => {
        importRequests += 1;
      },
      removeSelectedFolder: () => {
        removalRequests += 1;
      },
      removeFile: () => undefined,
    });
    const accessor = createAccessor([
      [IExplorerWorkflowService, explorerWorkflowService],
    ]);

    addFolderHandler(accessor);
    removeFolderHandler(accessor);

    assert.equal(importRequests, 1);
    assert.equal(removalRequests, 1);
    workflowRegistration.dispose();
    explorerWorkflowService.dispose();
  });

  test("registered Action2 command entries delegate to files handlers", () => {
    const explorerWorkflowService = new ExplorerWorkflowService();
    let importRequests = 0;
    let removalRequests = 0;
    let removedFileId: string | null = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const workflowRegistration = explorerWorkflowService.registerHandler({
      openFolderImport: () => {
        importRequests += 1;
      },
      removeSelectedFolder: () => {
        removalRequests += 1;
      },
      removeFile: fileId => {
        removedFileId = fileId;
      },
    });
    const templateService = {
      _serviceBrand: undefined,
      setSelectionsByFileId: (updater: (previous: Record<string, TemplateSelection>) => Record<string, TemplateSelection>) => {
        const next = updater({});
        const selection = next["file-2"];
        if (selection) {
          templateSelection = { fileId: "file-2", selection };
        }
      },
    } as unknown as ITemplateService;
    const accessor = createAccessor([
      [IExplorerWorkflowService, explorerWorkflowService],
      [ITemplateService, templateService],
    ]);

    CommandsRegistry.getCommand(ADD_FOLDER_ACTION_ID)?.handler(accessor);
    CommandsRegistry.getCommand(REMOVE_FOLDER_ACTION_ID)?.handler(accessor);
    CommandsRegistry.getCommand(REMOVE_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");
    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");
    CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID)?.handler(accessor, "file-2", {
      kind: "auto",
    });
    CommandsRegistry.getCommand(SLICE_FILE_WITH_TEMPLATE_COMMAND_ID)?.handler(accessor, "file-2", {
      kind: "auto",
    });

    assert.equal(importRequests, 1);
    assert.equal(removalRequests, 1);
    assert.equal(removedFileId, "file-1");
    assert.deepEqual(templateSelection, {
      fileId: "file-2",
      selection: { kind: "auto" },
    });
    assert.ok(CommandsRegistry.getCommand(ADD_FOLDER_ACTION_ID));
    assert.ok(CommandsRegistry.getCommand(REMOVE_FOLDER_ACTION_ID));
    assert.ok(CommandsRegistry.getCommand(REMOVE_FILE_ITEM_COMMAND_ID));
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
