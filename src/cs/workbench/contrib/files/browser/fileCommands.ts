/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Action } from "src/cs/base/common/actions";
import { getErrorMessage } from "src/cs/base/common/errors";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import {
  IExplorerService,
  ExplorerViewId,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import {
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
  type ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
  IReviewService,
  type ReviewReevaluationResult,
} from "src/cs/workbench/services/review/common/review";

const ReviewReevaluationConcurrency = 8;
const ReviewReevaluationNotificationId = "files.reviewReevaluation";

export const addFolderHandler: ICommandHandler = accessor => {
  withExplorerView(accessor, explorerView => explorerView.openFolderImport());
};

export const closeFolderHandler: ICommandHandler = accessor => {
  withExplorerView(accessor, explorerView => explorerView.closeFolder());
};

export const closeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.closeFile(resourceIdentity));
};

export const deleteFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.deleteFile(resourceIdentity));
};

export const renameFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  const explorerService = accessor.get(IExplorerService);
  explorerService.select(resourceIdentity.resource, "force", resourceIdentity.sheetId ?? null);
  explorerService.setEditable({
    resource: resourceIdentity,
    isEditing: true,
  });
};

export const reevaluateFileReviewHandler: ICommandHandler<[unknown], Promise<void>> = async (
  accessor,
  target,
) => {
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  const notificationService = accessor.get(INotificationService);
  const status = notificationService.status(localize(
    "files.reviewReevaluation.single.progress",
    "Reevaluating Review...",
  ));
  try {
    const result = await accessor.get(IReviewService).reevaluate(resourceIdentity);
    notifySingleReviewReevaluationResult(notificationService, result);
  } catch (error) {
    notificationService.error(localize(
      "files.reviewReevaluation.single.failed",
      "Failed to reevaluate Review: {message}",
      { message: getErrorMessage(error) },
    ));
  } finally {
    status.close();
  }
};

export const reevaluateAllFileReviewsHandler: ICommandHandler<[], Promise<void>> = async accessor => {
  const explorerService = accessor.get(IExplorerService);
  const notificationService = accessor.get(INotificationService);
  const targets = getUniqueExplorerReviewTargets(explorerService.files);
  if (!targets.length) {
    notificationService.info(localize(
      "files.reviewReevaluation.all.empty",
      "No file reviews are available to reevaluate.",
    ));
    return;
  }

  await reevaluateExplorerReviews({
    notificationService,
    reviewService: accessor.get(IReviewService),
    targets,
  });
};

export const setFileTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  accessor,
  target,
  selection,
) => {
  const resourceIdentity = normalizeCommandResourceIdentity(target);
  if (!resourceIdentity || !isTemplateSelection(selection)) {
    return;
  }

  const sliceService = accessor.get(ISliceService);
  sliceService.setTemplateSelection(resourceIdentity.resource, resourceIdentity.sheetId ?? null, selection);
};

const notifySingleReviewReevaluationResult = (
  notificationService: Pick<INotificationService, "info" | "warn">,
  result: ReviewReevaluationResult | null,
): void => {
  if (!result) {
    notificationService.warn(localize(
      "files.reviewReevaluation.single.superseded",
      "Review reevaluation did not complete because the resource changed.",
    ));
    return;
  }
  if (result.persistence === "stored") {
    notificationService.info(localize(
      "files.reviewReevaluation.single.stored",
      "Review was reevaluated and saved.",
    ));
    return;
  }
  if (result.persistence === "cleared") {
    notificationService.info(localize(
      "files.reviewReevaluation.single.cleared",
      "Review was reevaluated and the previous saved result was cleared.",
    ));
    return;
  }

  notificationService.warn(localize(
    "files.reviewReevaluation.single.unavailable",
    "Review was reevaluated, but the result could not be saved to workspace storage.",
  ));
};

const reevaluateExplorerReviews = async ({
  notificationService,
  reviewService,
  targets,
}: {
  readonly notificationService: INotificationService;
  readonly reviewService: IReviewService;
  readonly targets: readonly ExplorerResourceIdentity[];
}): Promise<void> => {
  const disposables = new DisposableStore();
  let cancelled = false;
  let completedWork = 0;
  let reevaluatedCount = 0;
  let unavailablePersistenceCount = 0;
  let failedCount = 0;
  const cancelAction = disposables.add(new Action(
    "files.reviewReevaluation.cancel",
    localize("files.reviewReevaluation.cancel", "Cancel"),
    "",
    true,
    () => {
      cancelled = true;
    },
  ));
  const progressNotification = notificationService.notify({
    id: ReviewReevaluationNotificationId,
    severity: Severity.Info,
    sticky: true,
    message: createReviewReevaluationProgressMessage(completedWork, targets.length),
    actions: {
      primary: [cancelAction],
    },
  });

  let nextTargetIndex = 0;
  const runWorker = async (): Promise<void> => {
    while (!cancelled) {
      const targetIndex = nextTargetIndex;
      nextTargetIndex += 1;
      const target = targets[targetIndex];
      if (!target) {
        return;
      }

      try {
        const result = await reviewService.reevaluate(target);
        if (!result) {
          failedCount += 1;
        } else {
          reevaluatedCount += 1;
          if (result.persistence === "unavailable") {
            unavailablePersistenceCount += 1;
          }
        }
      } catch (error) {
        failedCount += 1;
        console.warn("Failed to reevaluate Review.", error);
      } finally {
        completedWork += 1;
        progressNotification.updateMessage(
          createReviewReevaluationProgressMessage(completedWork, targets.length),
        );
      }
    }
  };

  try {
    const workerCount = Math.min(ReviewReevaluationConcurrency, targets.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  } finally {
    progressNotification.close();
    disposables.dispose();
  }

  const cancelledCount = Math.max(0, targets.length - completedWork);
  if (!failedCount && !unavailablePersistenceCount && !cancelledCount) {
    notificationService.info(localize(
      "files.reviewReevaluation.all.complete",
      "Reevaluated and updated persisted Review state for {count} file(s).",
      { count: reevaluatedCount },
    ));
    return;
  }

  notificationService.warn(localize(
    "files.reviewReevaluation.all.completedWithIssues",
    "Review reevaluation finished: {completed} completed, {unsaved} not saved, {failed} failed, {cancelled} cancelled.",
    {
      cancelled: cancelledCount,
      completed: reevaluatedCount,
      failed: failedCount,
      unsaved: unavailablePersistenceCount,
    },
  ));
};

const createReviewReevaluationProgressMessage = (
  completed: number,
  total: number,
): string => localize(
  "files.reviewReevaluation.all.progress",
  "Reevaluating file reviews: {completed} of {total}",
  { completed, total },
);

const getUniqueExplorerReviewTargets = (
  files: readonly ExplorerFileEntry[],
): ExplorerResourceIdentity[] => {
  const targetsByKey = new Map<string, ExplorerResourceIdentity>();
  for (const file of files) {
    const target = getExplorerFileResourceIdentity(file);
    const key = getExplorerResourceIdentityKey(target);
    if (target && key && !targetsByKey.has(key)) {
      targetsByKey.set(key, target);
    }
  }
  return [...targetsByKey.values()];
};

const normalizeCommandString = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const resolveCommandExplorerResourceIdentity = (
  accessor: Parameters<ICommandHandler>[0],
  target: unknown,
): ExplorerResourceIdentity | null => {
  if (target !== undefined) {
    return normalizeCommandResourceIdentity(target);
  }

  const explorerService = accessor.get(IExplorerService);
  const paneInput = explorerService.getPaneInput();
  if (!paneInput) {
    return null;
  }

  const file = findExplorerFileEntryByResource(explorerService.files, {
    resource: paneInput.selectedResource,
    sheetId: paneInput.selectedSheetId ?? null,
  });
  return getExplorerFileResourceIdentity(file);
};

const normalizeCommandResourceIdentity = (identity: unknown): ExplorerResourceIdentity | null => {
  if (!identity || typeof identity !== "object" || !("resource" in identity)) {
    return null;
  }

  const resource = reviveOptionalUri((identity as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeCommandString((identity as { readonly sheetId?: unknown }).sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const reviveOptionalUri = (value: unknown): URI | null => {
  if (URI.isUri(value)) {
    return value;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) {
      return null;
    }

    try {
      return URI.revive(raw);
    } catch {
      return null;
    }
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { readonly scheme?: unknown }).scheme === "string" &&
    typeof (value as { readonly path?: unknown }).path === "string"
  ) {
    return URI.revive(value as Parameters<typeof URI.revive>[0]);
  }

  return null;
};

const findExplorerFileEntryByResource = (
  files: readonly ExplorerFileEntry[],
  resourceIdentity:
    | { readonly resource?: URI | null; readonly sheetId?: string | null }
    | null
    | undefined,
): ExplorerFileEntry | null => {
  const resourceKey = getExplorerResourceIdentityKey(resourceIdentity);
  if (!resourceKey) {
    return null;
  }

  return files.find(file =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === resourceKey,
  ) ?? null;
};

const withExplorerView = (
  accessor: Parameters<ICommandHandler>[0],
  callback: (explorerView: ExplorerViewPane) => void | Promise<void>,
): void => {
  void accessor.get(IViewsService).openView<ExplorerViewPane>(ExplorerViewId, false).then(explorerView => {
    if (!explorerView) {
      return;
    }

    void callback(explorerView);
  });
};

const isTemplateSelection = (value: unknown): value is TemplateSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "auto") {
    return true;
  }

  if (candidate.kind === "saved" && typeof candidate.templateId === "string" && candidate.templateId.trim().length > 0) {
    return true;
  }

  return candidate.kind === "inline" &&
    Boolean(candidate.template) &&
    typeof candidate.template === "object";
};
