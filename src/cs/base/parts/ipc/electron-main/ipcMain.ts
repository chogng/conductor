import electron from "electron";

type IpcMainListener = (event: electron.IpcMainEvent, ...args: unknown[]) => void;

class ValidatedIpcMain {
    private readonly listenerWrappers = new WeakMap<IpcMainListener, IpcMainListener>();

    public on(channel: string, listener: IpcMainListener): this {
        const wrappedListener: IpcMainListener = (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                listener(event, ...args);
            }
        };

        this.listenerWrappers.set(listener, wrappedListener);
        electron.ipcMain.on(channel, wrappedListener);

        return this;
    }

    public once(channel: string, listener: IpcMainListener): this {
        electron.ipcMain.once(channel, (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                listener(event, ...args);
            }
        });

        return this;
    }

    public handle(channel: string, listener: (event: electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): this {
        electron.ipcMain.handle(channel, (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                return listener(event, ...args);
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
        const wrappedListener = this.listenerWrappers.get(listener);

        if (wrappedListener) {
            electron.ipcMain.removeListener(channel, wrappedListener);
            this.listenerWrappers.delete(listener);
        }

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
}

export const validatedIpcMain = new ValidatedIpcMain();
