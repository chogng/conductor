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

export const posix = Object.freeze({
    sep: "/",
    delimiter: ":",
    extname(path: string): string {
        return doExtname(path, char => char === "/");
    },
});

export const win32 = Object.freeze({
    sep: "\\",
    delimiter: ";",
    extname(path: string): string {
        return doExtname(path, char => char === "/" || char === "\\");
    },
});

export const sep = win32.sep;
export const delimiter = win32.delimiter;
export const extname = win32.extname;
