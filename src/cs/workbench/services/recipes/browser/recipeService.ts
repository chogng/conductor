/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { builtinRecipes } from "../common/builtinRecipes.generated";
import { IRecipeService, type RecipeSnapshot } from "../common/recipe";
import { createRecipeSnapshot } from "../common/recipeCodec";

export class RecipeService extends Disposable implements IRecipeService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeRecipesEmitter: Emitter<void>;
  public readonly onDidChangeRecipes: Event<void>;

  private snapshot: RecipeSnapshot;

  public constructor() {
    super();
    this.onDidChangeRecipesEmitter = this._register(new Emitter<void>());
    this.onDidChangeRecipes = this.onDidChangeRecipesEmitter.event;
    this.snapshot = createRecipeSnapshot(builtinRecipes);
  }

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
