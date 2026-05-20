import { Emitter, type Event as BaseEvent } from "src/cs/base/common/event";
import { DisposableStore, type IDisposable, toDisposable } from "src/cs/base/common/lifecycle";
import { StandardMouseEvent, type IMouseEvent } from "src/cs/base/browser/mouseEvent";
import { type CodeWindow, ensureCodeWindow, mainWindow, nextWindowId } from "src/cs/base/browser/window";

export interface IRegisteredCodeWindow {
    readonly window: CodeWindow;
    readonly disposables: DisposableStore;
}

export const EventType = {
    BEFORE_UNLOAD: "beforeunload",
    BLUR: "blur",
    CHANGE: "change",
    CLICK: "click",
    CONTEXT_MENU: "contextmenu",
    DBLCLICK: "dblclick",
    FOCUS: "focus",
    FOCUS_IN: "focusin",
    FOCUS_OUT: "focusout",
    INPUT: "input",
    KEY_DOWN: "keydown",
    KEY_PRESS: "keypress",
    KEY_UP: "keyup",
    MOUSE_DOWN: "mousedown",
    MOUSE_ENTER: "mouseenter",
    MOUSE_LEAVE: "mouseleave",
    MOUSE_MOVE: "mousemove",
    MOUSE_OUT: "mouseout",
    MOUSE_OVER: "mouseover",
    MOUSE_UP: "mouseup",
    POINTER_DOWN: "pointerdown",
    POINTER_MOVE: "pointermove",
    POINTER_UP: "pointerup",
    RESIZE: "resize",
    SCROLL: "scroll",
    WHEEL: "wheel",
} as const;

const windows = new Map<number, IRegisteredCodeWindow>();
const onDidRegisterWindowEmitter = new Emitter<IRegisteredCodeWindow>();
const onWillUnregisterWindowEmitter = new Emitter<CodeWindow>();
const onDidUnregisterWindowEmitter = new Emitter<CodeWindow>();

if (typeof mainWindow !== "undefined") {
    windows.set(mainWindow.conductorWindowId, {
        window: mainWindow,
        disposables: new DisposableStore(),
    });
}

export const onDidRegisterWindow = onDidRegisterWindowEmitter.event;
export const onWillUnregisterWindow = onWillUnregisterWindowEmitter.event;
export const onDidUnregisterWindow = onDidUnregisterWindowEmitter.event;

export function registerWindow(targetWindow: Window): IDisposable {
    ensureCodeWindow(targetWindow, nextWindowId());
    const codeWindow = targetWindow;

    if (windows.has(codeWindow.conductorWindowId)) {
        return toDisposable(() => {});
    }

    const disposables = new DisposableStore();
    const registeredWindow: IRegisteredCodeWindow = {
        window: codeWindow,
        disposables: disposables.add(new DisposableStore()),
    };

    windows.set(codeWindow.conductorWindowId, registeredWindow);
    disposables.add(addDisposableListener(codeWindow, EventType.BEFORE_UNLOAD, () => {
        onWillUnregisterWindowEmitter.fire(codeWindow);
    }));
    disposables.add(toDisposable(() => {
        windows.delete(codeWindow.conductorWindowId);
        onDidUnregisterWindowEmitter.fire(codeWindow);
    }));

    onDidRegisterWindowEmitter.fire(registeredWindow);
    return disposables;
}

export function getWindows(): Iterable<IRegisteredCodeWindow> {
    return windows.values();
}

export function getWindowsCount(): number {
    return windows.size;
}

export function getWindowId(targetWindow: Window): number {
    ensureCodeWindow(targetWindow, nextWindowId());
    return targetWindow.conductorWindowId;
}

export function hasWindow(windowId: number): boolean {
    return windows.has(windowId);
}

export function getWindowById(windowId: number | undefined, fallbackToMain: true): IRegisteredCodeWindow;
export function getWindowById(windowId: number | undefined, fallbackToMain?: boolean): IRegisteredCodeWindow | undefined;
export function getWindowById(windowId: number | undefined, fallbackToMain?: boolean): IRegisteredCodeWindow | undefined {
    const registeredWindow = typeof windowId === "number" ? windows.get(windowId) : undefined;
    return registeredWindow ?? (fallbackToMain ? windows.get(mainWindow.conductorWindowId) : undefined);
}

export function getWindow(source?: Node | UIEvent | null): CodeWindow {
    const candidateNode = source as Node | undefined | null;
    if (candidateNode?.ownerDocument?.defaultView) {
        const targetWindow = candidateNode.ownerDocument.defaultView.window;
        ensureCodeWindow(targetWindow, nextWindowId());
        return targetWindow;
    }

    const candidateEvent = source as UIEvent | undefined | null;
    if (candidateEvent?.view) {
        const targetWindow = candidateEvent.view.window;
        ensureCodeWindow(targetWindow, nextWindowId());
        return targetWindow;
    }

    return mainWindow;
}

export function getDocument(source?: Node | UIEvent | null): Document {
    return getWindow(source).document;
}

export function clearNode(node: HTMLElement): void {
    while (node.firstChild) {
        node.firstChild.remove();
    }
}

class DomListener implements IDisposable {
    private disposed = false;

    constructor(
        private node: EventTarget,
        private readonly type: string,
        private handler: EventListener,
        private readonly options?: AddEventListenerOptions | boolean,
    ) {
        this.node.addEventListener(this.type, this.handler, this.options);
    }

    public dispose = (): void => {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.node.removeEventListener(this.type, this.handler, this.options);
        this.node = undefined as unknown as EventTarget;
        this.handler = undefined as unknown as EventListener;
    };
}

export function addDisposableListener<K extends keyof WindowEventMap>(
    node: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
): IDisposable;

export function addDisposableListener<K extends keyof DocumentEventMap>(
    node: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
): IDisposable;

export function addDisposableListener<K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
): IDisposable;

export function addDisposableListener(
    node: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions | boolean,
): IDisposable;

export function addDisposableListener(
    node: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions | boolean,
): IDisposable {
    return new DomListener(node, type, handler, options);
}

export function addStandardDisposableListener(
    node: HTMLElement | Document,
    type: "click" | "mousedown" | "mouseup" | "mousemove" | "contextmenu" | "dblclick",
    handler: (event: IMouseEvent) => void,
    options?: AddEventListenerOptions | boolean,
): IDisposable;
export function addStandardDisposableListener<K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
): IDisposable;
export function addStandardDisposableListener(
    node: HTMLElement | Document,
    type: string,
    handler: (event: any) => void,
    options?: AddEventListenerOptions | boolean,
): IDisposable {
    const wrapMouse = type === EventType.CLICK
        || type === EventType.MOUSE_DOWN
        || type === EventType.MOUSE_UP
        || type === EventType.MOUSE_MOVE
        || type === EventType.CONTEXT_MENU
        || type === EventType.DBLCLICK;
    const wrappedHandler = wrapMouse
        ? (event: Event) => handler(new StandardMouseEvent(getWindow(node), event as MouseEvent))
        : handler as EventListener;

    return addDisposableListener(node, type, wrappedHandler as EventListener, options);
}

export interface IDimension {
    readonly width: number;
    readonly height: number;
}

export interface IScrollDimensions {
    readonly scrollWidth: number;
    readonly scrollHeight: number;
    readonly clientWidth: number;
    readonly clientHeight: number;
}

export interface IScrollPosition {
    readonly scrollLeft: number;
    readonly scrollTop: number;
}

export class Dimension implements IDimension {
    public static readonly None = new Dimension(0, 0);

    constructor(
        public readonly width: number,
        public readonly height: number,
    ) {}

    public with(width = this.width, height = this.height): Dimension {
        if (width === this.width && height === this.height) {
            return this;
        }

        return new Dimension(width, height);
    }

    public isZero(): boolean {
        return this.width === 0 && this.height === 0;
    }

    public toString(): string {
        return `${this.width}x${this.height}`;
    }
}

export function getClientArea(element: HTMLElement | Window = mainWindow): Dimension {
    if (isHTMLElement(element)) {
        return new Dimension(element.clientWidth, element.clientHeight);
    }

    return new Dimension(element.innerWidth, element.innerHeight);
}

export function getElementSize(element: HTMLElement): Dimension {
    return new Dimension(element.offsetWidth, element.offsetHeight);
}

export function getScrollDimensions(element: HTMLElement): IScrollDimensions {
    return {
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
    };
}

export function getScrollPosition(element: HTMLElement): IScrollPosition {
    return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
    };
}

export function getDomRect(element: Element): DOMRect {
    return element.getBoundingClientRect();
}

export function getContentWidth(element: HTMLElement): number {
    const style = getWindow(element).getComputedStyle(element);
    const paddingLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
    const paddingRight = Number.parseFloat(style.paddingRight || "0") || 0;
    return Math.max(0, element.clientWidth - paddingLeft - paddingRight);
}

export function getContentHeight(element: HTMLElement): number {
    const style = getWindow(element).getComputedStyle(element);
    const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0") || 0;
    return Math.max(0, element.clientHeight - paddingTop - paddingBottom);
}

export function size(element: HTMLElement, width: number | null, height: number | null): void {
    if (typeof width === "number") {
        element.style.width = `${width}px`;
    }

    if (typeof height === "number") {
        element.style.height = `${height}px`;
    }
}

export function position(element: HTMLElement, top: number, right: number, bottom: number, left: number, positionValue = "absolute"): void {
    element.style.position = positionValue;
    element.style.top = `${top}px`;
    element.style.right = `${right}px`;
    element.style.bottom = `${bottom}px`;
    element.style.left = `${left}px`;
}

export function isHTMLElement(value: unknown): value is HTMLElement {
    return value instanceof HTMLElement;
}

export function isHTMLInputElement(value: unknown): value is HTMLInputElement {
    return value instanceof HTMLInputElement;
}

export function isHTMLTextAreaElement(value: unknown): value is HTMLTextAreaElement {
    return value instanceof HTMLTextAreaElement;
}

export function isEditableElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    return tagName === "input"
        || tagName === "textarea"
        || tagName === "select"
        || (isHTMLElement(element) && element.isContentEditable);
}

export function isActiveElement(element: Element): boolean {
    const activeElement = element.ownerDocument.activeElement;
    return activeElement === element || !!activeElement?.shadowRoot?.activeElement && activeElement.shadowRoot.activeElement === element;
}

export function append<T extends Node>(parent: HTMLElement, child: T): T;
export function append<T extends Node>(parent: HTMLElement, ...children: Array<T | string>): void;
export function append<T extends Node>(parent: HTMLElement, ...children: Array<T | string>): T | void {
    if (children.length === 1 && typeof children[0] !== "string") {
        parent.appendChild(children[0]);
        return children[0];
    }

    for (const child of children) {
        parent.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
}

export function prepend<T extends Node>(parent: HTMLElement, child: T): T {
    parent.insertBefore(child, parent.firstChild);
    return child;
}

export function reset(parent: HTMLElement, ...children: Array<Node | string>): void {
    clearNode(parent);
    append(parent, ...children);
}

export function $(description: string, attrs?: Record<string, unknown>, ...children: Array<Node | string>): HTMLElement {
    const match = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)(?:#([\w-]+))?$/.exec(description);
    const tagName = match?.[1] || "div";
    const element = document.createElement(tagName);
    const classes = match?.[2]
        ? match[2].split(".").filter(Boolean)
        : [];
    const id = match?.[3];

    if (classes.length) {
        element.className = classes.join(" ");
    }

    if (id) {
        element.id = id;
    }

    if (attrs) {
        for (const [name, value] of Object.entries(attrs)) {
            if (value === undefined || value === null) {
                continue;
            }

            if (name === "className") {
                element.className = String(value);
            }
            else if (name === "style" && typeof value === "object") {
                Object.assign(element.style, value);
            }
            else if (name in element) {
                (element as unknown as Record<string, unknown>)[name] = value;
            }
            else {
                element.setAttribute(name, String(value));
            }
        }
    }

    append(element, ...children);
    return element;
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

    constructor(
        private readonly element: Window | Document | HTMLElement,
        private readonly type: K,
        private readonly options?: AddEventListenerOptions | boolean,
    ) {
        const listener = (event: Event) => this.emitter.fire(event as DOMEventMap[K]);

        this.emitter = new Emitter({
            onWillAddFirstListener: () => this.element.addEventListener(this.type, listener, this.options),
            onDidRemoveLastListener: () => this.element.removeEventListener(this.type, listener, this.options),
        });
    }

    public dispose(): void {
        this.emitter.dispose();
    }
}

export function observeMutations(
    target: Node,
    callback: MutationCallback,
    options?: MutationObserverInit,
): IDisposable {
    const observer = new MutationObserver(callback);
    observer.observe(target, options);
    return toDisposable(() => observer.disconnect());
}

export class DisposableResizeObserver implements IDisposable {
    private readonly observer: ResizeObserver;

    constructor(
        targetWindow: Window,
        callback: ResizeObserverCallback,
    ) {
        const resizeObserverCtor = (targetWindow as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ?? ResizeObserver;
        this.observer = new resizeObserverCtor(callback);
    }

    public observe(target: Element, options?: ResizeObserverOptions): IDisposable {
        this.observer.observe(target, options);
        return toDisposable(() => this.observer.unobserve(target));
    }

    public disconnect(): void {
        this.observer.disconnect();
    }

    public dispose(): void {
        this.disconnect();
    }
}

type AnimationFrameQueueItem = {
    readonly priority: number;
    readonly runner: () => void;
    cancelled: boolean;
};

let animationFrameHandle: number | null = null;
let animationFrameRunning = false;
let animationFrameQueue: AnimationFrameQueueItem[] = [];

function flushAnimationFrameQueue(targetWindow: Window): void {
    animationFrameRunning = true;
    animationFrameHandle = null;

    const queue = animationFrameQueue
        .filter(item => !item.cancelled)
        .sort((a, b) => b.priority - a.priority);
    animationFrameQueue = [];

    for (const item of queue) {
        if (!item.cancelled) {
            item.runner();
        }
    }

    animationFrameRunning = false;

    if (animationFrameQueue.length > 0) {
        animationFrameHandle = targetWindow.requestAnimationFrame(() => flushAnimationFrameQueue(targetWindow));
    }
}

export function scheduleAtNextAnimationFrame(targetWindow: Window, runner: () => void, priority = 0): IDisposable {
    const item: AnimationFrameQueueItem = {
        priority,
        runner,
        cancelled: false,
    };

    animationFrameQueue.push(item);

    if (animationFrameHandle == null) {
        animationFrameHandle = targetWindow.requestAnimationFrame(() => flushAnimationFrameQueue(targetWindow));
    }

    return toDisposable(() => {
        item.cancelled = true;
    });
}

export function runAtThisOrScheduleAtNextAnimationFrame(targetWindow: Window, runner: () => void, priority = 0): IDisposable {
    if (animationFrameRunning) {
        runner();
        return toDisposable(() => {});
    }

    return scheduleAtNextAnimationFrame(targetWindow, runner, priority);
}
