import { Emitter, type Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { IPCClient } from "src/cs/base/parts/ipc/common/ipc";
import { Protocol as ElectronProtocol } from "src/cs/base/parts/ipc/common/ipc.electron";
import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";

export class Client extends IPCClient implements IDisposable {
    private readonly protocol: ElectronProtocol;
    private readonly onMessageEmitter = new Emitter<Uint8Array>();
    private readonly onMessageListener = (_event: unknown, message: unknown) => {
        if (message instanceof Uint8Array) {
            this.onMessageEmitter.fire(message);
            return;
        }

        if (message instanceof ArrayBuffer) {
            this.onMessageEmitter.fire(new Uint8Array(message));
        }
    };

    private static createProtocol(onMessage: Event<Uint8Array>): ElectronProtocol {
        ipcRenderer.send("conductor:hello");
        return new ElectronProtocol(ipcRenderer, onMessage);
    }

    constructor(id: string) {
        const onMessageEmitter = new Emitter<Uint8Array>();
        const onMessageListener = (_event: unknown, message: unknown) => {
            if (message instanceof Uint8Array) {
                onMessageEmitter.fire(message);
                return;
            }

            if (message instanceof ArrayBuffer) {
                onMessageEmitter.fire(new Uint8Array(message));
            }
        };

        ipcRenderer.on("conductor:message", onMessageListener);

        const protocol = Client.createProtocol(onMessageEmitter.event);
        super(protocol, id);

        this.protocol = protocol;
        this.onMessageEmitter = onMessageEmitter;
        this.onMessageListener = onMessageListener;
    }

    public override dispose(): void {
        ipcRenderer.removeListener("conductor:message", this.onMessageListener);
        this.protocol.disconnect();
        this.onMessageEmitter.dispose();
        super.dispose();
    }
}
