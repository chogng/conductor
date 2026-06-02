import { isAutoTemplateId } from "./autoTemplate.ts";

export type UserTemplateRecord = Record<string, unknown> & {
  readonly id?: unknown;
};

const isTemplateRecord = (value: unknown): value is UserTemplateRecord =>
  Boolean(value) && typeof value === "object";

export const filterUserTemplateRecords = (templates: unknown): UserTemplateRecord[] => {
  if (!Array.isArray(templates)) {
    return [];
  }

  return templates.filter((template): template is UserTemplateRecord =>
    isTemplateRecord(template) && !isAutoTemplateId(template.id),
  );
};
