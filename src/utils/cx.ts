type CxPart = string | number | false | null | undefined | CxPart[];

export const cx = (...parts: CxPart[]): string =>
  (parts.flat() as Array<string | number | false | null | undefined>)
    .filter(Boolean)
    .join(" ");

