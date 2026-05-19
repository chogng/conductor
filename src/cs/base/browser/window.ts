export type CodeWindow = Window & typeof globalThis & {
    readonly conductorWindowId: number;
};

let fallbackWindowId = 1;

export function ensureCodeWindow(targetWindow: Window, windowId = fallbackWindowId): asserts targetWindow is CodeWindow {
    const codeWindow = targetWindow as Partial<CodeWindow>;

    if (typeof codeWindow.conductorWindowId !== "number") {
        Object.defineProperty(codeWindow, "conductorWindowId", {
            configurable: true,
            get: () => windowId,
        });
    }
}

export function nextWindowId(): number {
    fallbackWindowId += 1;
    return fallbackWindowId;
}

export const mainWindow = globalThis.window as CodeWindow;

if (typeof mainWindow !== "undefined") {
    ensureCodeWindow(mainWindow, 1);
}

export function isAuxiliaryWindow(value: Window): value is CodeWindow {
    return value !== mainWindow && typeof (value as Partial<CodeWindow>).conductorWindowId === "number";
}
