/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type TemplateRoutingRule = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly priority: number;
  readonly enabled: boolean;
  readonly match: TemplateRoutingRuleMatch;
  readonly templateId: string;
};

export type TemplateRoutingRuleMatch = {
  readonly fileNameIncludesAny?: readonly string[];
  readonly relativePathIncludesAny?: readonly string[];
  readonly extensionAny?: readonly string[];
  readonly metadataEquals?: Readonly<Record<string, string>>;
};

export type TemplateRoutingRuleSnapshot = {
  readonly version: number;
  readonly fingerprint: string;
  readonly rules: readonly TemplateRoutingRule[];
};
