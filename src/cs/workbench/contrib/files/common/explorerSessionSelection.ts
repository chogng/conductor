/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  ExplorerSessionSelection,
  ExplorerSessionSelectionInput,
  IExplorerService,
} from "src/cs/workbench/contrib/files/common/explorer";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";

export const createExplorerSessionSelectionInput = (
  readModel: SessionReadModel,
): ExplorerSessionSelectionInput => ({
  processedFileIds: readModel.processedFileIds,
  rawFileIds: readModel.rawFiles.flatMap(file => file.fileId ? [file.fileId] : []),
});

export const resolveExplorerSessionSelection = (
  explorerService: IExplorerService,
  readModel: SessionReadModel,
): ExplorerSessionSelection =>
  explorerService.resolveSessionSelection(
    createExplorerSessionSelectionInput(readModel),
  );

export const reconcileExplorerSessionSelection = (
  explorerService: IExplorerService,
  readModel: SessionReadModel,
): ExplorerSessionSelection =>
  explorerService.reconcileSessionSelection(
    createExplorerSessionSelectionInput(readModel),
  );
