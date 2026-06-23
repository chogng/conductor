/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { RecipeProjection } from "src/cs/workbench/services/recipe/common/recipeProjection";
import type { RecipeSelector } from "src/cs/workbench/services/recipe/common/recipeSelector";

export const IRecipeService =
  createDecorator<IRecipeService>("recipeService");

export type Recipe = {
  readonly id: string;
  readonly version: number;
  readonly priority: number;
  readonly selector: RecipeSelector;
  readonly projection: RecipeProjection;
};

export type RecipeDiagnostic = {
  readonly recipeId?: string;
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
};

export type RecipeSnapshot = {
  readonly version: number;
  readonly fingerprint: string;
  readonly recipes: readonly Recipe[];
  readonly diagnostics: readonly RecipeDiagnostic[];
};

export interface IRecipeService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeRecipes: Event<void>;

  getSnapshot(): RecipeSnapshot;
  reload(): Promise<void>;
}
