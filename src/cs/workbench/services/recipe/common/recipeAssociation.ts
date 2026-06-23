/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RecipeSelector } from "src/cs/workbench/services/recipe/common/recipeSelector";

export type RecipeAssociation = {
  readonly id: string;
  readonly version: number;
  readonly priority: number;
  readonly selector: RecipeSelector;
  readonly templateId: string;
};

export type RecipeAssociationSnapshot = {
  readonly version: number;
  readonly fingerprint: string;
  readonly associations: readonly RecipeAssociation[];
};
