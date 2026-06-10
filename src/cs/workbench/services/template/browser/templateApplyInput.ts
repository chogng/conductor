/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type { TableModel } from "src/cs/workbench/services/table/common/table";
import type { TemplateState } from "src/cs/workbench/services/template/common/template";
import { createTemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import type { TemplateApplyControllerInput } from "src/cs/workbench/services/template/browser/templateApplyController";

export type TemplateApplyInputOptions = {
	readonly readModel: SessionReadModel;
	readonly tableModel: Pick<TableModel, "getRow" | "getState" | "hasSourceFile">;
	readonly templateState: TemplateState;
};

export const createTemplateApplyInput = ({
	readModel,
	tableModel,
	templateState,
}: TemplateApplyInputOptions): TemplateApplyControllerInput => ({
	fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
	getTableRow: tableModel.getRow,
	hasSourceFile: tableModel.hasSourceFile,
	previewFile: tableModel.getState().file,
	processedFileIds: readModel.processedFileIds,
	rawFiles: readModel.rawFiles,
	templateSelection: createTemplateSelection(templateState.selectedTemplateId),
});
