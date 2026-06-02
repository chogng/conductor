import type { Event } from "../../../common/event.js";
import type { IMessagePassingProtocol } from "./ipc.js";

export interface Sender {
    send(channel: string, message: unknown): void;
}

export class Protocol implements IMessagePassingProtocol {
    constructor(
        private readonly sender: Sender,
        public readonly onMessage: Event<Uint8Array>,
    ) {}

    public send(message: Uint8Array): void {
        this.sender.send("conductor:message", message);
    }

    public disconnect(): void {
        this.sender.send("conductor:disconnect", null);
    }
}
