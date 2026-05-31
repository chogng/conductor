import type { WebContents } from "electron";

import { Emitter, Event } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { type ClientConnectionEvent, IPCServer } from "src/cs/base/parts/ipc/common/ipc";
import { Protocol as ElectronProtocol } from "src/cs/base/parts/ipc/common/ipc.electron";
import { validatedIpcMain } from "src/cs/base/parts/ipc/electron-main/ipcMain";

interface IpcMessageEvent {
    readonly sender: WebContents;
    readonly message: Uint8Array | null;
}

function toMessageBytes(message: unknown): Uint8Array | null {
    if (message === null) {
        return null;
    }

    if (message instanceof Uint8Array) {
        return message;
    }

    if (message instanceof ArrayBuffer) {
        return new Uint8Array(message);
    }

    return null;
}

function createScopedOnMessageEvent(senderId: number, eventName: string): Event<Uint8Array | null> {
    return (listener, thisArgs, disposables) => {
        const handler = (event: Electron.IpcMainEvent, message: unknown) => {
            if (event.sender.id !== senderId) {
                return;
            }

            listener.call(thisArgs, toMessageBytes(message));
        };

        validatedIpcMain.on(eventName, handler);

        const disposable = toDisposable(() => validatedIpcMain.removeListener(eventName, handler));

        if (Array.isArray(disposables)) {
            disposables.push(disposable);
        }
        else {
            disposables?.add(disposable);
        }

        return disposable;
    };
}

export class Server extends IPCServer {
    private static readonly clients = new Map<number, IDisposable>();

    private static getOnDidClientConnect(): Event<ClientConnectionEvent> {
        return (listener, thisArgs, disposables) => {
            const handler = (event: Electron.IpcMainEvent) => {
                const webContents = event.sender;
                const id = webContents.id;
                const existingClient = Server.clients.get(id);

                existingClient?.dispose();

                const onDidClientReconnect = new Emitter<void>();
                Server.clients.set(id, toDisposable(() => onDidClientReconnect.fire()));

                const onMessage = Event.filter(createScopedOnMessageEvent(id, "conductor:message"), (message): message is Uint8Array => message !== null);
                const onDidDisconnectFromIpc = Event.map(createScopedOnMessageEvent(id, "conductor:disconnect"), () => undefined);
                const onDidClientDisconnect = Event.any(onDidDisconnectFromIpc, onDidClientReconnect.event);
                const protocol = new ElectronProtocol(webContents, onMessage);

                listener.call(thisArgs, { protocol, onDidClientDisconnect });
            };

            validatedIpcMain.on("conductor:hello", handler);

            const disposable = toDisposable(() => validatedIpcMain.removeListener("conductor:hello", handler));

            if (Array.isArray(disposables)) {
                disposables.push(disposable);
            }
            else {
                disposables?.add(disposable);
            }

            return disposable;
        };
    }

    constructor() {
        super(Server.getOnDidClientConnect());
    }
}
