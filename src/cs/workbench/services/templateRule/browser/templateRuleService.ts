/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ITemplateRuleService,
  type ITemplateRuleService as ITemplateRuleServiceType,
  type TemplateRuleChangeEvent,
  type TemplateRuleSnapshot,
} from "src/cs/workbench/services/templateRule/common/templateRule";
import {
  ITemplateRuleStoreService,
  type ITemplateRuleStoreService as ITemplateRuleStoreServiceType,
} from "src/cs/workbench/services/templateRule/common/templateRuleStore";

export class TemplateRuleService extends Disposable implements ITemplateRuleServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeRulesEmitter = this._register(new Emitter<TemplateRuleChangeEvent>());
  public readonly onDidChangeRules = this.onDidChangeRulesEmitter.event;

  private snapshot: TemplateRuleSnapshot;

  public constructor(
    @ITemplateRuleStoreService private readonly templateRuleStoreService: ITemplateRuleStoreServiceType,
  ) {
    super();
    this.snapshot = this.templateRuleStoreService.getSnapshot();
  }

  public getSnapshot(): TemplateRuleSnapshot {
    return this.snapshot;
  }

  public async reload(): Promise<TemplateRuleSnapshot> {
    const previous = this.snapshot;
    const next = await this.templateRuleStoreService.reload();
    this.snapshot = next;
    if (previous.fingerprint !== next.fingerprint || previous.version !== next.version) {
      this.onDidChangeRulesEmitter.fire({
        version: next.version,
        fingerprint: next.fingerprint,
        changedRuleIds: getChangedRuleIds(previous, next),
      });
    }

    return next;
  }
}

const getChangedRuleIds = (
  previous: TemplateRuleSnapshot,
  next: TemplateRuleSnapshot,
): readonly string[] => {
  const previousKeysById = new Map(previous.rules.map(rule => [rule.id, `${rule.version}:${rule.priority}:${rule.enabled}`]));
  const nextKeysById = new Map(next.rules.map(rule => [rule.id, `${rule.version}:${rule.priority}:${rule.enabled}`]));
  const ids = new Set<string>([
    ...previousKeysById.keys(),
    ...nextKeysById.keys(),
  ]);

  return Array.from(ids)
    .filter(id => previousKeysById.get(id) !== nextKeysById.get(id))
    .sort();
};

registerSingleton(
  ITemplateRuleService,
  TemplateRuleService,
  InstantiationType.Delayed,
);
