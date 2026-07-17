import assert from "assert";

import type { CancellationToken } from "src/cs/base/common/cancellation";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { URI } from "src/cs/base/common/uri";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { IExplorerService } from "../../../../../workbench/contrib/files/browser/files.ts";
import type { ExplorerViewPane } from "../../../../../workbench/contrib/files/browser/explorerViewlet.ts";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  INotificationService,
  NoOpNotification,
  type NotificationMessage,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
  IReviewService,
  type ReviewReevaluationResult,
} from "src/cs/workbench/services/review/common/review";
import {
  ADD_FOLDER_COMMAND_ID,
  CLOSE_FILE_ITEM_COMMAND_ID,
  CLOSE_FOLDER_COMMAND_ID,
  DELETE_FILE_ITEM_COMMAND_ID,
  REEVALUATE_ALL_FILE_REVIEWS_COMMAND_ID,
  REEVALUATE_FILE_REVIEW_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/browser/fileActions";
import "../../browser/fileActions.contribution.ts";
import {
  addFolderHandler,
  closeFileItemHandler,
  closeFolderHandler,
  deleteFileItemHandler,
  reevaluateAllFileReviewsHandler,
  reevaluateFileReviewHandler,
  renameFileItemHandler,
  setFileTemplateHandler,
} from "../../browser/fileCommands.ts";
import type { ExplorerFileEntry } from "../../common/explorerModel.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("file item commands delegate to owning services", async () => {
    const resource1 = URI.file("/workspace/file-1.csv");
    const resource2 = URI.file("/workspace/file-2.csv");
    let closedTarget: unknown = null;
    let deletedTarget: unknown = null;
    let renameSelection: unknown = null;
    let editableState: unknown = null;
    let templateSelection:
      | { readonly resource: URI; readonly sheetId: string | null; readonly selection: TemplateSelection }
      | null = null;
    const sliceService = {
      _serviceBrand: undefined,
      setTemplateSelection: (resource: URI, sheetId: string | null | undefined, selection: TemplateSelection) => {
        templateSelection = { resource, sheetId: sheetId ?? null, selection };
      },
    } as unknown as ISliceService;
    const explorerService = createExplorerServiceStub({
      files: [
        { fileId: "file-1", fileName: "file-1.csv", resource: resource1 },
        { fileId: "file-2", fileName: "file-2.csv", resource: resource2 },
      ],
      onSelect: (target, reveal) => {
        renameSelection = { ...(target as object), reveal };
      },
      onSetEditable: (state) => {
        editableState = state;
      },
    });
    const explorerView = createExplorerViewStub({
      closeFile: target => {
        closedTarget = target;
      },
      deleteFile: target => {
        deletedTarget = target;
        return Promise.resolve();
      },
    });
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [IViewsService, createViewsServiceStub(explorerView)],
      [ISliceService, sliceService],
    ]);

    closeFileItemHandler(accessor, { resource: resource1 });
    deleteFileItemHandler(accessor, { resource: resource2 });
    await flushPromises();
    renameFileItemHandler(accessor, { resource: resource1 });
    setFileTemplateHandler(accessor, { resource: resource1 }, {
      kind: "saved",
      templateId: "template-1",
    });
    setFileTemplateHandler(accessor, { resource: resource2 }, {
      kind: "saved",
      templateId: " ",
    });

    assert.deepEqual(closedTarget, { resource: resource1 });
    assert.deepEqual(deletedTarget, { resource: resource2 });
    assert.deepEqual(renameSelection, {
      reveal: "force",
      resource: resource1,
      sheetId: null,
    });
    assert.deepEqual(editableState, {
      isEditing: true,
      resource: {
        resource: resource1,
      },
    });
    assert.deepEqual(templateSelection, {
      resource: resource1,
      sheetId: null,
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
      closeFolder: async () => {
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
    const resource1 = URI.file("/workspace/file-1.csv");
    const resource2 = URI.file("/workspace/file-2.csv");
    let closedTarget: unknown = null;
    let deletedTarget: unknown = null;
    let renameSelection: unknown = null;
    let editableState: unknown = null;
    let templateSelection:
      | { readonly resource: URI; readonly sheetId: string | null; readonly selection: TemplateSelection }
      | null = null;
    const explorerView = createExplorerViewStub({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: async () => {
        closeRequests += 1;
      },
      closeFile: target => {
        closedTarget = target;
      },
      deleteFile: target => {
        deletedTarget = target;
        return Promise.resolve();
      },
    });
    const explorerService = createExplorerServiceStub({
      files: [
        { fileId: "file-1", fileName: "file-1.csv", resource: resource1 },
        { fileId: "file-2", fileName: "file-2.csv", resource: resource2 },
      ],
      onSelect: (target, reveal) => {
        renameSelection = { ...(target as object), reveal };
      },
      onSetEditable: (state) => {
        editableState = state;
      },
    });
    const sliceService = {
      _serviceBrand: undefined,
      setTemplateSelection: (resource: URI, sheetId: string | null | undefined, selection: TemplateSelection) => {
        templateSelection = { resource, sheetId: sheetId ?? null, selection };
      },
    } as unknown as ISliceService;
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [IViewsService, createViewsServiceStub(explorerView)],
      [ISliceService, sliceService],
    ]);

    CommandsRegistry.getCommand(ADD_FOLDER_COMMAND_ID)?.handler(accessor);
    CommandsRegistry.getCommand(CLOSE_FOLDER_COMMAND_ID)?.handler(accessor);
    CommandsRegistry.getCommand(CLOSE_FILE_ITEM_COMMAND_ID)?.handler(accessor, { resource: resource1 });
    CommandsRegistry.getCommand(DELETE_FILE_ITEM_COMMAND_ID)?.handler(accessor, { resource: resource2 });
    await flushPromises();
    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, { resource: resource1 });
    CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID)?.handler(accessor, { resource: resource2 }, {
      kind: "auto",
    });

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    assert.deepEqual(closedTarget, { resource: resource1 });
    assert.deepEqual(deletedTarget, { resource: resource2 });
    assert.deepEqual(renameSelection, {
      reveal: "force",
      resource: resource1,
      sheetId: null,
    });
    assert.deepEqual(editableState, {
      isEditing: true,
      resource: {
        resource: resource1,
      },
    });
    assert.deepEqual(templateSelection, {
      resource: resource2,
      sheetId: null,
      selection: { kind: "auto" },
    });
    assert.ok(CommandsRegistry.getCommand(ADD_FOLDER_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(CLOSE_FOLDER_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(CLOSE_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(DELETE_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(REEVALUATE_ALL_FILE_REVIEWS_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(REEVALUATE_FILE_REVIEW_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID));
    assert.ok(CommandsRegistry.getCommand(SET_FILE_TEMPLATE_COMMAND_ID));
  });

  test("reevaluates one exact Explorer row and all unique rows with bounded concurrency", async () => {
    const files = Array.from({ length: 12 }, (_, index) => ({
      fileId: `file-${index}`,
      fileName: `file-${index}.csv`,
      resource: URI.file(`/workspace/file-${index}.csv`),
      ...(index === 0 ? { sheetId: "table-a" } : {}),
    }));
    files.push({
      ...files[0],
      fileId: "file-0-duplicate",
    });
    const explorerService = createExplorerServiceStub({
      files,
      onSelect: () => undefined,
      onSetEditable: () => undefined,
    });
    const reevaluatedTargets: string[] = [];
    let activeCount = 0;
    let maximumActiveCount = 0;
    const reviewService = {
      _serviceBrand: undefined,
      reevaluate: async (
        target: Parameters<IReviewService["reevaluate"]>[0],
      ): Promise<ReviewReevaluationResult> => {
        reevaluatedTargets.push(`${target.resource.toString()}#${target.sheetId ?? ""}`);
        activeCount += 1;
        maximumActiveCount = Math.max(maximumActiveCount, activeCount);
        await new Promise(resolve => setTimeout(resolve, 0));
        activeCount -= 1;
        return {
          persistence: "stored",
          summary: {
            resource: target.resource,
            ...(target.sheetId ? { sheetId: target.sheetId } : {}),
            state: "missing",
            findingCodes: [],
          },
        };
      },
    } as unknown as IReviewService;
    const notifications: Array<NotificationMessage | NotificationMessage[]> = [];
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [INotificationService, createNotificationServiceStub(notifications)],
      [IReviewService, reviewService],
    ]);

    await reevaluateFileReviewHandler(accessor, {
      resource: files[0].resource,
      sheetId: "table-a",
    });
    reevaluatedTargets.length = 0;
    maximumActiveCount = 0;
    await reevaluateAllFileReviewsHandler(accessor);

    assert.deepStrictEqual({
      maximumActiveCount,
      targetCount: reevaluatedTargets.length,
      uniqueTargetCount: new Set(reevaluatedTargets).size,
    }, {
      maximumActiveCount: 8,
      targetCount: 12,
      uniqueTargetCount: 12,
    });
  });

  test("a newer reevaluate-all run cancels and immediately supersedes the active run", async () => {
    const resource = URI.file("/workspace/file.csv");
    const explorerService = createExplorerServiceStub({
      files: [{
        fileId: "file",
        fileName: "file.csv",
        resource,
      }],
      onSelect: () => undefined,
      onSetEditable: () => undefined,
    });
    const tokens: CancellationToken[] = [];
    const reviewService = {
      _serviceBrand: undefined,
      reevaluate: (
        target: Parameters<IReviewService["reevaluate"]>[0],
        token: CancellationToken,
      ): Promise<ReviewReevaluationResult | null> => {
        tokens.push(token);
        if (tokens.length === 1) {
          return new Promise(resolve => {
            const listener = token.onCancellationRequested(() => {
              listener.dispose();
              resolve(null);
            });
          });
        }
        return Promise.resolve({
          persistence: "stored",
          summary: {
            resource: target.resource,
            state: "missing",
            findingCodes: [],
          },
        });
      },
    } as unknown as IReviewService;
    const notifications: Array<NotificationMessage | NotificationMessage[]> = [];
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [INotificationService, createNotificationServiceStub(notifications)],
      [IReviewService, reviewService],
    ]);

    const first = reevaluateAllFileReviewsHandler(accessor);
    await waitUntil(() => tokens.length === 1);
    const second = reevaluateAllFileReviewsHandler(accessor);
    await waitUntil(() => tokens.length === 2);

    assert.equal(tokens[0]?.isCancellationRequested, true);
    assert.equal(tokens[1]?.isCancellationRequested, false);
    await Promise.all([first, second]);
    assert.equal(notifications.length, 3);
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
  files = [],
  onSelect,
  onSetEditable,
}: {
  readonly files?: ExplorerFileEntry[];
  readonly onSelect: (target: unknown, reveal: unknown) => void;
  readonly onSetEditable: (state: unknown) => void;
}): IExplorerService {
  return {
    _serviceBrand: undefined,
    files,
    selectedResource: null,
    selectedSheetId: null,
    select: (resource: URI | null, reveal: unknown, sheetId?: string | null) => {
      onSelect({ resource, sheetId: sheetId ?? null }, reveal);
      return {
        resource,
        ...(sheetId ? { sheetId } : {}),
      };
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
    closeFolder: async () => undefined,
    closeFile: () => undefined,
    deleteFile: () => Promise.resolve(),
    ...methods,
  } as unknown as ExplorerViewPane;
}

function createNotificationServiceStub(
  notifications: Array<NotificationMessage | NotificationMessage[]>,
): INotificationService {
  const service: Partial<INotificationService> = {
    _serviceBrand: undefined,
    error: message => {
      notifications.push(message);
    },
    info: message => {
      notifications.push(message);
    },
    notify: notification => {
      notifications.push(notification.message);
      return new NoOpNotification();
    },
    status: message => {
      notifications.push(message);
      return {
        close: () => undefined,
      };
    },
    warn: message => {
      notifications.push(message);
    },
  };
  return service as INotificationService;
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const waitUntil = async (
  condition: () => boolean,
  attempts = 20,
): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.fail("Timed out waiting for condition.");
};
