/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
  NativeUserTemplateSource,
  UserTemplate,
  UserTemplateCreateInput,
  UserTemplateImportInput,
  UserTemplateSnapshot,
  UserTemplateStoreSnapshot,
  UserTemplateUpdate,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export type CreateNativeUserTemplateOptions = {
  readonly allowExistingId?: boolean;
  readonly existingIds?: ReadonlySet<string>;
  readonly now?: number;
};

export const createUserTemplateSnapshot = (
  nativeSnapshot: UserTemplateStoreSnapshot,
): UserTemplateSnapshot => {
  const templates = nativeSnapshot.templates.map(compactUserTemplate)
    .sort(compareUserTemplates);
  const workspaceTemplates = templates.filter(template => template.scope === "workspace");
  const profileTemplates = templates.filter(template => template.scope === "profile");
  const workspaceVersion = nativeSnapshot.workspaceVersion;
  const profileVersion = nativeSnapshot.profileVersion;
  const workspaceFingerprint = createUserTemplateCatalogFingerprint(
    workspaceVersion,
    workspaceTemplates,
  );
  const profileFingerprint = createUserTemplateCatalogFingerprint(
    profileVersion,
    profileTemplates,
  );

  return {
    version: nativeSnapshot.version,
    workspaceVersion,
    profileVersion,
    workspaceFingerprint,
    profileFingerprint,
    effectiveFingerprint: JSON.stringify({
      workspaceFingerprint,
      profileFingerprint,
    }),
    templates,
  };
};

export const createNativeUserTemplate = (
  input: UserTemplateCreateInput,
  options: CreateNativeUserTemplateOptions = {},
): UserTemplate => {
  const now = options.now ?? Date.now();
  const baseName = normalizeText(input.name) || normalizeText(input.template.name) || "Untitled Template";
  const existingIds = options.existingIds ?? new Set<string>();
  const requestedId = normalizeText(input.id) || normalizeText(input.template.id) || createUserTemplateId(baseName);
  const id = options.allowExistingId
    ? requestedId
    : createUniqueUserTemplateId(requestedId, existingIds);
  const name = baseName || id;
  const template = normalizeTemplateForCatalog({
    id,
    name,
    template: input.template,
    version: 1,
  });
  const tags = normalizeTags(input.tags);
  const description = normalizeOptionalText(input.description);

  return {
    id,
    name,
    version: 1,
    scope: input.scope ?? "profile",
    source: input.source ?? "userCreated",
    template,
    templateFingerprint: createTemplateFingerprint(template),
    ...(tags.length ? { tags } : {}),
    ...(description ? { description } : {}),
    createdAt: now,
    updatedAt: now,
  };
};

export const createUpdatedUserTemplate = (
  existing: UserTemplate,
  update: UserTemplateUpdate,
  now = Date.now(),
): UserTemplate => {
  const nextVersion = existing.version + 1;
  const name = normalizeText(update.name) || existing.name;
  const nextTemplate = normalizeTemplateForCatalog({
    id: existing.id,
    name,
    template: update.template ?? existing.template,
    version: nextVersion,
  });
  const updated: UserTemplate = {
    ...existing,
    name,
    version: nextVersion,
    scope: update.scope ?? existing.scope,
    source: update.source ?? getNativeSource(existing.source),
    template: nextTemplate,
    templateFingerprint: createTemplateFingerprint(nextTemplate),
    ...(update.tags === null
      ? { tags: undefined }
      : { tags: update.tags ?? existing.tags }),
    ...(update.description === null
      ? { description: undefined }
      : { description: normalizeOptionalText(update.description) ?? existing.description }),
    updatedAt: now,
  };

  return compactUserTemplate(updated);
};

export const toUserTemplateCreateInput = (
  value: UserTemplateImportInput["templates"][number],
  input: UserTemplateImportInput,
): UserTemplateCreateInput | null => {
  if (isUserTemplate(value)) {
    return {
      id: value.id,
      name: value.name,
      scope: input.scope ?? normalizeUserTemplateScope((value as { readonly scope?: unknown }).scope),
      source: input.source ?? getNativeSource(value.source),
      template: value.template,
      tags: value.tags,
      description: value.description,
    };
  }

  if (isUserTemplateCreateInput(value)) {
    return {
      ...value,
      scope: input.scope ?? normalizeUserTemplateScope((value as { readonly scope?: unknown }).scope),
      source: input.source ?? value.source ?? "imported",
    };
  }

  if (isTemplate(value)) {
    return {
      scope: input.scope ?? "profile",
      source: input.source ?? "imported",
      template: value,
      ...(normalizeText(value.id) ? { id: normalizeText(value.id) } : {}),
      name: normalizeText(value.name) || undefined,
    };
  }

  return null;
};

const normalizeTemplateForCatalog = ({
  id,
  name,
  template,
  version,
}: {
  readonly id: string;
  readonly name: string;
  readonly template: Template;
  readonly version: number;
}): Template => ({
  ...template,
  schemaVersion: 1,
  id,
  name,
  version,
  blocks: Array.isArray(template.blocks) ? template.blocks : [],
  stopOnError: Boolean(template.stopOnError),
});

const isUserTemplate = (
  value: unknown,
): value is UserTemplate =>
  isObjectRecord(value) &&
  isTemplate(value.template) &&
  Boolean(normalizeText(value.id));

const isUserTemplateCreateInput = (
  value: unknown,
): value is UserTemplateCreateInput =>
  isObjectRecord(value) &&
  isTemplate(value.template);

const isTemplate = (
  value: unknown,
): value is Template =>
  isObjectRecord(value) &&
  value.schemaVersion === 1 &&
  typeof value.name === "string" &&
  typeof value.version === "number" &&
  Array.isArray(value.blocks) &&
  typeof value.stopOnError === "boolean";

const getNativeSource = (
  source: unknown,
): NativeUserTemplateSource => {
  switch (source) {
    case "confirmedFromReview":
    case "imported":
    case "userCreated":
      return source;
    default:
      return "imported";
  }
};

const normalizeUserTemplateScope = (
  scope: unknown,
): UserTemplate["scope"] =>
  scope === "workspace" ? "workspace" : "profile";

const compactUserTemplate = (
  template: UserTemplate,
): UserTemplate => {
  const tags = normalizeTags(template.tags);
  const description = normalizeOptionalText(template.description);
  return {
    id: template.id,
    name: template.name,
    version: template.version,
    scope: template.scope,
    source: template.source,
    template: template.template,
    templateFingerprint: template.templateFingerprint,
    ...(tags.length ? { tags } : {}),
    ...(description ? { description } : {}),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
};

const createUserTemplateCatalogFingerprint = (
  version: number,
  templates: readonly UserTemplate[],
): string => JSON.stringify({
  kind: "userTemplateSnapshot",
  version,
  templates: templates.map(template => ({
    id: template.id,
    version: template.version,
    templateFingerprint: template.templateFingerprint,
    source: template.source,
    scope: template.scope,
  })),
});

const createUniqueUserTemplateId = (
  requestedId: string,
  existingIds: ReadonlySet<string>,
): string => {
  const base = normalizeText(requestedId) || "user-template";
  if (!existingIds.has(base)) {
    return base;
  }

  for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
};

const createUserTemplateId = (
  value: unknown,
): string => {
  const text = normalizeText(value).toLowerCase();
  const id = text
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "user-template";
};

const normalizeTags = (
  value: unknown,
): readonly string[] =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizeText).filter(Boolean))].sort()
    : [];

const normalizeOptionalText = (
  value: unknown,
): string | undefined => {
  const text = normalizeText(value);
  return text || undefined;
};

const normalizeText = (
  value: unknown,
): string => String(value ?? "").trim();

const compareUserTemplates = (
  a: UserTemplate,
  b: UserTemplate,
): number =>
  a.scope.localeCompare(b.scope) ||
  a.id.localeCompare(b.id);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
