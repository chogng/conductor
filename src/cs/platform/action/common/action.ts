export interface ILocalizedString {
  readonly value: string;
  readonly original: string;
}

export function isLocalizedString(value: unknown): value is ILocalizedString {
  return !!value
    && typeof value === "object"
    && typeof (value as ILocalizedString).original === "string"
    && typeof (value as ILocalizedString).value === "string";
}
