export const Mimes = Object.freeze({
    text: "text/plain",
    binary: "application/octet-stream",
    unknown: "application/unknown",
    markdown: "text/markdown",
    latex: "text/latex",
    uriList: "text/uri-list",
    html: "text/html",
});

const mapExtToTextMimes: Record<string, string> = {
    ".css": "text/css",
    ".csv": "text/csv",
    ".htm": "text/html",
    ".html": "text/html",
    ".ics": "text/calendar",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".txt": "text/plain",
    ".xml": "text/xml",
};

const mapExtToMediaMimes: Record<string, string | string[]> = {
    ".aac": "audio/x-aac",
    ".avi": "video/x-msvideo",
    ".bmp": "image/bmp",
    ".flv": "video/x-flv",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpe": ["image/jpg", "image/jpeg"],
    ".jpeg": ["image/jpg", "image/jpeg"],
    ".jpg": ["image/jpg", "image/jpeg"],
    ".m1v": "video/mpeg",
    ".m2a": "audio/mpeg",
    ".m2v": "video/mpeg",
    ".m3a": "audio/mpeg",
    ".mid": "audio/midi",
    ".midi": "audio/midi",
    ".mk3d": "video/x-matroska",
    ".mks": "video/x-matroska",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".movie": "video/x-sgi-movie",
    ".mp2": "audio/mpeg",
    ".mp2a": "audio/mpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".mp4a": "audio/mp4",
    ".mp4v": "video/mp4",
    ".mpe": "video/mpeg",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".mpg4": "video/mp4",
    ".mpga": "audio/mpeg",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".ogv": "video/ogg",
    ".png": "image/png",
    ".psd": "image/vnd.adobe.photoshop",
    ".qt": "video/quicktime",
    ".spx": "audio/ogg",
    ".svg": "image/svg+xml",
    ".tga": "image/x-tga",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".wav": "audio/x-wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".wma": "audio/x-ms-wma",
    ".wmv": "video/x-ms-wmv",
    ".woff": "application/font-woff",
};

function extname(path: string): string {
    const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const name = path.slice(lastSlash + 1);
    const lastDot = name.lastIndexOf(".");
    return lastDot > 0 ? name.slice(lastDot) : "";
}

export function getMediaOrTextMime(path: string): string | undefined {
    const ext = extname(path).toLowerCase();
    return mapExtToTextMimes[ext] ?? getMediaMime(path);
}

export function getMediaMime(path: string): string | undefined {
    const mimeType = mapExtToMediaMimes[extname(path).toLowerCase()];
    return Array.isArray(mimeType) ? mimeType[0] : mimeType;
}

export function getExtensionForMimeType(mimeType: string): string | undefined {
    for (const extension in mapExtToMediaMimes) {
        const value = mapExtToMediaMimes[extension];
        if (Array.isArray(value) ? value.includes(mimeType) : value === mimeType) {
            return extension;
        }
    }

    return undefined;
}

const simplePattern = /^(.+)\/(.+?)(;.+)?$/;

export function normalizeMimeType(mimeType: string): string;
export function normalizeMimeType(mimeType: string, strict: true): string | undefined;
export function normalizeMimeType(mimeType: string, strict?: true): string | undefined {
    const match = simplePattern.exec(mimeType);
    if (!match) {
        return strict ? undefined : mimeType;
    }

    return `${match[1].toLowerCase()}/${match[2].toLowerCase()}${match[3] ?? ""}`;
}

export function isTextStreamMime(mimeType: string): boolean {
    return mimeType === "application/vnd.code.notebook.stdout"
        || mimeType === "application/vnd.code.notebook.stderr";
}
