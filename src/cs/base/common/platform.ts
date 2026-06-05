import { getNLSLanguage, resolveNLSLanguage } from "../../nls.js";

export const LANGUAGE_DEFAULT = "en";

let _isWindows = false;
let _isMacintosh = false;
let _isLinux = false;
let _isNative = false;
let _isWeb = false;
let _isElectron = false;
let _isCI = false;
let _isMobile = false;
let _locale: string | undefined;
let _language: string = LANGUAGE_DEFAULT;
let _platformLocale: string = LANGUAGE_DEFAULT;
let _userAgent: string | undefined;

export interface IProcessEnvironment {
    [key: string]: string | undefined;
}

export interface INodeProcess {
    platform: string;
    arch: string;
    env: IProcessEnvironment | (() => IProcessEnvironment);
    versions?: {
        node?: string;
        electron?: string;
        chrome?: string;
    };
    type?: string;
    cwd: () => string;
}

type GlobalWithProcess = typeof globalThis & {
    conductor?: {
        process?: INodeProcess;
        context?: {
            configuration?: () => {
                nls?: {
                    language?: string;
                };
            } | undefined;
        };
    };
    importScripts?: unknown;
    origin?: string;
    postMessage?: (message: unknown, targetOrigin: string) => void;
    addEventListener?: (
        type: "message",
        listener: (event: { data: unknown }) => void,
    ) => void;
};

declare const process: INodeProcess;

const $globalThis: GlobalWithProcess = globalThis;

let nodeProcess: INodeProcess | undefined;
if (typeof $globalThis.conductor?.process !== "undefined") {
    nodeProcess = $globalThis.conductor.process;
} else if (typeof process !== "undefined" && typeof process.versions?.node === "string") {
    nodeProcess = process;
}

const isElectronProcess = typeof nodeProcess?.versions?.electron === "string";
const isElectronRenderer = isElectronProcess && nodeProcess?.type === "renderer";

const getProcessEnv = (nodeProcess: INodeProcess): IProcessEnvironment => {
    return typeof nodeProcess.env === "function"
        ? nodeProcess.env()
        : nodeProcess.env;
};

const getConductorNLSLanguage = (): string | undefined => {
    return $globalThis.conductor?.context?.configuration?.()?.nls?.language;
};

if (typeof nodeProcess === "object") {
    const env = getProcessEnv(nodeProcess);

    _isWindows = nodeProcess.platform === "win32";
    _isMacintosh = nodeProcess.platform === "darwin";
    _isLinux = nodeProcess.platform === "linux";
    _isElectron = isElectronProcess;
    _isCI = !!env["CI"] || !!env["BUILD_ARTIFACTSTAGINGDIRECTORY"] || !!env["GITHUB_WORKSPACE"];
    _locale = LANGUAGE_DEFAULT;
    _language = LANGUAGE_DEFAULT;

    const conductorNLSLanguage = getConductorNLSLanguage();
    if (conductorNLSLanguage) {
        _language = resolveNLSLanguage(conductorNLSLanguage);
    }

    _isNative = _isWindows || _isMacintosh || _isLinux;
} else if (typeof navigator === "object" && !isElectronRenderer) {
    _userAgent = navigator.userAgent;
    // Pure web (non-Electron) runs against a virtual, POSIX-style file system
    // (see HTMLFileSystemProvider). Path semantics must NOT depend on the host
    // OS here: deriving isWindows/isLinux from the user agent would make
    // URI.fsPath / extpath / resources apply Windows (backslash, drive-letter)
    // rules to virtual "/folder/file" paths and corrupt folder imports. Only
    // isMacintosh is kept, since it drives keyboard-modifier UI, not paths.
    _isMacintosh = _userAgent.includes("Macintosh");
    _isMobile = _userAgent.includes("Mobi");
    _isWeb = true;
    _language = getNLSLanguage();
    _locale = navigator.language.toLowerCase();
    _platformLocale = _locale;
} else {
    console.error("Unable to resolve platform.");
}

export const enum Platform {
    Web,
    Windows,
    Mac,
    Linux,
}

export type PlatformName = "Web" | "Windows" | "Mac" | "Linux";

export function PlatformToString(platform: Platform): PlatformName {
    switch (platform) {
        case Platform.Web:
            return "Web";
        case Platform.Windows:
            return "Windows";
        case Platform.Mac:
            return "Mac";
        case Platform.Linux:
            return "Linux";
    }
}

let _platform: Platform = Platform.Web;
if (_isNative && _isWindows) {
    _platform = Platform.Windows;
} else if (_isNative && _isMacintosh) {
    _platform = Platform.Mac;
} else if (_isNative && _isLinux) {
    _platform = Platform.Linux;
}

export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isLinux = _isLinux;
export const isNative = _isNative;
export const isElectron = _isElectron;
export const isWeb = _isWeb;
export const isWebWorker = _isWeb && typeof $globalThis.importScripts === "function";
export const webWorkerOrigin = isWebWorker ? $globalThis.origin : undefined;
export const isMobile = _isMobile;
export const isCI = _isCI;
export const platform = _platform;
export const userAgent = _userAgent;
export const language = _language;

export namespace Language {
    export function value(): string {
        return language;
    }

    export function isDefaultVariant(): boolean {
        if (language.length === 2) {
            return language === LANGUAGE_DEFAULT;
        }

        if (language.length >= 3) {
            return language.startsWith(`${LANGUAGE_DEFAULT}-`);
        }

        return false;
    }

    export function isDefault(): boolean {
        return language === LANGUAGE_DEFAULT;
    }
}

export const locale = _locale;
export const platformLocale = _platformLocale;

export const setTimeout0IsFaster = typeof $globalThis.postMessage === "function" && !$globalThis.importScripts;

export const setTimeout0 = (() => {
    if (setTimeout0IsFaster) {
        interface IQueueElement {
            id: number;
            callback: () => void;
        }

        const pending: IQueueElement[] = [];

        $globalThis.addEventListener("message", event => {
            const data: unknown = event.data;
            if (!data || typeof data !== "object" || !("conductorScheduleAsyncWork" in data)) {
                return;
            }

            const scheduledWork = data.conductorScheduleAsyncWork;
            if (typeof scheduledWork !== "number") {
                return;
            }

            const index = pending.findIndex(candidate => candidate.id === scheduledWork);
            if (index === -1) {
                return;
            }

            const candidate = pending[index];
            pending.splice(index, 1);
            candidate.callback();
        });

        let lastId = 0;
        return (callback: () => void) => {
            const id = ++lastId;
            pending.push({ id, callback });
            $globalThis.postMessage({ conductorScheduleAsyncWork: id }, "*");
        };
    }

    return (callback: () => void) => setTimeout(callback);
})();

let _isLittleEndian = true;
let _isLittleEndianComputed = false;

export function isLittleEndian(): boolean {
    if (!_isLittleEndianComputed) {
        _isLittleEndianComputed = true;
        const test = new Uint8Array(2);
        test[0] = 1;
        test[1] = 2;
        const view = new Uint16Array(test.buffer);
        _isLittleEndian = view[0] === (2 << 8) + 1;
    }

    return _isLittleEndian;
}

export const isChrome = !!(userAgent && userAgent.includes("Chrome"));
export const isFirefox = !!(userAgent && userAgent.includes("Firefox"));
export const isSafari = !!(!isChrome && userAgent && userAgent.includes("Safari"));
export const isEdge = !!(userAgent && userAgent.includes("Edg/"));
export const isAndroid = !!(userAgent && userAgent.includes("Android"));

export function isTahoeOrNewer(osVersion: string): boolean {
    return parseFloat(osVersion) >= 25;
}
