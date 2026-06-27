function validateString(value: string, name: string): void {
    if (typeof value !== "string") {
        throw new TypeError(`The "${name}" argument must be of type string.`);
    }
}

function doExtname(path: string, isPathSeparator: (char: string) => boolean): string {
    validateString(path, "path");

    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSeparator = true;
    let preDotState = 0;

    for (let index = path.length - 1; index >= 0; index--) {
        const char = path[index];
        if (isPathSeparator(char)) {
            if (!matchedSeparator) {
                startPart = index + 1;
                break;
            }
            continue;
        }

        if (end === -1) {
            matchedSeparator = false;
            end = index + 1;
        }

        if (char === ".") {
            if (startDot === -1) {
                startDot = index;
            }
            else if (preDotState !== 1) {
                preDotState = 1;
            }
        }
        else if (startDot !== -1) {
            preDotState = -1;
        }
    }

    if (
        startDot === -1
        || end === -1
        || preDotState === 0
        || (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    ) {
        return "";
    }

    return path.slice(startDot, end);
}

function doBasename(
    path: string,
    isPathSeparator: (char: string) => boolean,
    suffix?: string,
    start = 0,
): string {
    if (suffix !== undefined) {
        validateString(suffix, "suffix");
    }
    validateString(path, "path");

    let startPart = start;
    let end = -1;
    let matchedSeparator = true;

    for (let index = path.length - 1; index >= start; index--) {
        if (isPathSeparator(path[index])) {
            if (!matchedSeparator) {
                startPart = index + 1;
                break;
            }
            continue;
        }

        if (end === -1) {
            matchedSeparator = false;
            end = index + 1;
        }
    }

    if (end === -1) {
        return "";
    }

    const base = path.slice(startPart, end);
    if (suffix && suffix.length <= base.length && base.endsWith(suffix)) {
        return base.slice(0, base.length - suffix.length);
    }

    return base;
}

export const posix = Object.freeze({
    sep: "/",
    delimiter: ":",
    basename(path: string, suffix?: string): string {
        return doBasename(path, char => char === "/", suffix);
    },
    extname(path: string): string {
        return doExtname(path, char => char === "/");
    },
});

export const win32 = Object.freeze({
    sep: "\\",
    delimiter: ";",
    basename(path: string, suffix?: string): string {
        const start = path.length >= 2 && /^[a-zA-Z]$/.test(path[0]) && path[1] === ":" ? 2 : 0;
        return doBasename(path, char => char === "/" || char === "\\", suffix, start);
    },
    extname(path: string): string {
        return doExtname(path, char => char === "/" || char === "\\");
    },
});

export const sep = win32.sep;
export const delimiter = win32.delimiter;
export const basename = win32.basename;
export const extname = win32.extname;
