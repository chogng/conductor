/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type { RawTableFacts } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type { TemplateDraft } from "src/cs/workbench/services/template/common/templateDraft";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const ITemplateMaterializationService =
	createDecorator<ITemplateMaterializationService>("templateMaterializationService");

export type TemplateMaterializationInput = {
	readonly tableFacts: RawTableFacts;
	readonly recipeSnapshot: RecipeSnapshot;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
};

export interface ITemplateMaterializationService {
	readonly _serviceBrand: undefined;

	materializeAutomaticDrafts(input: TemplateMaterializationInput): readonly TemplateDraft[];
}
