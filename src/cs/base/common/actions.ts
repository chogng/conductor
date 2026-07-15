import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { LxIcon } from "src/cs/base/common/lxicon";

export interface ITelemetryData {
    readonly from?: string;
    readonly target?: string;
    readonly [key: string]: unknown;
}

export interface IAction {
    readonly id: string;
    label: string;
    tooltip: string;
    class: string | undefined;
    enabled: boolean;
    checked?: boolean;
    icon?: LxIcon;
    run(...args: unknown[]): unknown;
}

export interface IActionRunner extends IDisposable {
    readonly onDidRun: Event<IRunEvent>;
    readonly onWillRun: Event<IRunEvent>;

    run(action: IAction, context?: unknown): unknown;
}

export interface IActionChangeEvent {
    readonly label?: string;
    readonly tooltip?: string;
    readonly class?: string;
    readonly enabled?: boolean;
    readonly checked?: boolean;
    readonly icon?: LxIcon;
}

export class Action extends Disposable implements IAction {
    protected readonly onDidChangeEmitter = this._register(new Emitter<IActionChangeEvent>());

    public readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly actionCallback?: (event?: unknown, data?: ITelemetryData) => unknown;
    protected readonly actionId: string;
    protected actionLabel: string;
    protected actionTooltip: string | undefined;
    protected actionClass: string | undefined;
    protected actionEnabled: boolean;
    protected actionChecked: boolean | undefined;
    protected actionIcon: LxIcon | undefined;

    constructor(
        id: string,
        label = "",
        cssClass = "",
        enabled = true,
        actionCallback?: (event?: unknown, data?: ITelemetryData) => unknown,
    ) {
        super();
        this.actionId = id;
        this.actionLabel = label;
        this.actionClass = cssClass;
        this.actionEnabled = enabled;
        this.actionCallback = actionCallback;
    }

    public get id(): string {
        return this.actionId;
    }

    public get label(): string {
        return this.actionLabel;
    }

    public set label(value: string) {
        if (this.actionLabel !== value) {
            this.actionLabel = value;
            this.onDidChangeEmitter.fire({ label: value });
        }
    }

    public get tooltip(): string {
        return this.actionTooltip ?? "";
    }

    public set tooltip(value: string) {
        if (this.actionTooltip !== value) {
            this.actionTooltip = value;
            this.onDidChangeEmitter.fire({ tooltip: value });
        }
    }

    public get class(): string | undefined {
        return this.actionClass;
    }

    public set class(value: string | undefined) {
        if (this.actionClass !== value) {
            this.actionClass = value;
            this.onDidChangeEmitter.fire({ class: value });
        }
    }

    public get enabled(): boolean {
        return this.actionEnabled;
    }

    public set enabled(value: boolean) {
        if (this.actionEnabled !== value) {
            this.actionEnabled = value;
            this.onDidChangeEmitter.fire({ enabled: value });
        }
    }

    public get checked(): boolean | undefined {
        return this.actionChecked;
    }

    public set checked(value: boolean | undefined) {
        if (this.actionChecked !== value) {
            this.actionChecked = value;
            this.onDidChangeEmitter.fire({ checked: value });
        }
    }

    public get icon(): LxIcon | undefined {
        return this.actionIcon;
    }

    public set icon(value: LxIcon | undefined) {
        if (this.actionIcon !== value) {
            this.actionIcon = value;
            this.onDidChangeEmitter.fire({ icon: value });
        }
    }

    public async run(event?: unknown, data?: ITelemetryData): Promise<void> {
        if (this.actionCallback) {
            await this.actionCallback(event, data);
        }
    }
}

export interface IRunEvent {
    readonly action: IAction;
    readonly error?: unknown;
}

export class ActionRunner extends Disposable implements IActionRunner {
    private readonly onWillRunEmitter = this._register(new Emitter<IRunEvent>());
    private readonly onDidRunEmitter = this._register(new Emitter<IRunEvent>());

    public readonly onWillRun = this.onWillRunEmitter.event;
    public readonly onDidRun = this.onDidRunEmitter.event;

    public async run(action: IAction, context?: unknown): Promise<void> {
        if (!action.enabled) {
            return;
        }

        this.onWillRunEmitter.fire({ action });

        let error: unknown;
        try {
            await this.runAction(action, context);
        }
        catch (caughtError) {
            error = caughtError;
        }

        this.onDidRunEmitter.fire({ action, error });

        if (error) {
            throw error;
        }
    }

    protected async runAction(action: IAction, context?: unknown): Promise<void> {
        await action.run(context);
    }
}

export class Separator implements IAction {
    public static readonly ID = "base.actions.separator";

    public static join(...actionLists: readonly IAction[][]): IAction[] {
        let result: IAction[] = [];

        for (const list of actionLists) {
            if (!list.length) {
                continue;
            }

            result = result.length ? [...result, new Separator(), ...list] : [...list];
        }

        return result;
    }

    public static clean(actions: IAction[]): IAction[] {
        while (actions.length > 0 && actions[0].id === Separator.ID) {
            actions.shift();
        }

        while (actions.length > 0 && actions[actions.length - 1].id === Separator.ID) {
            actions.pop();
        }

        for (let index = actions.length - 2; index >= 0; index -= 1) {
            if (actions[index].id === Separator.ID && actions[index + 1].id === Separator.ID) {
                actions.splice(index + 1, 1);
            }
        }

        return actions;
    }

    public readonly id = Separator.ID;
    public readonly label = "";
    public readonly tooltip = "";
    public readonly class = "separator";
    public readonly enabled = false;
    public readonly checked = undefined;

    public async run(): Promise<void> {}
}

export class SubmenuAction implements IAction {
    public readonly tooltip = "";
    public readonly enabled = true;
    public readonly checked = undefined;
    public readonly class: string | undefined;

    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly actions: readonly IAction[],
        cssClass: string | undefined = undefined,
    ) {
        this.class = cssClass;
    }

    public async run(): Promise<void> {}
}

export class EmptySubmenuAction extends Action {
    public static readonly ID = "base.actions.empty";

    constructor() {
        super(EmptySubmenuAction.ID, "(empty)", undefined, false);
    }
}

export function toAction(options: {
    id: string;
    label?: string;
    tooltip?: string;
    class?: string;
    enabled?: boolean;
    checked?: boolean;
    icon?: LxIcon;
    run: (...args: unknown[]) => unknown;
}): IAction {
    return {
        id: options.id,
        label: options.label ?? "",
        tooltip: options.tooltip ?? "",
        class: options.class,
        enabled: options.enabled ?? true,
        checked: options.checked,
        icon: options.icon,
        run: options.run,
    };
}
