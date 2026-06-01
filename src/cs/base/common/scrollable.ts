import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";

export const enum ScrollbarVisibility {
    Auto = 1,
    Hidden = 2,
    Visible = 3,
}

export interface ScrollEvent {
    inSmoothScrolling: boolean;

    oldWidth: number;
    oldScrollWidth: number;
    oldScrollLeft: number;

    width: number;
    scrollWidth: number;
    scrollLeft: number;

    oldHeight: number;
    oldScrollHeight: number;
    oldScrollTop: number;

    height: number;
    scrollHeight: number;
    scrollTop: number;

    widthChanged: boolean;
    scrollWidthChanged: boolean;
    scrollLeftChanged: boolean;

    heightChanged: boolean;
    scrollHeightChanged: boolean;
    scrollTopChanged: boolean;
}

export interface IScrollDimensions {
    readonly width: number;
    readonly scrollWidth: number;
    readonly height: number;
    readonly scrollHeight: number;
}

export interface INewScrollDimensions {
    width?: number;
    scrollWidth?: number;
    height?: number;
    scrollHeight?: number;
}

export interface IScrollPosition {
    readonly scrollLeft: number;
    readonly scrollTop: number;
}

export interface ISmoothScrollPosition {
    readonly scrollLeft: number;
    readonly scrollTop: number;
    readonly width: number;
    readonly height: number;
}

export interface INewScrollPosition {
    scrollLeft?: number;
    scrollTop?: number;
}

export class ScrollState implements IScrollDimensions, IScrollPosition {
    public readonly rawScrollLeft: number;
    public readonly rawScrollTop: number;
    public readonly width: number;
    public readonly scrollWidth: number;
    public readonly scrollLeft: number;
    public readonly height: number;
    public readonly scrollHeight: number;
    public readonly scrollTop: number;

    constructor(
        private readonly forceIntegerValues: boolean,
        width: number,
        scrollWidth: number,
        scrollLeft: number,
        height: number,
        scrollHeight: number,
        scrollTop: number,
    ) {
        if (this.forceIntegerValues) {
            width = width | 0;
            scrollWidth = scrollWidth | 0;
            scrollLeft = scrollLeft | 0;
            height = height | 0;
            scrollHeight = scrollHeight | 0;
            scrollTop = scrollTop | 0;
        }

        this.rawScrollLeft = scrollLeft;
        this.rawScrollTop = scrollTop;

        if (width < 0) {
            width = 0;
        }
        if (scrollLeft + width > scrollWidth) {
            scrollLeft = scrollWidth - width;
        }
        if (scrollLeft < 0) {
            scrollLeft = 0;
        }

        if (height < 0) {
            height = 0;
        }
        if (scrollTop + height > scrollHeight) {
            scrollTop = scrollHeight - height;
        }
        if (scrollTop < 0) {
            scrollTop = 0;
        }

        this.width = width;
        this.scrollWidth = scrollWidth;
        this.scrollLeft = scrollLeft;
        this.height = height;
        this.scrollHeight = scrollHeight;
        this.scrollTop = scrollTop;
    }

    public equals(other: ScrollState): boolean {
        return this.rawScrollLeft === other.rawScrollLeft
            && this.rawScrollTop === other.rawScrollTop
            && this.width === other.width
            && this.scrollWidth === other.scrollWidth
            && this.scrollLeft === other.scrollLeft
            && this.height === other.height
            && this.scrollHeight === other.scrollHeight
            && this.scrollTop === other.scrollTop;
    }

    public withScrollDimensions(update: INewScrollDimensions, useRawScrollPositions: boolean): ScrollState {
        return new ScrollState(
            this.forceIntegerValues,
            update.width ?? this.width,
            update.scrollWidth ?? this.scrollWidth,
            useRawScrollPositions ? this.rawScrollLeft : this.scrollLeft,
            update.height ?? this.height,
            update.scrollHeight ?? this.scrollHeight,
            useRawScrollPositions ? this.rawScrollTop : this.scrollTop,
        );
    }

    public withScrollPosition(update: INewScrollPosition): ScrollState {
        return new ScrollState(
            this.forceIntegerValues,
            this.width,
            this.scrollWidth,
            update.scrollLeft ?? this.rawScrollLeft,
            this.height,
            this.scrollHeight,
            update.scrollTop ?? this.rawScrollTop,
        );
    }

    public createScrollEvent(previous: ScrollState, inSmoothScrolling: boolean): ScrollEvent {
        const widthChanged = this.width !== previous.width;
        const scrollWidthChanged = this.scrollWidth !== previous.scrollWidth;
        const scrollLeftChanged = this.scrollLeft !== previous.scrollLeft;
        const heightChanged = this.height !== previous.height;
        const scrollHeightChanged = this.scrollHeight !== previous.scrollHeight;
        const scrollTopChanged = this.scrollTop !== previous.scrollTop;

        return {
            inSmoothScrolling,
            oldWidth: previous.width,
            oldScrollWidth: previous.scrollWidth,
            oldScrollLeft: previous.scrollLeft,
            width: this.width,
            scrollWidth: this.scrollWidth,
            scrollLeft: this.scrollLeft,
            oldHeight: previous.height,
            oldScrollHeight: previous.scrollHeight,
            oldScrollTop: previous.scrollTop,
            height: this.height,
            scrollHeight: this.scrollHeight,
            scrollTop: this.scrollTop,
            widthChanged,
            scrollWidthChanged,
            scrollLeftChanged,
            heightChanged,
            scrollHeightChanged,
            scrollTopChanged,
        };
    }
}

export interface IScrollableOptions {
    readonly forceIntegerValues: boolean;
    readonly smoothScrollDuration: number;
    readonly scheduleAtNextAnimationFrame: (callback: () => void) => IDisposable;
}

export class Scrollable extends Disposable {
    private smoothScrollDuration: number;
    private readonly scheduleAtNextAnimationFrame: (callback: () => void) => IDisposable;
    private state: ScrollState;
    private smoothScrolling: SmoothScrollingOperation | null = null;

    private readonly onScrollEmitter = this._register(new Emitter<ScrollEvent>());
    public readonly onScroll: Event<ScrollEvent> = this.onScrollEmitter.event;

    constructor(options: IScrollableOptions) {
        super();
        this.smoothScrollDuration = options.smoothScrollDuration;
        this.scheduleAtNextAnimationFrame = options.scheduleAtNextAnimationFrame;
        this.state = new ScrollState(options.forceIntegerValues, 0, 0, 0, 0, 0, 0);
    }

    public override dispose(): void {
        this.smoothScrolling?.dispose();
        this.smoothScrolling = null;
        super.dispose();
    }

    public setSmoothScrollDuration(smoothScrollDuration: number): void {
        this.smoothScrollDuration = smoothScrollDuration;
    }

    public validateScrollPosition(scrollPosition: INewScrollPosition): IScrollPosition {
        return this.state.withScrollPosition(scrollPosition);
    }

    public getScrollDimensions(): IScrollDimensions {
        return this.state;
    }

    public setScrollDimensions(dimensions: INewScrollDimensions, useRawScrollPositions: boolean): void {
        const newState = this.state.withScrollDimensions(dimensions, useRawScrollPositions);
        this.setState(newState, Boolean(this.smoothScrolling));
        this.smoothScrolling?.acceptScrollDimensions(this.state);
    }

    public getFutureScrollPosition(): IScrollPosition {
        return this.smoothScrolling?.to ?? this.state;
    }

    public getCurrentScrollPosition(): IScrollPosition {
        return this.state;
    }

    public setScrollPositionNow(update: INewScrollPosition): void {
        const newState = this.state.withScrollPosition(update);
        this.smoothScrolling?.dispose();
        this.smoothScrolling = null;
        this.setState(newState, false);
    }

    public setScrollPositionSmooth(update: INewScrollPosition, reuseAnimation?: boolean): void {
        if (this.smoothScrollDuration === 0) {
            this.setScrollPositionNow(update);
            return;
        }

        if (this.smoothScrolling) {
            update = {
                scrollLeft: update.scrollLeft ?? this.smoothScrolling.to.scrollLeft,
                scrollTop: update.scrollTop ?? this.smoothScrolling.to.scrollTop,
            };

            const validTarget = this.state.withScrollPosition(update);
            if (this.smoothScrolling.to.scrollLeft === validTarget.scrollLeft && this.smoothScrolling.to.scrollTop === validTarget.scrollTop) {
                return;
            }

            const nextSmoothScrolling = reuseAnimation
                ? new SmoothScrollingOperation(this.smoothScrolling.from, validTarget, this.smoothScrolling.startTime, this.smoothScrolling.duration)
                : this.smoothScrolling.combine(this.state, validTarget, this.smoothScrollDuration);
            this.smoothScrolling.dispose();
            this.smoothScrolling = nextSmoothScrolling;
        }
        else {
            const validTarget = this.state.withScrollPosition(update);
            this.smoothScrolling = SmoothScrollingOperation.start(this.state, validTarget, this.smoothScrollDuration);
        }

        this.smoothScrolling.animationFrameDisposable = this.scheduleAtNextAnimationFrame(() => this.performSmoothScrolling());
    }

    public hasPendingScrollAnimation(): boolean {
        return Boolean(this.smoothScrolling);
    }

    private performSmoothScrolling(): void {
        if (!this.smoothScrolling) {
            return;
        }

        this.smoothScrolling.animationFrameDisposable = null;
        const update = this.smoothScrolling.tick();
        const newState = this.state.withScrollPosition(update);
        this.setState(newState, true);

        if (!this.smoothScrolling) {
            return;
        }

        if (update.isDone) {
            this.smoothScrolling.dispose();
            this.smoothScrolling = null;
            return;
        }

        this.smoothScrolling.animationFrameDisposable = this.scheduleAtNextAnimationFrame(() => this.performSmoothScrolling());
    }

    private setState(newState: ScrollState, inSmoothScrolling: boolean): void {
        const oldState = this.state;
        if (oldState.equals(newState)) {
            return;
        }

        this.state = newState;
        this.onScrollEmitter.fire(this.state.createScrollEvent(oldState, inSmoothScrolling));
    }
}

export class SmoothScrollingUpdate {
    constructor(
        public readonly scrollLeft: number,
        public readonly scrollTop: number,
        public readonly isDone: boolean,
    ) {}
}

interface IAnimation {
    (completion: number): number;
}

export class SmoothScrollingOperation {
    public animationFrameDisposable: IDisposable | null = null;

    private scrollLeft!: IAnimation;
    private scrollTop!: IAnimation;

    constructor(
        public readonly from: ISmoothScrollPosition,
        public to: ISmoothScrollPosition,
        public readonly startTime: number,
        public readonly duration: number,
    ) {
        this.initAnimations();
    }

    public dispose(): void {
        this.animationFrameDisposable?.dispose();
        this.animationFrameDisposable = null;
    }

    public acceptScrollDimensions(state: ScrollState): void {
        this.to = state.withScrollPosition(this.to);
        this.initAnimations();
    }

    public tick(): SmoothScrollingUpdate {
        return this.tickAt(Date.now());
    }

    public combine(from: ISmoothScrollPosition, to: ISmoothScrollPosition, duration: number): SmoothScrollingOperation {
        return SmoothScrollingOperation.start(from, to, duration);
    }

    public static start(from: ISmoothScrollPosition, to: ISmoothScrollPosition, duration: number): SmoothScrollingOperation {
        return new SmoothScrollingOperation(from, to, Date.now() - 10, duration + 10);
    }

    private initAnimations(): void {
        this.scrollLeft = this.initAnimation(this.from.scrollLeft, this.to.scrollLeft, this.to.width);
        this.scrollTop = this.initAnimation(this.from.scrollTop, this.to.scrollTop, this.to.height);
    }

    private initAnimation(from: number, to: number, viewportSize: number): IAnimation {
        const delta = Math.abs(from - to);
        if (delta > 2.5 * viewportSize) {
            let stop1: number;
            let stop2: number;
            if (from < to) {
                stop1 = from + 0.75 * viewportSize;
                stop2 = to - 0.75 * viewportSize;
            }
            else {
                stop1 = from - 0.75 * viewportSize;
                stop2 = to + 0.75 * viewportSize;
            }

            return createComposed(createEaseOutCubic(from, stop1), createEaseOutCubic(stop2, to), 0.33);
        }

        return createEaseOutCubic(from, to);
    }

    private tickAt(now: number): SmoothScrollingUpdate {
        const completion = (now - this.startTime) / this.duration;
        if (completion < 1) {
            return new SmoothScrollingUpdate(this.scrollLeft(completion), this.scrollTop(completion), false);
        }

        return new SmoothScrollingUpdate(this.to.scrollLeft, this.to.scrollTop, true);
    }
}

function createEaseOutCubic(from: number, to: number): IAnimation {
    const delta = to - from;
    return completion => from + delta * easeOutCubic(completion);
}

function createComposed(a: IAnimation, b: IAnimation, cut: number): IAnimation {
    return completion => completion < cut
        ? a(completion / cut)
        : b((completion - cut) / (1 - cut));
}

function easeInCubic(value: number): number {
    return Math.pow(value, 3);
}

function easeOutCubic(value: number): number {
    return 1 - easeInCubic(1 - value);
}
