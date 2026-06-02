import { isWindows } from "src/cs/base/common/platform";
import { posix, win32 } from "src/cs/base/common/path";
import { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IPathService = createDecorator<IPathService>("pathService");

export type PathLibrary = typeof win32 | typeof posix;

export interface IPathService {
    readonly _serviceBrand: undefined;
    readonly path: Promise<PathLibrary>;
    readonly defaultUriScheme: string;
    readonly resolvedUserHome: URI | undefined;

    fileURI(path: string): Promise<URI>;
    userHome(options: { preferLocal: true }): URI;
    userHome(options?: { preferLocal: boolean }): Promise<URI>;
}

export abstract class AbstractPathService implements IPathService {
    public declare readonly _serviceBrand: undefined;

    private resolvedHome: URI | undefined;

    constructor(
        private readonly localUserHome: URI,
        private readonly isWindowsFileSystem: boolean,
    ) {}

    public get path(): Promise<PathLibrary> {
        return Promise.resolve(this.isWindowsFileSystem ? win32 : posix);
    }

    public get defaultUriScheme(): string {
        return "file";
    }

    public get resolvedUserHome(): URI | undefined {
        return this.resolvedHome;
    }

    public async fileURI(path: string): Promise<URI> {
        return URI.file(this.isWindowsFileSystem ? path.replace(/\\/g, "/") : path);
    }

    public userHome(options: { preferLocal: true }): URI;
    public userHome(options?: { preferLocal: boolean }): Promise<URI>;
    public userHome(options?: { preferLocal: boolean }): Promise<URI> | URI {
        if (options?.preferLocal) {
            return this.localUserHome;
        }

        this.resolvedHome = this.localUserHome;
        return Promise.resolve(this.localUserHome);
    }
}

export function isWindowsFileSystem(): boolean {
    return isWindows;
}
