/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IUserDataProfileResourceService,
  UserDataProfileResourceId,
} from "src/cs/workbench/services/userDataProfile/common/userDataProfile";
import {
  IUserTemplateImportExportService,
  IUserTemplateService,
  type UserTemplateExportPayload,
  type UserTemplateImportInput,
  type UserTemplateImportResult,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export class UserTemplateImportExportService extends Disposable implements IUserTemplateImportExportService {
  public declare readonly _serviceBrand: undefined;

  public constructor(
    @IUserTemplateService private readonly userTemplateService: IUserTemplateService,
    @IUserDataProfileResourceService
    userDataProfileResourceService: IUserDataProfileResourceService,
  ) {
    super();
    this._register(userDataProfileResourceService.registerResourceHandler(
      UserDataProfileResourceId.UserTemplates,
      {
        getContent: () => this.getProfileResourceContent(),
        applyContent: async content => Boolean(await this.applyProfileResourceContent(content)),
      },
    ));
  }

  public exportTemplates(ids?: readonly string[]): UserTemplateExportPayload {
    return this.userTemplateService.exportTemplates(ids);
  }

  public getProfileResourceContent(): string {
    return formatUserTemplatePayload({
      version: 1,
      source: "conductor.userTemplate",
      templates: this.userTemplateService.getSnapshot().templates
        .filter(template => template.scope === "profile"),
    });
  }

  public async applyProfileResourceContent(content: string): Promise<UserTemplateImportResult | null> {
    let payload: unknown;
    try {
      payload = JSON.parse(content) as unknown;
    } catch {
      return null;
    }

    const input = toUserTemplateImportInput(payload);
    if (!input) {
      return null;
    }

    for (const template of this.userTemplateService.getSnapshot().templates) {
      if (template.scope === "profile") {
        await this.userTemplateService.deleteTemplate(template.id);
      }
    }

    return this.userTemplateService.importTemplates({
      ...input,
      overwrite: true,
      scope: "profile",
    });
  }

  public importTemplatesFromPayload(payload: unknown): Promise<UserTemplateImportResult | null> {
    const input = toUserTemplateImportInput(payload);
    return input ? this.userTemplateService.importTemplates(input) : Promise.resolve(null);
  }
}

const toUserTemplateImportInput = (
  payload: unknown,
): UserTemplateImportInput | null => {
  const entry = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (
    !entry ||
    entry.source !== "conductor.userTemplate" ||
    entry.version !== 1 ||
    !Array.isArray(entry.templates)
  ) {
    return null;
  }

  return {
    templates: entry.templates as UserTemplateImportInput["templates"],
  };
};

const formatUserTemplatePayload = (
  payload: UserTemplateExportPayload,
): string => `${JSON.stringify(payload, null, 2)}\n`;

registerSingleton(
  IUserTemplateImportExportService,
  UserTemplateImportExportService,
  InstantiationType.Eager,
);
