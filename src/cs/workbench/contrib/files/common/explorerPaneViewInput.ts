/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";
import type { ExplorerSelectionKind } from "src/cs/workbench/contrib/files/common/explorer";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";

export type ExplorerThumbnailPlotModel = PlotMainRenderModelSource & {
  readonly signature: string;
};

export type ExplorerImportedSessionFile = SessionFile & {
  readonly importRecord: ImportedFileRecord;
};

export type ExplorerPaneInput = {
  readonly activePlotType?: PlotType;
  readonly currentTemplateLabel?: string;
  readonly currentTemplateSelection?: TemplateSelection;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly files: ExplorerFileEntry[];
  readonly mode: WorkbenchMainPart;
  readonly onFileImported: (fileInfo: ExplorerImportedSessionFile) => void;
  readonly onFileRemoved: (fileId: string) => void;
  readonly onFileSelected: (fileId: string | null) => void;
  readonly onFilesAdded: (files: ExplorerImportedSessionFile[]) => void;
  readonly onFilesRemoved: (fileIds: string[]) => void;
  readonly onFilesReplaced: (files: ExplorerImportedSessionFile[]) => void;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly selectedFileId: string | null;
  readonly selectionKind: ExplorerSelectionKind;
  readonly thumbnailFiles: ProcessedEntry[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};
