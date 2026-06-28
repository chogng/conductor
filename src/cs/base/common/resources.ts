import * as extpath from "./extpath.js";
import { isLinux } from "./platform.js";
import { URI } from "./uri.js";

const FileScheme = "file";
const Slash = "/";
const WindowsDriveFsPath = /^[a-zA-Z]:[\\/]/;

export interface IExtUri {
  compare(uri1: URI, uri2: URI, ignoreFragment?: boolean): number;
  isEqual(uri1: URI | undefined, uri2: URI | undefined, ignoreFragment?: boolean): boolean;
  isEqualOrParent(base: URI, parentCandidate: URI, ignoreFragment?: boolean): boolean;
  /**
   * Creates a stable URI identity key for resource maps and sets.
   *
   * Pass this function to ResourceMap or ResourceSet when the container must use
   * the same URI casing and fragment semantics as this IExtUri instance.
   */
  getComparisonKey(uri: URI, ignoreFragment?: boolean): string;
  ignorePathCasing(uri: URI): boolean;
  basenameOrAuthority(resource: URI): string;
  basename(resource: URI): string;
  extname(resource: URI): string;
  dirname(resource: URI): URI;
  joinPath(resource: URI, ...pathFragment: string[]): URI;
  normalizePath(resource: URI): URI;
  relativePath(from: URI, to: URI): string | undefined;
  resolvePath(base: URI, path: string): URI;
  isAbsolutePath(resource: URI): boolean;
  isEqualAuthority(first: string | undefined, second: string | undefined): boolean;
  hasTrailingPathSeparator(resource: URI, sep?: string): boolean;
  removeTrailingPathSeparator(resource: URI, sep?: string): URI;
  addTrailingPathSeparator(resource: URI, sep?: string): URI;
}

function compareStrings(first: string, second: string): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}

function equalsIgnoreCase(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

function normalizeSeparators(path: string): string {
  return extpath.toSlashes(String(path ?? ""));
}

function getRootLength(path: string): number {
  return extpath.getRoot(path, Slash).length;
}

function removeTrailingPathSeparators(path: string): string {
  const rootLength = getRootLength(path);
  let end = path.length;
  while (end > rootLength && path.charAt(end - 1) === Slash) {
    end -= 1;
  }

  return end === path.length ? path : path.slice(0, end);
}

function normalizePathString(path: string): string {
  const normalizedPath = normalizeSeparators(path);
  const isAbsolute = normalizedPath.startsWith(Slash);
  const isUnc = normalizedPath.startsWith("//");
  const segments: string[] = [];
  for (const segment of normalizedPath.split(Slash)) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push(segment);
      }
      continue;
    }

    segments.push(segment);
  }

  const prefix = isUnc ? "//" : isAbsolute ? Slash : "";
  return `${prefix}${segments.join(Slash)}` || (isAbsolute ? Slash : ".");
}

function splitPath(path: string): string[] {
  return removeTrailingPathSeparators(normalizePathString(path))
    .split(Slash)
    .filter(segment => segment.length > 0);
}

function joinPathString(path: string, ...pathFragments: string[]): string {
  const normalizedFragments = pathFragments
    .map(fragment => normalizeSeparators(fragment).replace(/^\/+|\/+$/g, ""))
    .filter(fragment => fragment.length > 0);

  return normalizePathString([
    removeTrailingPathSeparators(path) || Slash,
    ...normalizedFragments,
  ].join(Slash));
}

function basenameFromPath(path: string): string {
  const normalizedPath = removeTrailingPathSeparators(path);
  const rootLength = getRootLength(normalizedPath);
  if (normalizedPath.length <= rootLength) {
    return "";
  }

  const lastSeparator = normalizedPath.lastIndexOf(Slash);
  return normalizedPath.slice(Math.max(lastSeparator + 1, rootLength));
}

function dirnameFromPath(path: string): string {
  if (!path) {
    return path;
  }

  const normalizedPath = removeTrailingPathSeparators(path);
  const rootLength = getRootLength(normalizedPath);
  if (normalizedPath.length <= rootLength) {
    return normalizedPath;
  }

  const lastSeparator = normalizedPath.lastIndexOf(Slash);
  if (lastSeparator < rootLength) {
    return rootLength > 0 ? normalizedPath.slice(0, rootLength) : ".";
  }

  const dirname = normalizedPath.slice(0, lastSeparator);
  return dirname || (normalizedPath.startsWith(Slash) ? Slash : ".");
}

function extnameFromPath(path: string): string {
  const name = basenameFromPath(path);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "";
  }

  return name.slice(dotIndex);
}

function relativePathString(fromPath: string, toPath: string, ignoreCase: boolean): string {
  const fromSegments = splitPath(fromPath);
  const toSegments = splitPath(toPath);
  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    (ignoreCase
      ? equalsIgnoreCase(fromSegments[common], toSegments[common])
      : fromSegments[common] === toSegments[common])
  ) {
    common += 1;
  }

  const backSegments = fromSegments.slice(common).map(() => "..");
  const forwardSegments = toSegments.slice(common);
  return [...backSegments, ...forwardSegments].join(Slash);
}

function isPathEqualOrParent(
  basePath: string,
  parentCandidatePath: string,
  ignoreCase: boolean,
): boolean {
  const normalizedBase = removeTrailingPathSeparators(normalizePathString(basePath));
  const normalizedParent = removeTrailingPathSeparators(normalizePathString(parentCandidatePath));
  return extpath.isEqualOrParent(normalizedBase, normalizedParent, ignoreCase, Slash);
}

export class ExtUri implements IExtUri {
  public constructor(private readonly _ignorePathCasing: (uri: URI) => boolean) {}

  public compare(uri1: URI, uri2: URI, ignoreFragment = false): number {
    if (uri1 === uri2) {
      return 0;
    }

    return compareStrings(
      this.getComparisonKey(uri1, ignoreFragment),
      this.getComparisonKey(uri2, ignoreFragment),
    );
  }

  public isEqual(uri1: URI | undefined, uri2: URI | undefined, ignoreFragment = false): boolean {
    if (uri1 === uri2) {
      return true;
    }

    if (!uri1 || !uri2) {
      return false;
    }

    return this.getComparisonKey(uri1, ignoreFragment) === this.getComparisonKey(uri2, ignoreFragment);
  }

  public isEqualOrParent(base: URI, parentCandidate: URI, ignoreFragment = false): boolean {
    if (base.scheme !== parentCandidate.scheme) {
      return false;
    }

    return (
      this.isEqualAuthority(base.authority, parentCandidate.authority) &&
      base.query === parentCandidate.query &&
      (ignoreFragment || base.fragment === parentCandidate.fragment) &&
      isPathEqualOrParent(base.path, parentCandidate.path, this._ignorePathCasing(base))
    );
  }

  public getComparisonKey(uri: URI, ignoreFragment = false): string {
    return URI.from({
      authority: uri.authority,
      fragment: ignoreFragment ? "" : uri.fragment,
      path: this._ignorePathCasing(uri) ? uri.path.toLowerCase() : uri.path,
      query: uri.query,
      scheme: uri.scheme,
    }).toString();
  }

  public ignorePathCasing(uri: URI): boolean {
    return this._ignorePathCasing(uri);
  }

  public basenameOrAuthority(resource: URI): string {
    return this.basename(resource) || resource.authority;
  }

  public basename(resource: URI): string {
    return basenameFromPath(resource.path);
  }

  public extname(resource: URI): string {
    return extnameFromPath(resource.path);
  }

  public dirname(resource: URI): URI {
    if (!resource.path) {
      return resource;
    }

    return resource.with({ path: dirnameFromPath(resource.path) });
  }

  public joinPath(resource: URI, ...pathFragment: string[]): URI {
    return URI.joinPath(resource, ...pathFragment);
  }

  public normalizePath(resource: URI): URI {
    if (!resource.path) {
      return resource;
    }

    return resource.with({ path: normalizePathString(resource.path) });
  }

  public relativePath(from: URI, to: URI): string | undefined {
    if (from.scheme !== to.scheme || !this.isEqualAuthority(from.authority, to.authority)) {
      return undefined;
    }

    return relativePathString(from.path || Slash, to.path || Slash, this._ignorePathCasing(from));
  }

  public resolvePath(base: URI, path: string): URI {
    const normalizedPath = extpath.toPosixPath(path);
    if (base.scheme === FileScheme && WindowsDriveFsPath.test(normalizedPath)) {
      return base.with({ path: URI.file(normalizedPath).path });
    }

    return base.with({
      path: normalizedPath.startsWith(Slash)
        ? normalizePathString(normalizedPath)
        : joinPathString(base.path || Slash, normalizedPath),
    });
  }

  public isAbsolutePath(resource: URI): boolean {
    return resource.path.startsWith(Slash);
  }

  public isEqualAuthority(first: string | undefined, second: string | undefined): boolean {
    if (first === second) {
      return true;
    }

    if (typeof first !== "string" || typeof second !== "string") {
      return false;
    }

    return equalsIgnoreCase(first, second);
  }

  public hasTrailingPathSeparator(resource: URI, sep = Slash): boolean {
    const path = resource.path;
    return path.length > getRootLength(path) && path.endsWith(sep);
  }

  public removeTrailingPathSeparator(resource: URI, sep = Slash): URI {
    if (!this.hasTrailingPathSeparator(resource, sep)) {
      return resource;
    }

    let path = resource.path;
    while (this.hasTrailingPathSeparator(resource.with({ path }), sep)) {
      path = path.slice(0, -sep.length);
    }

    return resource.with({ path });
  }

  public addTrailingPathSeparator(resource: URI, sep = Slash): URI {
    if (!resource.path || resource.path.length <= getRootLength(resource.path)) {
      return resource;
    }

    if (this.hasTrailingPathSeparator(resource, sep)) {
      return resource;
    }

    return resource.with({ path: `${resource.path}${sep}` });
  }
}

export const extUri = new ExtUri(() => false);
export const extUriBiasedIgnorePathCase = new ExtUri(uri => uri.scheme === FileScheme ? !isLinux : true);
export const extUriIgnorePathCase = new ExtUri(() => true);

export const isEqual = extUri.isEqual.bind(extUri);
export const isEqualOrParent = extUri.isEqualOrParent.bind(extUri);
export const getComparisonKey = extUri.getComparisonKey.bind(extUri);
export const basenameOrAuthority = extUri.basenameOrAuthority.bind(extUri);
export const basename = extUri.basename.bind(extUri);
export const extname = extUri.extname.bind(extUri);
export const dirname = extUri.dirname.bind(extUri);
export const joinPath = extUri.joinPath.bind(extUri);
export const normalizePath = extUri.normalizePath.bind(extUri);
export const relativePath = extUri.relativePath.bind(extUri);
export const resolvePath = extUri.resolvePath.bind(extUri);
export const isAbsolutePath = extUri.isAbsolutePath.bind(extUri);
export const isEqualAuthority = extUri.isEqualAuthority.bind(extUri);
export const hasTrailingPathSeparator = extUri.hasTrailingPathSeparator.bind(extUri);
export const removeTrailingPathSeparator = extUri.removeTrailingPathSeparator.bind(extUri);
export const addTrailingPathSeparator = extUri.addTrailingPathSeparator.bind(extUri);

export function distinctParents<T>(items: readonly T[], resourceAccessor: (item: T) => URI): T[] {
  const distinctParents: T[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const candidateResource = resourceAccessor(items[index]);
    if (items.some((otherItem, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }

      return isEqualOrParent(candidateResource, resourceAccessor(otherItem));
    })) {
      continue;
    }

    distinctParents.push(items[index]);
  }

  return distinctParents;
}

export namespace DataUri {
  export const META_DATA_LABEL = "label";
  export const META_DATA_DESCRIPTION = "description";
  export const META_DATA_SIZE = "size";
  export const META_DATA_MIME = "mime";

  export function parseMetaData(dataUri: URI): Map<string, string> {
    const metadata = new Map<string, string>();
    const metaStart = dataUri.path.indexOf(";") + 1;
    const metaEnd = dataUri.path.lastIndexOf(";");
    if (metaStart > 0 && metaEnd > metaStart) {
      const meta = dataUri.path.substring(metaStart, metaEnd);
      for (const property of meta.split(";")) {
        const separator = property.indexOf(":");
        if (separator === -1) {
          continue;
        }

        const key = property.slice(0, separator);
        const value = property.slice(separator + 1);
        if (key && value) {
          metadata.set(key, value);
        }
      }
    }

    const mimeEnd = dataUri.path.indexOf(";");
    const mime = mimeEnd === -1 ? "" : dataUri.path.substring(0, mimeEnd);
    if (mime) {
      metadata.set(META_DATA_MIME, mime);
    }

    return metadata;
  }
}

export function toLocalResource(resource: URI, authority: string | undefined, localScheme: string): URI {
  if (authority) {
    const path = resource.path && !resource.path.startsWith(Slash)
      ? `${Slash}${resource.path}`
      : resource.path;
    return resource.with({ authority, path, scheme: localScheme });
  }

  return resource.with({ scheme: localScheme });
}
