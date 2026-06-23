/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { builtinTemplateRules } from "src/cs/workbench/services/templateRule/common/builtinTemplateRules.generated";
import { createTemplateRuleSnapshot } from "src/cs/workbench/services/templateRule/common/templateRuleCodec";
import {
  ITemplateRuleStoreService,
  type ITemplateRuleStoreService as ITemplateRuleStoreServiceType,
} from "src/cs/workbench/services/templateRule/common/templateRuleStore";
import type { TemplateRuleSnapshot } from "src/cs/workbench/services/templateRule/common/templateRule";

export class BrowserTemplateRuleStoreService extends Disposable implements ITemplateRuleStoreServiceType {
  public declare readonly _serviceBrand: undefined;

  private snapshot = createTemplateRuleSnapshot(builtinTemplateRules, "builtin");

  public getSnapshot(): TemplateRuleSnapshot {
    return this.snapshot;
  }

  public async reload(): Promise<TemplateRuleSnapshot> {
    this.snapshot = createTemplateRuleSnapshot(builtinTemplateRules, "builtin", this.snapshot.version);
    return this.snapshot;
  }
}

registerSingleton(
  ITemplateRuleStoreService,
  BrowserTemplateRuleStoreService,
  InstantiationType.Delayed,
);
