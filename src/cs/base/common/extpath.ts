import { isWindows } from "./platform.js";

const Slash = "/";
const Backslash = "\\";
const Colon = ":";

function isWindowsDriveLetterCode(code: number): boolean {
  return code >= 65 && code <= 90 || code >= 97 && code <= 122;
}

function equalsIgnoreCase(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

function startsWithIgnoreCase(value: string, candidate: string): boolean {
  return value.toLowerCase().startsWith(candidate.toLowerCase());
}

function trimRight(value: string, char: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === char) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function isPathSeparator(code: number): boolean {
  return code === Slash.charCodeAt(0) || code === Backslash.charCodeAt(0);
}

export function toSlashes(osPath: string): string {
  return osPath.replace(/[\\/]/g, Slash);
}

export function toPosixPath(osPath: string): string {
  let path = String(osPath ?? "");
  if (!path.includes(Slash)) {
    path = toSlashes(path);
  } else {
    path = path.replace(/\\/g, Slash);
  }

  if (/^[a-zA-Z]:(\/|$)/.test(path)) {
    path = `${Slash}${path}`;
  }

  return path;
}

export function getRoot(path: string, sep = Slash): string {
  if (!path) {
    return "";
  }

  const length = path.length;
  const firstCode = path.charCodeAt(0);
  if (isPathSeparator(firstCode)) {
    if (isPathSeparator(path.charCodeAt(1)) && !isPathSeparator(path.charCodeAt(2))) {
      let position = 3;
      const authorityStart = position;
      for (; position < length; position += 1) {
        if (isPathSeparator(path.charCodeAt(position))) {
          break;
        }
      }

      if (authorityStart !== position && !isPathSeparator(path.charCodeAt(position + 1))) {
        position += 1;
        for (; position < length; position += 1) {
          if (isPathSeparator(path.charCodeAt(position))) {
            return path.slice(0, position + 1).replace(/[\\/]/g, sep);
          }
        }
      }
    }

    return sep;
  }

  if (isWindowsDriveLetterCode(firstCode) && path.charAt(1) === Colon) {
    return isPathSeparator(path.charCodeAt(2))
      ? `${path.slice(0, 2)}${sep}`
      : path.slice(0, 2);
  }

  let position = path.indexOf("://");
  if (position !== -1) {
    position += 3;
    for (; position < length; position += 1) {
      if (isPathSeparator(path.charCodeAt(position))) {
        return path.slice(0, position + 1);
      }
    }
  }

  return "";
}

export function isUNC(path: string): boolean {
  if (!isWindows || !path || path.length < 5 || path.charAt(0) !== Backslash || path.charAt(1) !== Backslash) {
    return false;
  }

  let position = 2;
  const authorityStart = position;
  for (; position < path.length; position += 1) {
    if (path.charAt(position) === Backslash) {
      break;
    }
  }

  return authorityStart !== position &&
    position + 1 < path.length &&
    path.charAt(position + 1) !== Backslash;
}

export function isEqual(pathA: string, pathB: string, ignoreCase?: boolean): boolean {
  if (pathA === pathB) {
    return true;
  }

  if (!ignoreCase || !pathA || !pathB) {
    return false;
  }

  return equalsIgnoreCase(pathA, pathB);
}

export function isEqualOrParent(
  base: string,
  parentCandidate: string,
  ignoreCase?: boolean,
  separator = isWindows ? Backslash : Slash,
): boolean {
  if (base === parentCandidate) {
    return true;
  }

  if (!base || !parentCandidate || parentCandidate.length > base.length) {
    return false;
  }

  if (ignoreCase) {
    if (!startsWithIgnoreCase(base, parentCandidate)) {
      return false;
    }

    if (parentCandidate.length === base.length) {
      return true;
    }

    let separatorOffset = parentCandidate.length;
    if (parentCandidate.charAt(parentCandidate.length - 1) === separator) {
      separatorOffset -= 1;
    }

    return base.charAt(separatorOffset) === separator;
  }

  const parentWithSeparator = parentCandidate.charAt(parentCandidate.length - 1) === separator
    ? parentCandidate
    : `${parentCandidate}${separator}`;
  return base.startsWith(parentWithSeparator);
}

export function removeTrailingPathSeparator(candidate: string): string {
  if (isWindows) {
    const result = trimRight(candidate, Backslash);
    return result.endsWith(Colon) ? `${result}${Backslash}` : result;
  }

  const result = trimRight(candidate, Slash);
  return result || Slash;
}

export function isWindowsDriveLetter(char0: number): boolean {
  return isWindowsDriveLetterCode(char0);
}

export function hasDriveLetter(path: string, isWindowsOS = isWindows): boolean {
  return isWindowsOS && isWindowsDriveLetterCode(path.charCodeAt(0)) && path.charAt(1) === Colon;
}

export function getDriveLetter(path: string, isWindowsOS = isWindows): string | undefined {
  return hasDriveLetter(path, isWindowsOS) ? path[0] : undefined;
}

export function indexOfPath(path: string, candidate: string, ignoreCase?: boolean): number {
  if (candidate.length > path.length) {
    return -1;
  }

  if (path === candidate) {
    return 0;
  }

  return ignoreCase
    ? path.toLowerCase().indexOf(candidate.toLowerCase())
    : path.indexOf(candidate);
}
