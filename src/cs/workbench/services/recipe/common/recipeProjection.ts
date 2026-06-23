/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type RecipeProjection = {
  readonly name: RecipeValueExpression;
  readonly blocks: RecipeBlockProjection;
  readonly stopOnError?: boolean;
};

export type RecipeValueExpression =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "capturedCommonUnit"; readonly capture: string }
  | { readonly kind: "matchedBlockLabel" }
  | { readonly kind: "matchedBlockFamily" }
  | { readonly kind: "matchedBlockMode" };

export type RecipeBlockProjection = {
  readonly source: "eachMatchedBlock" | "singleMatchedBlock";
  readonly rowRange: "block.dataRange";
  readonly x: RecipeColumnProjection;
  readonly y: RecipeColumnProjection;
  readonly segmentation: RecipeSegmentationProjection;
  readonly legend: RecipeLegendProjection;
  readonly titles?: RecipeTitleProjection;
};

export type RecipeColumnProjection = {
  readonly columns: RecipeColumnExpression;
  readonly unit?: RecipeValueExpression;
};

export type RecipeColumnExpression =
  | { readonly kind: "capturedColumns"; readonly capture: string }
  | { readonly kind: "literalColumns"; readonly columns: readonly number[] };

export type RecipeSegmentationProjection =
  | { readonly kind: "auto" }
  | { readonly kind: "none" };

export type RecipeLegendProjection = {
  readonly target: "auto" | "yColumn" | "group";
};

export type RecipeTitleProjection = {
  readonly bottom?: RecipeValueExpression;
  readonly left?: RecipeValueExpression;
};
