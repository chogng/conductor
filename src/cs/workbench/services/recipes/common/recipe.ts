/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	RecipeBlockPartition,
	RecipeDataRange,
	RecipeDomain,
	RecipeLogicalRelation,
	RecipeRoles,
	RecipeSeriesPartition,
	RecipeWithinBlock,
} from "cs/workbench/services/recipes/common/recipeSchema";

export const IRecipeService =
  createDecorator<IRecipeService>("recipeService");

export type Recipe = {
	readonly id: string;
	readonly version: number;
	readonly priority: number;
	readonly label: string;
	readonly dataRange: RecipeDataRange;
	readonly blockPartition: RecipeBlockPartition;
	readonly withinBlock: RecipeWithinBlock;
	readonly seriesPartition: RecipeSeriesPartition;
	readonly logicalRelation: RecipeLogicalRelation;
	readonly domain?: RecipeDomain;
	readonly roles: RecipeRoles;
	readonly stopOnError?: boolean;
};

export type RecipeVariant = {
	readonly id: string;
	readonly blockPartition?: RecipeBlockPartition;
	readonly logicalRelation?: RecipeLogicalRelation;
	readonly priority?: number;
	readonly label?: string;
	readonly domain?: RecipeDomain;
	readonly roles?: RecipeRoles;
	readonly seriesPartition?: RecipeSeriesPartition;
	readonly stopOnError?: boolean;
};

export type RecipeAuthoring = Recipe | {
	readonly id: string;
	readonly version: number;
	readonly dataRange: RecipeDataRange;
	readonly blockPartition: RecipeBlockPartition;
	readonly withinBlock: RecipeWithinBlock;
	readonly seriesPartition?: RecipeSeriesPartition;
	readonly logicalRelation: RecipeLogicalRelation;
	readonly priority?: number;
	readonly label?: string;
	readonly domain?: RecipeDomain;
	readonly roles?: RecipeRoles;
	readonly stopOnError?: boolean;
	readonly variants: readonly RecipeVariant[];
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
