export const enum FileSystemIoErrorCode {
  FileTooLarge = "FileTooLarge",
  InvalidReadRange = "InvalidReadRange",
}

export class FileSystemIoError extends Error {
  constructor(
    public readonly code: FileSystemIoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FileSystemIoError";
  }
}

export type IReadFileLimits = {
  readonly size?: number;
};

export type IReadFileRangeOptions = {
  readonly position?: number;
  readonly length?: number;
  readonly limits?: IReadFileLimits;
};

export type IReadFileRange = {
  readonly position: number;
  readonly length: number;
};

export function resolveReadFileRange(
  byteLength: number,
  options: IReadFileRangeOptions = {},
): IReadFileRange {
  const position = normalizeReadOffset(options.position, "position");
  const requestedLength = typeof options.length === "number"
    ? normalizeReadOffset(options.length, "length")
    : byteLength - position;
  const length = Math.max(0, Math.min(requestedLength, byteLength - position));

  if (typeof options.limits?.size === "number" && length > options.limits.size) {
    throw new FileSystemIoError(
      FileSystemIoErrorCode.FileTooLarge,
      "File is too large to open.",
    );
  }

  return { position, length };
}

export function sliceReadFileContent<T extends Uint8Array>(
  content: T,
  options: IReadFileRangeOptions = {},
): Uint8Array {
  const range = resolveReadFileRange(content.byteLength, options);
  return content.subarray(range.position, range.position + range.length);
}

function normalizeReadOffset(value: number | undefined, name: string): number {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FileSystemIoError(
      FileSystemIoErrorCode.InvalidReadRange,
      `Invalid read ${name}.`,
    );
  }

  return value;
}
