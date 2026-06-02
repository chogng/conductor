import { Emitter, type Event as BaseEvent } from "src/cs/base/common/event";
import { type IDisposable } from "src/cs/base/common/lifecycle";

export type EventHandler = HTMLElement | HTMLDocument | Window;

export interface IDomEvent {
    <K extends keyof HTMLElementEventMap>(element: EventHandler, type: K, useCapture?: boolean): BaseEvent<HTMLElementEventMap[K]>;
    (element: EventHandler, type: string, useCapture?: boolean): BaseEvent<unknown>;
}

export interface DOMEventMap extends HTMLElementEventMap, DocumentEventMap, WindowEventMap {
    compositionstart: CompositionEvent;
    compositionupdate: CompositionEvent;
    compositionend: CompositionEvent;
}

export class DomEmitter<K extends keyof DOMEventMap> implements IDisposable {
    private readonly emitter: Emitter<DOMEventMap[K]>;

    public get event(): BaseEvent<DOMEventMap[K]> {
        return this.emitter.event;
    }

    constructor(element: Window, type: K, useCapture?: boolean);
    constructor(element: Document, type: K, useCapture?: boolean);
    constructor(element: EventHandler, type: K, useCapture?: boolean);
    constructor(element: EventHandler, type: K, useCapture?: boolean) {
        const listener = (event: Event) => this.emitter.fire(event as DOMEventMap[K]);
        this.emitter = new Emitter({
            onWillAddFirstListener: () => element.addEventListener(type, listener, useCapture),
            onDidRemoveLastListener: () => element.removeEventListener(type, listener, useCapture),
        });
    }

    public dispose(): void {
        this.emitter.dispose();
    }
}
