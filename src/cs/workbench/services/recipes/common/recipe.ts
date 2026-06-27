/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { RecipeSchema } from "./recipeSchema";

export const IRecipeService =
  createDecorator<IRecipeService>("recipeService");

export type Recipe = RecipeSchema & {
	readonly id: string;
	readonly version: number;
	readonly priority: number;
	readonly label: string;
	readonly stopOnError?: boolean;
};

type RecipeVariantSchema = Partial<Pick<
	RecipeSchema,
	"blockPartition" | "logicalRelation" | "domain" | "roles" | "seriesPartition"
>>;

export type RecipeVariant = RecipeVariantSchema & {
	readonly id: string;
	readonly priority?: number;
	readonly label?: string;
	readonly stopOnError?: boolean;
};

type RecipeAuthoringSchema =
	Omit<RecipeSchema, "seriesPartition" | "roles">
	& Partial<Pick<RecipeSchema, "seriesPartition" | "roles">>;

export type RecipeAuthoring = Recipe | (RecipeAuthoringSchema & {
	readonly id: string;
	readonly version: number;
	readonly priority?: number;
	readonly label?: string;
	readonly stopOnError?: boolean;
	readonly variants: readonly RecipeVariant[];
});

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
