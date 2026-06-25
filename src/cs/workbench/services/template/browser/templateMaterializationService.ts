/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	ITemplateMaterializationService,
	type ITemplateMaterializationService as ITemplateMaterializationServiceType,
	type TemplateMaterializationInput,
} from "src/cs/workbench/services/template/common/templateMaterialization";
import { deriveRecipeTemplateDrafts } from "src/cs/workbench/services/template/common/recipeTemplateMaterializer";
import type { TemplateDraft } from "src/cs/workbench/services/template/common/templateDraft";
import { deriveUserTemplateDrafts } from "src/cs/workbench/services/template/common/userTemplateMaterializer";

export class TemplateMaterializationService implements ITemplateMaterializationServiceType {
	public declare readonly _serviceBrand: undefined;

	public materializeAutomaticDrafts(input: TemplateMaterializationInput): readonly TemplateDraft[] {
		return sortTemplateDrafts([
			...deriveRecipeTemplateDrafts({
				tableModel: input.tableModel,
				recipeSnapshot: input.recipeSnapshot,
			}),
			...deriveUserTemplateDrafts({
				tableModel: input.tableModel,
				userTemplateSnapshot: input.userTemplateSnapshot,
			}),
		]);
	}
}

const sortTemplateDrafts = (
	drafts: readonly TemplateDraft[],
): readonly TemplateDraft[] => [...drafts].sort((left, right) =>
	getTemplateDraftStateRank(right) - getTemplateDraftStateRank(left) ||
	right.derivationConfidence - left.derivationConfidence ||
	left.id.localeCompare(right.id)
);

const getTemplateDraftStateRank = (
	draft: TemplateDraft,
): number => draft.derivationDiagnostics.length ? 0 : 1;

registerSingleton(
	ITemplateMaterializationService,
	TemplateMaterializationService,
	InstantiationType.Delayed,
);
