/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { builtinRecipes } from "cs/workbench/services/recipes/common/builtinRecipes.generated";
import {
  IRecipeService,
  type IRecipeService as IRecipeServiceType,
  type RecipeSnapshot,
} from "cs/workbench/services/recipes/common/recipe";
import { createRecipeSnapshot } from "cs/workbench/services/recipes/common/recipeCodec";

export class RecipeService extends Disposable implements IRecipeServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeRecipesEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeRecipes = this.onDidChangeRecipesEmitter.event;

  private snapshot = createRecipeSnapshot(builtinRecipes);

  public getSnapshot(): RecipeSnapshot {
    return this.snapshot;
  }

  public async reload(): Promise<void> {
    const previous = this.snapshot;
    const next = createRecipeSnapshot(builtinRecipes, previous.version);
    if (previous.fingerprint === next.fingerprint && previous.version === next.version) {
      this.snapshot = next;
      return;
    }

    this.snapshot = {
      ...next,
      version: previous.version + 1,
    };
    this.onDidChangeRecipesEmitter.fire(undefined);
  }
}

registerSingleton(
  IRecipeService,
  RecipeService,
  InstantiationType.Delayed,
);
