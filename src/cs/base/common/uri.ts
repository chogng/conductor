export type UriComponents = {
  readonly path: string;
  readonly scheme: string;
};

const WINDOWS_DRIVE_PATH = /^\/[a-zA-Z]:/;
const WINDOWS_DRIVE_FS_PATH = /^[a-zA-Z]:[\\/]/;
const isWindows = typeof process !== "undefined" && process.platform === "win32";

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

export class URI {
  public static file(fsPath: string): URI {
    return new URI("file", normalizeFilePath(fsPath));
  }

  public static parse(value: string): URI {
    const parsed = new URL(String(value ?? ""));
    const scheme = parsed.protocol.replace(/:$/, "");
    if (scheme === "file") {
      const pathname = decodeURIComponent(parsed.pathname || "/");
      const authority = parsed.host ? `//${parsed.host}` : "";
      return new URI("file", `${authority}${pathname}` || "/");
    }

    return new URI(scheme, decodeURIComponent(parsed.pathname || "/"));
  }

  public static revive(value: URI | UriComponents | string): URI {
    if (value instanceof URI) {
      return value;
    }

    if (typeof value === "string") {
      return URI.parse(value);
    }

    return new URI(String(value?.scheme ?? ""), String(value?.path ?? ""));
  }

  private constructor(
    public readonly scheme: string,
    public readonly path: string,
  ) {}

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
    return {
      path: this.path,
      scheme: this.scheme,
    };
  }

  public toString(): string {
    if (this.scheme === "file") {
      if (this.path.startsWith("//")) {
        const slashIndex = this.path.indexOf("/", 2);
        const authority = slashIndex === -1 ? this.path.slice(2) : this.path.slice(2, slashIndex);
        const pathname = slashIndex === -1 ? "/" : this.path.slice(slashIndex);
        return `file://${authority}${toEncodedPath(pathname)}`;
      }

      return `file://${toEncodedPath(this.path)}`;
    }

    return `${this.scheme}:${toEncodedPath(this.path)}`;
  }
}
