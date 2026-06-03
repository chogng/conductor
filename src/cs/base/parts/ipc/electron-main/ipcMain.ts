import electron from "electron";

import {
    DefaultURITransformer,
    transformAndReviveIncomingURIs,
    transformOutgoingURIs,
} from "../../../common/uriIpc.js";

type IpcMainListener = (event: electron.IpcMainEvent, ...args: unknown[]) => void;

class ValidatedIpcMain {
    private readonly listenerWrappers = new WeakMap<IpcMainListener, Map<string, IpcMainListener>>();

    private transformOutgoingValue<T>(value: T): T {
        return transformOutgoingURIs(value, DefaultURITransformer);
    }

    private transformIncomingArgs(args: unknown[]): unknown[] {
        return transformAndReviveIncomingURIs(args, DefaultURITransformer);
    }

    public on(channel: string, listener: IpcMainListener): this {
        electron.ipcMain.on(channel, this.wrapListener(channel, listener));

        return this;
    }

    public once(channel: string, listener: IpcMainListener): this {
        electron.ipcMain.once(channel, (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                listener(event, ...this.transformIncomingArgs(args));
            }
        });

        return this;
    }

    public handle(channel: string, listener: (event: electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): this {
        electron.ipcMain.handle(channel, (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                return Promise.resolve(listener(event, ...this.transformIncomingArgs(args)))
                    .then(result => this.transformOutgoingValue(result));
            }

            return Promise.reject(new Error(`Invalid IPC channel or sender: ${channel}`));
        });

        return this;
    }

    public removeHandler(channel: string): this {
        electron.ipcMain.removeHandler(channel);
        return this;
    }

    public removeListener(channel: string, listener: IpcMainListener): this {
        electron.ipcMain.removeListener(channel, this.removeWrappedListener(channel, listener));

        return this;
    }

    private validateEvent(channel: string, event: electron.IpcMainEvent | electron.IpcMainInvokeEvent): boolean {
        if (!channel.startsWith("conductor:")) {
            console.error(`Refused to handle IPC event for unknown channel '${channel}'.`);
            return false;
        }

        const senderFrame = event.senderFrame;
        const url = senderFrame?.url;

        if (!url || url === "about:blank") {
            return true;
        }

        try {
            const parsedUrl = new URL(url);
            return parsedUrl.protocol === "file:" || parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
        }
        catch (error) {
            console.error(`Refused to handle IPC event for malformed sender URL '${url}'.`, error);
            return false;
        }
    }

    private wrapListener(channel: string, listener: IpcMainListener): IpcMainListener {
        let wrappedListeners = this.listenerWrappers.get(listener);
        if (!wrappedListeners) {
            wrappedListeners = new Map<string, IpcMainListener>();
            this.listenerWrappers.set(listener, wrappedListeners);
        }

        const wrappedListener = wrappedListeners.get(channel);
        if (wrappedListener) {
            return wrappedListener;
        }

        const wrapped: IpcMainListener = (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                listener(event, ...this.transformIncomingArgs(args));
            }
        };
        wrappedListeners.set(channel, wrapped);
        return wrapped;
    }

    private removeWrappedListener(channel: string, listener: IpcMainListener): IpcMainListener {
        const wrappedListeners = this.listenerWrappers.get(listener);
        const wrappedListener = wrappedListeners?.get(channel);
        if (!wrappedListeners || !wrappedListener) {
            return listener;
        }

        wrappedListeners.delete(channel);
        if (wrappedListeners.size === 0) {
            this.listenerWrappers.delete(listener);
        }
        return wrappedListener;
    }
}

export const validatedIpcMain = new ValidatedIpcMain();
