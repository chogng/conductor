export interface IMouseEvent {
    readonly browserEvent: MouseEvent;
    readonly leftButton: boolean;
    readonly middleButton: boolean;
    readonly rightButton: boolean;
    readonly buttons: number;
    readonly target: HTMLElement | null;
    readonly detail: number;
    readonly posx: number;
    readonly posy: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly ctrlKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
    readonly metaKey: boolean;
    readonly timestamp: number;
    readonly defaultPrevented: boolean;

    preventDefault(): void;
    stopPropagation(): void;
}

export class StandardMouseEvent implements IMouseEvent {
    public readonly browserEvent: MouseEvent;
    public readonly leftButton: boolean;
    public readonly middleButton: boolean;
    public readonly rightButton: boolean;
    public readonly buttons: number;
    public readonly target: HTMLElement | null;
    public readonly detail: number;
    public readonly posx: number;
    public readonly posy: number;
    public readonly clientX: number;
    public readonly clientY: number;
    public readonly ctrlKey: boolean;
    public readonly shiftKey: boolean;
    public readonly altKey: boolean;
    public readonly metaKey: boolean;
    public readonly timestamp: number;
    public readonly defaultPrevented: boolean;

    constructor(targetWindow: Window, event: MouseEvent) {
        const iframeOffset = getIframeOffset(targetWindow, event.view);

        this.timestamp = Date.now();
        this.browserEvent = event;
        this.leftButton = event.button === 0;
        this.middleButton = event.button === 1;
        this.rightButton = event.button === 2;
        this.buttons = event.buttons;
        this.target = event.target instanceof HTMLElement ? event.target : null;
        this.detail = event.type === "dblclick" ? 2 : event.detail || 1;
        this.posx = event.pageX - iframeOffset.left;
        this.posy = event.pageY - iframeOffset.top;
        this.clientX = event.clientX - iframeOffset.left;
        this.clientY = event.clientY - iframeOffset.top;
        this.ctrlKey = event.ctrlKey;
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;
        this.metaKey = event.metaKey;
        this.defaultPrevented = event.defaultPrevented;
    }

    public preventDefault(): void {
        this.browserEvent.preventDefault();
    }

    public stopPropagation(): void {
        this.browserEvent.stopPropagation();
    }
}

export class DragMouseEvent extends StandardMouseEvent {
    public readonly dataTransfer: DataTransfer | null;

    constructor(targetWindow: Window, event: MouseEvent) {
        super(targetWindow, event);
        this.dataTransfer = "dataTransfer" in event ? (event as DragEvent).dataTransfer : null;
    }
}

export class StandardWheelEvent {
    public readonly browserEvent: WheelEvent;
    public readonly deltaX: number;
    public readonly deltaY: number;
    public readonly target: EventTarget | null;

    constructor(event: WheelEvent) {
        this.browserEvent = event;
        this.target = event.target;
        this.deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
        this.deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
    }

    public preventDefault(): void {
        this.browserEvent.preventDefault();
    }

    public stopPropagation(): void {
        this.browserEvent.stopPropagation();
    }
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
    if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return delta * 40;
    }

    if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return delta * 800;
    }

    return delta;
}

function getIframeOffset(targetWindow: Window, sourceWindow: Window | null): { left: number; top: number } {
    if (!sourceWindow || sourceWindow === targetWindow) {
        return { left: 0, top: 0 };
    }

    let left = 0;
    let top = 0;
    let current: Window | null = sourceWindow;

    while (current && current !== targetWindow) {
        try {
            const frameElement = current.frameElement;
            if (!(frameElement instanceof HTMLElement)) {
                break;
            }

            const rect = frameElement.getBoundingClientRect();
            left += rect.left;
            top += rect.top;
            current = current.parent;
        }
        catch {
            break;
        }
    }

    return { left, top };
}
