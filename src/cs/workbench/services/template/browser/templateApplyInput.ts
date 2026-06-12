/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
	TemplateApplyWorkflowInput,
	TemplateState,
} from "src/cs/workbench/services/template/common/template";
import { createTemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";

export type TemplateApplyInputOptions = {
	readonly readModel: SessionReadModel;
	readonly templateState: TemplateState;
};

export const createTemplateApplyInput = ({
	readModel,
	templateState,
}: TemplateApplyInputOptions): TemplateApplyWorkflowInput => ({
	fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
	processedFileIds: readModel.processedFileIds,
	rawFiles: readModel.rawFiles,
	templateSelection: createTemplateSelection(templateState.selectedTemplateId),
});
