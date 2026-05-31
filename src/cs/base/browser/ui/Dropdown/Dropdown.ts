import { addDisposableListener } from "src/cs/base/browser/dom";
import { Emitter } from "src/cs/base/common/event";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";

export type DropdownOptions = {
    anchor?: HTMLElement | null;
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    content?: HTMLElement | null;
    onDidChangeVisibility?: (visible: boolean) => void;
};

export class Dropdown implements IDisposable {
    private readonly disposables = new DisposableStore();
    private readonly visibilityEmitter = new Emitter<boolean>();
    private anchor: HTMLElement | null;
    private content: HTMLElement | null;
    private visible = false;
    private options: Required<Pick<DropdownOptions, "closeOnClickOutside" | "closeOnEscape">>;

    public readonly onDidChangeVisibility = this.visibilityEmitter.event;

    constructor(options: DropdownOptions = {}) {
        this.anchor = options.anchor ?? null;
        this.content = options.content ?? null;
        this.options = {
            closeOnClickOutside: options.closeOnClickOutside ?? true,
            closeOnEscape: options.closeOnEscape ?? true,
        };

        if (options.onDidChangeVisibility) {
            this.disposables.add(this.onDidChangeVisibility(options.onDidChangeVisibility));
        }
    }

    public setAnchor(anchor: HTMLElement | null): void {
        this.anchor = anchor;
    }

    public setContent(content: HTMLElement | null): void {
        this.content = content;
    }

    public updateOptions(options: Pick<DropdownOptions, "closeOnClickOutside" | "closeOnEscape">): void {
        this.options = {
            closeOnClickOutside: options.closeOnClickOutside ?? this.options.closeOnClickOutside,
            closeOnEscape: options.closeOnEscape ?? this.options.closeOnEscape,
        };

        if (this.visible) {
            this.installListeners();
        }
    }

    public show(): void {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.installListeners();
        this.visibilityEmitter.fire(true);
    }

    public hide(): void {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.disposables.clear();
        this.visibilityEmitter.fire(false);
    }

    public toggle(): void {
        if (this.visible) {
            this.hide();
            return;
        }

        this.show();
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public dispose(): void {
        this.hide();
        this.visibilityEmitter.dispose();
    }

    private installListeners(): void {
        this.disposables.clear();

        if (this.options.closeOnEscape) {
            this.disposables.add(addDisposableListener(document, "keydown", event => {
                if (event.key === "Escape") {
                    this.hide();
                }
            }));
        }

        if (this.options.closeOnClickOutside) {
            this.disposables.add(addDisposableListener(document, "mousedown", event => {
                const target = event.target;
                if (!(target instanceof Node)) {
                    return;
                }
                if (this.anchor?.contains(target)) {
                    return;
                }
                if (this.content?.contains(target)) {
                    return;
                }

                this.hide();
            }));
        }
    }
}

export default Dropdown;
