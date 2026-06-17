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
	readonly activeFileId?: string | null;
	readonly hasPendingSourceFiles?: boolean;
	readonly readModel: SessionReadModel;
	readonly templateState: TemplateState;
};

export const createTemplateApplyInput = ({
	activeFileId,
	hasPendingSourceFiles,
	readModel,
	templateState,
}: TemplateApplyInputOptions): TemplateApplyWorkflowInput => ({
	activeFileId: normalizeActiveFileId(activeFileId),
	fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
	hasPendingSourceFiles: Boolean(hasPendingSourceFiles),
	processedFileIds: readModel.processedFileIds,
	rawFiles: readModel.rawFiles,
	templateSelection: createTemplateSelection(templateState.selectedTemplateId),
});

const normalizeActiveFileId = (fileId: string | null | undefined): string | null => {
	const normalized = String(fileId ?? "").trim();
	return normalized || null;
};
