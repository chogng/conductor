import { MarshalledId } from "./marshallingIds.js";
import { isWindows } from "./platform.js";

export type UriComponents = {
  readonly $mid?: typeof MarshalledId.Uri;
  readonly authority?: string;
  readonly fragment?: string;
  readonly path: string;
  readonly query?: string;
  readonly scheme: string;
};

const WINDOWS_DRIVE_PATH = /^\/[a-zA-Z]:/;
const WINDOWS_DRIVE_FS_PATH = /^[a-zA-Z]:[\\/]/;

type UriChange = {
  readonly authority?: string | null;
  readonly fragment?: string | null;
  readonly path?: string | null;
  readonly query?: string | null;
  readonly scheme?: string | null;
};

const normalizeFilePath = (fsPath: string): string => {
  const normalized = String(fsPath ?? "").trim().replace(/\\/g, "/");
  if (!normalized) {
    return "/";
  }

  if (normalized.startsWith("//")) {
    return normalized;
  }

  if (WINDOWS_DRIVE_FS_PATH.test(normalized)) {
    return `/${normalized}`;
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const toEncodedPath = (value: string): string =>
  encodeURI(value).replace(/[?#]/g, character => encodeURIComponent(character));

const toEncodedQueryOrFragment = (value: string): string =>
  encodeURIComponent(value);

const normalizeJoinedPath = (path: string): string => {
  const isUncPath = path.startsWith("//");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  const prefix = isUncPath ? "//" : path.startsWith("/") ? "/" : "";
  return `${prefix}${parts.join("/")}` || "/";
};

const joinPathSegments = (basePath: string, segments: readonly string[]): string => {
  const trimmedBase = basePath.replace(/\/+$/, "");
  const joinedSegments = segments
    .map(segment => String(segment ?? "").replace(/^\/+|\/+$/g, ""))
    .filter(segment => segment.length > 0);

  return normalizeJoinedPath([trimmedBase || "/", ...joinedSegments].join("/"));
};

export class URI {
  public static isUri(thing: unknown): thing is URI {
    if (thing instanceof URI) {
      return true;
    }

    if (!thing || typeof thing !== "object") {
      return false;
    }

    const candidate = thing as URI;
    return typeof candidate.authority === "string" &&
      typeof candidate.fragment === "string" &&
      typeof candidate.path === "string" &&
      typeof candidate.query === "string" &&
      typeof candidate.scheme === "string" &&
      typeof candidate.fsPath === "string" &&
      typeof candidate.with === "function" &&
      typeof candidate.toString === "function";
  }

  public static file(fsPath: string): URI {
    return new URI("file", normalizeFilePath(fsPath));
  }

  public static from(components: UriComponents): URI {
    return new URI(
      String(components.scheme ?? ""),
      String(components.path ?? ""),
      String(components.authority ?? ""),
      String(components.query ?? ""),
      String(components.fragment ?? ""),
    );
  }

  public static joinPath(uri: URI, ...pathFragments: string[]): URI {
    const resource = URI.revive(uri);
    if (!resource.path) {
      throw new Error(`[UriError]: cannot call joinPath on URI without path: ${resource.toString()}`);
    }

    if (isWindows && resource.scheme === "file") {
      return URI.file(joinPathSegments(resource.fsPath.replace(/\\/g, "/"), pathFragments));
    }

    return resource.with({ path: joinPathSegments(resource.path, pathFragments) });
  }

  public static parse(value: string): URI {
    const parsed = new URL(String(value ?? ""));
    const scheme = parsed.protocol.replace(/:$/, "");
    if (scheme === "file") {
      const pathname = decodeURIComponent(parsed.pathname || "/");
      const authority = parsed.host ? `//${parsed.host}` : "";
      return new URI("file", `${authority}${pathname}` || "/");
    }

    return new URI(
      scheme,
      decodeURIComponent(parsed.pathname || "/"),
      parsed.host,
      decodeURIComponent(parsed.search.replace(/^\?/, "")),
      decodeURIComponent(parsed.hash.replace(/^#/, "")),
    );
  }

  public static revive(value: URI | UriComponents | string): URI {
    if (value instanceof URI) {
      return value;
    }

    if (typeof value === "string") {
      return URI.parse(value);
    }

    return URI.from(value);
  }

  public readonly scheme: string;
  public readonly path: string;
  public readonly authority: string;
  public readonly query: string;
  public readonly fragment: string;

  private constructor(
    scheme: string,
    path: string,
    authority = "",
    query = "",
    fragment = "",
  ) {
    this.scheme = scheme;
    this.path = path;
    this.authority = authority;
    this.query = query;
    this.fragment = fragment;
  }

  public get fsPath(): string {
    if (this.scheme !== "file") {
      return this.path;
    }

    if (this.path.startsWith("//")) {
      const uncPath = this.path.slice(2);
      return isWindows ? `\\\\${uncPath.replace(/\//g, "\\")}` : `//${uncPath}`;
    }

    if (isWindows && WINDOWS_DRIVE_PATH.test(this.path)) {
      return this.path.slice(1).replace(/\//g, "\\");
    }

    return isWindows ? this.path.replace(/\//g, "\\") : this.path;
  }

  public toJSON(): UriComponents {
    const result: UriComponents = {
      $mid: MarshalledId.Uri,
      path: this.path,
      scheme: this.scheme,
    };
    if (this.authority) {
      (result as { authority: string }).authority = this.authority;
    }
    if (this.query) {
      (result as { query: string }).query = this.query;
    }
    if (this.fragment) {
      (result as { fragment: string }).fragment = this.fragment;
    }

    return result;
  }

  public with(change: UriChange): URI {
    const authority = change.authority === null ? "" : change.authority ?? this.authority;
    const fragment = change.fragment === null ? "" : change.fragment ?? this.fragment;
    const scheme = change.scheme === null ? "" : change.scheme ?? this.scheme;
    const path = change.path === null ? "" : change.path ?? this.path;
    const query = change.query === null ? "" : change.query ?? this.query;
    if (
      authority === this.authority &&
      fragment === this.fragment &&
      path === this.path &&
      query === this.query &&
      scheme === this.scheme
    ) {
      return this;
    }

    return new URI(scheme, path, authority, query, fragment);
  }

  public toString(): string {
    const query = this.query ? `?${toEncodedQueryOrFragment(this.query)}` : "";
    const fragment = this.fragment ? `#${toEncodedQueryOrFragment(this.fragment)}` : "";
    if (this.scheme === "file") {
      if (this.path.startsWith("//")) {
        const slashIndex = this.path.indexOf("/", 2);
        const authority = slashIndex === -1 ? this.path.slice(2) : this.path.slice(2, slashIndex);
        const pathname = slashIndex === -1 ? "/" : this.path.slice(slashIndex);
        return `file://${authority}${toEncodedPath(pathname)}${query}${fragment}`;
      }

      return `file://${toEncodedPath(this.path)}${query}${fragment}`;
    }

    const authority = this.authority ? `//${this.authority}` : "";
    return `${this.scheme}:${authority}${toEncodedPath(this.path)}${query}${fragment}`;
  }
}
