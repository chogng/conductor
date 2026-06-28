import { distinct } from "src/cs/base/common/arrays";
import { Iterable } from "src/cs/base/common/iterator";
import { URI } from "src/cs/base/common/uri";
import { generateUuid } from "src/cs/base/common/uuid";

// Common VSDataTransfer model. Browser native DataTransfer MIME keys live in
// base/browser/dnd.ts.
export interface IDataTransferFile {
  readonly id: string;
  readonly name: string;
  // Conductor extension: a workbook sheet is represented as its own
  // transferable file item. Stable domain identity remains uri + sheetId;
  // id identifies this data-transfer file item.
  readonly sheetId?: string | null;
  readonly sheetName?: string | null;
  readonly uri?: URI;
  data(): Promise<Uint8Array>;
}

export interface IDataTransferItem {
  id?: string;
  asString(): Promise<string>;
  asFile(): IDataTransferFile | undefined;
  value: unknown;
}

export function createStringDataTransferItem(
  stringOrPromise: string | Promise<string>,
  id?: string,
): IDataTransferItem {
  return {
    id,
    asString: async () => stringOrPromise,
    asFile: () => undefined,
    value: typeof stringOrPromise === "string" ? stringOrPromise : undefined,
  };
}

export function createFileDataTransferItem(
  fileName: string,
  uri: URI | undefined,
  data: () => Promise<Uint8Array>,
  options: {
    readonly fileId?: string;
    readonly itemId?: string;
    readonly sheetId?: string | null;
    readonly sheetName?: string | null;
  } = {},
): IDataTransferItem {
  const file = {
    data,
    id: options.fileId ?? generateUuid(),
    name: fileName,
    sheetId: options.sheetId ?? null,
    sheetName: options.sheetName ?? null,
    uri,
  };

  return {
    id: options.itemId,
    asString: async () => "",
    asFile: () => file,
    value: undefined,
  };
}

export interface IReadonlyVSDataTransfer extends Iterable<readonly [string, IDataTransferItem]> {
  readonly size: number;
  has(mimeType: string): boolean;
  matches(pattern: string): boolean;
  get(mimeType: string): IDataTransferItem | undefined;
}

export class VSDataTransfer implements IReadonlyVSDataTransfer {
  private readonly entries = new Map<string, IDataTransferItem[]>();

  public get size(): number {
    let size = 0;
    for (const _entry of this.entries) {
      size += 1;
    }
    return size;
  }

  public has(mimeType: string): boolean {
    return this.entries.has(this.toKey(mimeType));
  }

  public matches(pattern: string): boolean {
    const mimeTypes = [...this.entries.keys()];
    if (Iterable.some(this, (_entry, _index) => !!_entry[1].asFile())) {
      mimeTypes.push("files");
    }

    return matchesMimeTypeNormalized(normalizeMimeType(pattern), mimeTypes);
  }

  public get(mimeType: string): IDataTransferItem | undefined {
    return this.entries.get(this.toKey(mimeType))?.[0];
  }

  public append(mimeType: string, value: IDataTransferItem): void {
    const key = this.toKey(mimeType);
    const existing = this.entries.get(key);
    if (existing) {
      existing.push(value);
    } else {
      this.entries.set(key, [value]);
    }
  }

  public replace(mimeType: string, value: IDataTransferItem): void {
    this.entries.set(this.toKey(mimeType), [value]);
  }

  public delete(mimeType: string): void {
    this.entries.delete(this.toKey(mimeType));
  }

  public *[Symbol.iterator](): IterableIterator<readonly [string, IDataTransferItem]> {
    for (const [mimeType, items] of this.entries) {
      for (const item of items) {
        yield [mimeType, item];
      }
    }
  }

  private toKey(mimeType: string): string {
    return normalizeMimeType(mimeType);
  }
}

export function matchesMimeType(pattern: string, mimeTypes: readonly string[]): boolean {
  return matchesMimeTypeNormalized(
    normalizeMimeType(pattern),
    mimeTypes.map(normalizeMimeType),
  );
}

export const UriList = Object.freeze({
  create: (entries: ReadonlyArray<string | URI>): string =>
    distinct(entries.map(entry => entry.toString())).join("\r\n"),
  split: (value: string): string[] =>
    value.split("\r\n"),
  parse: (value: string): string[] =>
    UriList.split(value).filter(entry => !entry.startsWith("#")),
});

function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase();
}

function matchesMimeTypeNormalized(
  normalizedPattern: string,
  normalizedMimeTypes: readonly string[],
): boolean {
  if (normalizedPattern === "*/*") {
    return normalizedMimeTypes.length > 0;
  }

  if (normalizedMimeTypes.includes(normalizedPattern)) {
    return true;
  }

  const wildcard = normalizedPattern.match(/^([a-z]+)\/([a-z]+|\*)$/i);
  if (!wildcard) {
    return false;
  }

  const [, type, subtype] = wildcard;
  if (subtype === "*") {
    return normalizedMimeTypes.some(mimeType => mimeType.startsWith(`${type}/`));
  }

  return false;
}
