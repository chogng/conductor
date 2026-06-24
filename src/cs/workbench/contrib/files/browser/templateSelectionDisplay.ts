/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
	createTemplateSelection,
	getTemplateSelectionTemplateId,
	type TemplateSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";

export type CurrentTemplateSelectionDisplay = {
	readonly label: string;
	readonly selection: TemplateSelection;
};

export const createCurrentTemplateSelectionDisplay = ({
	formName,
	selectedTemplateId,
}: {
	readonly formName?: string | null;
	readonly selectedTemplateId?: string | null;
}): CurrentTemplateSelectionDisplay => {
	const selection = createTemplateSelection(selectedTemplateId);
	if (selection.kind === "auto") {
		return {
			label: localize("template.recommendedTemplate", "Recommended template"),
			selection,
		};
	}

	const normalizedFormName = String(formName ?? "").trim();
	const templateId = getTemplateSelectionTemplateId(selection) ?? "";
	return {
		label: normalizedFormName || templateId,
		selection,
	};
};
