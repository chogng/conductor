import { addDisposableListener, append, clearNode } from "src/cs/base/browser/dom";
import { ActionRunner, Separator, type IAction, type IActionRunner, type IRunEvent } from "src/cs/base/common/actions";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { ActionViewItem, type IActionViewItemOptions, type IActionViewItem } from "src/cs/base/browser/ui/actionbar/actionViewItem";

import "src/cs/base/browser/ui/actionbar/actionbar.css";

export const enum ActionsOrientation {
    HORIZONTAL,
    VERTICAL,
}

export type ActionBarContent = {
    readonly contentNode: HTMLElement;
    readonly disposable?: IDisposable;
};

export interface IActionViewItemProvider {
    (action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined;
}

export type ActionBarOptions = {
    readonly ariaLabel?: string;
    readonly actionViewItemProvider?: IActionViewItemProvider;
    readonly className?: string;
    readonly contentClassName?: string;
    readonly context?: unknown;
    readonly createContent?: (element: HTMLElement) => ActionBarContent;
    readonly orientation?: ActionsOrientation;
    readonly role?: string;
    readonly actionRunner?: IActionRunner;
};

export type ActionOptions = IActionViewItemOptions & {
    readonly index?: number;
};

export class ActionBar extends Disposable implements IActionRunner {
    protected readonly itemDisposables = this._register(new DisposableStore());
    protected readonly element: HTMLDivElement;
    protected readonly content: HTMLElement;

    private readonly viewItems: IActionViewItem[] = [];
    private readonly actionRunnerDisposables = this._register(new DisposableStore());
    private readonly actionViewItemProvider: IActionViewItemProvider | undefined;
    private context: unknown;
    private runner: IActionRunner;

    private readonly onDidRunEmitter = this._register(new Emitter<IRunEvent>());
    public readonly onDidRun = this.onDidRunEmitter.event;

    private readonly onWillRunEmitter = this._register(new Emitter<IRunEvent>());
    public readonly onWillRun = this.onWillRunEmitter.event;

    constructor(options: ActionBarOptions = {}) {
        super();
        this.actionViewItemProvider = options.actionViewItemProvider;
        this.context = options.context;
        this.runner = options.actionRunner ?? this._register(new ActionRunner());

        this.element = document.createElement("div");
        this.element.className = classNames(
            "ui-actionbar",
            options.orientation === ActionsOrientation.VERTICAL ? "ui-actionbar--vertical" : undefined,
            options.className,
        );

        const content = options.createContent?.(this.element);
        if (content) {
            this.content = content.contentNode;
            if (content.disposable) {
                this._register(content.disposable);
            }
        }
        else {
            this.content = document.createElement("div");
            this.element.append(this.content);
        }

        this.content.className = classNames("ui-actionbar__items", options.contentClassName, this.content.className);
        this.content.setAttribute("role", options.role ?? "toolbar");
        if (options.ariaLabel) {
            this.content.setAttribute("aria-label", options.ariaLabel);
        }

        this.installActionRunnerListeners();
    }

    public get domNode(): HTMLDivElement {
        return this.element;
    }

    public get actionRunner(): IActionRunner {
        return this.runner;
    }

    public set actionRunner(actionRunner: IActionRunner) {
        this.runner = actionRunner;
        this.installActionRunnerListeners();

        for (const item of this.viewItems) {
            item.actionRunner = actionRunner;
        }
    }

    public getContainer(): HTMLElement {
        return this.element;
    }

    public append(...children: Array<Node | string>): void {
        append(this.content, ...children);
    }

    public push(action: IAction | readonly IAction[], options: ActionOptions = {}): void {
        const actions = Array.isArray(action) ? action : [action];
        let index = typeof options.index === "number" ? options.index : undefined;

        for (const itemAction of actions) {
            if (itemAction.id === Separator.ID) {
                this.appendSeparator();
                continue;
            }

            const element = document.createElement("div");
            const item = this.itemDisposables.add(
                this.actionViewItemProvider?.(itemAction, options) ?? new ActionViewItem(this.context, itemAction, options),
            );
            item.actionRunner = this.runner;
            item.render(element);

            if (index === undefined || index < 0 || index >= this.content.children.length) {
                this.content.append(element);
                this.viewItems.push(item);
            }
            else {
                this.content.insertBefore(element, this.content.children[index]);
                this.viewItems.splice(index, 0, item);
                index += 1;
            }
        }
    }

    public appendSeparator(): HTMLElement {
        const separator = document.createElement("div");
        separator.className = "ui-actionbar__separator";
        separator.role = "separator";
        this.append(separator);
        return separator;
    }

    public clear(): void {
        this.itemDisposables.clear();
        this.viewItems.length = 0;
        clearNode(this.content);
    }

    public focus(index = 0): void {
        this.viewItems[index]?.focus();
    }

    public async run(action: IAction, context?: unknown): Promise<void> {
        await this.runner.run(action, context);
    }

    public override dispose(): void {
        this.clear();
        this.element.remove();
        super.dispose();
    }

    protected registerItem<T extends IDisposable>(item: T): T {
        return this.itemDisposables.add(item);
    }

    protected setContext(context: unknown): void {
        this.context = context;
        for (const item of this.viewItems) {
            item.setActionContext(context);
        }
    }

    protected addContentListener<K extends keyof HTMLElementEventMap>(
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
    ): IDisposable {
        return this._register(addDisposableListener(this.content, type, handler));
    }

    private installActionRunnerListeners(): void {
        this.actionRunnerDisposables.clear();
        this.actionRunnerDisposables.add(this.runner.onWillRun(event => this.onWillRunEmitter.fire(event)));
        this.actionRunnerDisposables.add(this.runner.onDidRun(event => this.onDidRunEmitter.fire(event)));
    }
}

export function prepareActions(actions: IAction[]): IAction[] {
    return Separator.clean(actions);
}

function classNames(...names: Array<string | undefined>): string {
    return names
        .flatMap(name => name?.split(/\s+/g) ?? [])
        .filter(Boolean)
        .join(" ");
}
