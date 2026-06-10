/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  ExplorerSessionSelection,
  ExplorerSessionSelectionInput,
  IExplorerService,
} from "src/cs/workbench/services/explorer/common/explorer";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";

export const createExplorerSessionSelectionInput = (
  readModel: SessionReadModel,
): ExplorerSessionSelectionInput => ({
  analysisFileIds: readModel.processedFileIds,
  rawFileIds: readModel.rawFiles.map(file => file.fileId),
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
