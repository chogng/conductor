import { MarshalledId } from "./marshallingIds.js";
import { URI, type UriComponents } from "./uri.js";

export interface IURITransformer {
  transformIncoming(uri: UriComponents): UriComponents;
  transformOutgoing(uri: UriComponents): UriComponents;
  transformOutgoingURI(uri: URI): URI;
  transformOutgoingScheme(scheme: string): string;
}

export interface UriParts {
  readonly scheme: string;
  readonly authority?: string;
  readonly path?: string;
  readonly query?: string;
  readonly fragment?: string;
}

export interface IRawURITransformer {
  transformIncoming(uri: UriParts): UriParts;
  transformOutgoing(uri: UriParts): UriParts;
  transformOutgoingScheme(scheme: string): string;
}

function toUriComponents(uri: UriParts): UriComponents {
  return {
    authority: uri.authority,
    fragment: uri.fragment,
    path: uri.path ?? "",
    query: uri.query,
    scheme: uri.scheme,
  };
}

export class URITransformer implements IURITransformer {
  private readonly uriTransformer: IRawURITransformer;

  constructor(uriTransformer: IRawURITransformer) {
    this.uriTransformer = uriTransformer;
  }

  public transformIncoming(uri: UriComponents): UriComponents {
    const result = this.uriTransformer.transformIncoming(uri);
    return result === uri ? uri : URI.from(toUriComponents(result)).toJSON();
  }

  public transformOutgoing(uri: UriComponents): UriComponents {
    const result = this.uriTransformer.transformOutgoing(uri);
    return result === uri ? uri : URI.from(toUriComponents(result)).toJSON();
  }

  public transformOutgoingURI(uri: URI): URI {
    const result = this.uriTransformer.transformOutgoing(uri);
    return result === uri ? uri : URI.from(toUriComponents(result));
  }

  public transformOutgoingScheme(scheme: string): string {
    return this.uriTransformer.transformOutgoingScheme(scheme);
  }
}

export const DefaultURITransformer: IURITransformer = new class implements IURITransformer {
  public transformIncoming(uri: UriComponents): UriComponents {
    return uri;
  }

  public transformOutgoing(uri: UriComponents): UriComponents {
    return uri;
  }

  public transformOutgoingURI(uri: URI): URI {
    return uri;
  }

  public transformOutgoingScheme(scheme: string): string {
    return scheme;
  }
}();

function isMarshalledUri(value: unknown): value is UriComponents {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { readonly $mid?: unknown }).$mid === MarshalledId.Uri,
  );
}

function transformOutgoingValue(value: unknown, transformer: IURITransformer, depth: number): unknown {
  if (!value || depth > 200) {
    return undefined;
  }

  if (value instanceof URI) {
    return transformer.transformOutgoing(value);
  }

  if (typeof value !== "object") {
    return undefined;
  }

  let didChange = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const transformed = transformOutgoingValue(value[index], transformer, depth + 1);
      if (typeof transformed !== "undefined") {
        value[index] = transformed;
        didChange = true;
      }
    }
    return didChange ? value : undefined;
  }

  for (const key of Object.keys(value)) {
    const record = value as Record<string, unknown>;
    const transformed = transformOutgoingValue(record[key], transformer, depth + 1);
    if (typeof transformed !== "undefined") {
      record[key] = transformed;
      didChange = true;
    }
  }

  return didChange ? value : undefined;
}

function transformIncomingValue(
  value: unknown,
  transformer: IURITransformer,
  shouldRevive: boolean,
  depth: number,
): unknown {
  if (!value || depth > 200) {
    return undefined;
  }

  if (isMarshalledUri(value)) {
    const transformed = transformer.transformIncoming(value);
    return shouldRevive ? URI.revive(transformed) : transformed;
  }

  if (typeof value !== "object" || value instanceof Uint8Array) {
    return undefined;
  }

  let didChange = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const transformed = transformIncomingValue(value[index], transformer, shouldRevive, depth + 1);
      if (typeof transformed !== "undefined") {
        value[index] = transformed;
        didChange = true;
      }
    }
    return didChange ? value : undefined;
  }

  for (const key of Object.keys(value)) {
    const record = value as Record<string, unknown>;
    const transformed = transformIncomingValue(record[key], transformer, shouldRevive, depth + 1);
    if (typeof transformed !== "undefined") {
      record[key] = transformed;
      didChange = true;
    }
  }

  return didChange ? value : undefined;
}

export function transformOutgoingURIs<T>(value: T, transformer: IURITransformer): T {
  const transformed = transformOutgoingValue(value, transformer, 0);
  return (typeof transformed === "undefined" ? value : transformed) as T;
}

export function transformIncomingURIs<T>(value: T, transformer: IURITransformer): T {
  const transformed = transformIncomingValue(value, transformer, false, 0);
  return (typeof transformed === "undefined" ? value : transformed) as T;
}

export function transformAndReviveIncomingURIs<T>(value: T, transformer: IURITransformer): T {
  const transformed = transformIncomingValue(value, transformer, true, 0);
  return (typeof transformed === "undefined" ? value : transformed) as T;
}
