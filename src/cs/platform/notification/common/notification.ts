import type { IAction } from "src/cs/base/common/actions";
import { Event } from "src/cs/base/common/event";
import BaseSeverity from "src/cs/base/common/severity";
import { localize } from "src/cs/nls";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const INotificationService = createDecorator<INotificationService>("notificationService");

export import Severity = BaseSeverity;

export type NotificationMessage = string | Error;

export const enum NotificationPriority {
  DEFAULT = 0,
  OPTIONAL = 1,
  SILENT = 2,
  URGENT = 3,
}

export type INotificationProperties = {
  readonly sticky?: boolean;
  readonly priority?: NotificationPriority;
  readonly neverShowAgain?: INeverShowAgainOptions;
  readonly presentation?: INotificationPresentationOptions;
};

export type NotificationPresentationType = "success" | "error" | "warning" | "info";
export type NotificationPresentationPosition = "absolute" | "fixed";

export type INotificationPresentationOptions = {
  readonly className?: string;
  readonly dataUi?: string;
  readonly duration?: number;
  readonly position?: NotificationPresentationPosition;
  readonly type?: NotificationPresentationType;
};

export const enum NeverShowAgainScope {
  WORKSPACE = 0,
  PROFILE = 1,
  APPLICATION = 2,
}

export type INeverShowAgainOptions = {
  readonly id: string;
  readonly isSecondary?: boolean;
  readonly scope?: NeverShowAgainScope;
};

export type INotificationSource = {
  readonly id: string;
  readonly label: string;
};

export function isNotificationSource(value: unknown): value is INotificationSource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<INotificationSource>;
  return typeof candidate.id === "string" && typeof candidate.label === "string";
}

export type INotification = INotificationProperties & {
  readonly id?: string;
  readonly severity: Severity;
  readonly message: NotificationMessage;
  readonly source?: string | INotificationSource;
  readonly actions?: INotificationActions;
  readonly progress?: INotificationProgressProperties;
};

export type INotificationActions = {
  readonly primary?: readonly IAction[];
  readonly secondary?: readonly IAction[];
};

export type INotificationProgressProperties = {
  readonly infinite?: boolean;
  readonly total?: number;
  readonly worked?: number;
};

export interface INotificationProgress {
  infinite(): void;
  total(value: number): void;
  worked(value: number): void;
  done(): void;
}

export interface INotificationHandle {
  readonly onDidClose: Event<void>;
  readonly onDidChangeVisibility: Event<boolean>;
  readonly progress: INotificationProgress;

  updateSeverity(severity: Severity): void;
  updateMessage(message: NotificationMessage): void;
  updateActions(actions?: INotificationActions): void;
  close(): void;
}

export interface IStatusHandle {
  close(): void;
}

type IBasePromptChoice = {
  readonly label: string;
  readonly keepOpen?: boolean;
  run(): void;
};

export type IPromptChoice = IBasePromptChoice & {
  readonly isSecondary?: boolean;
};

export type IPromptChoiceWithMenu = IPromptChoice & {
  readonly menu: readonly IBasePromptChoice[];
  readonly isSecondary: false | undefined;
};

export type IPromptOptions = INotificationProperties & {
  onCancel?: () => void;
};

export type IStatusMessageOptions = {
  readonly showAfter?: number;
  readonly hideAfter?: number;
};

export const enum NotificationsFilter {
  OFF = 0,
  ERROR = 1,
}

export type INotificationSourceFilter = INotificationSource & {
  readonly filter: NotificationsFilter;
};

export interface INotificationService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeFilter: Event<void>;

  setFilter(filter: NotificationsFilter | INotificationSourceFilter): void;
  getFilter(source?: INotificationSource): NotificationsFilter;
  getFilters(): INotificationSourceFilter[];
  removeFilter(sourceId: string): void;

  notify(notification: INotification): INotificationHandle;
  info(message: NotificationMessage | NotificationMessage[]): void;
  warn(message: NotificationMessage | NotificationMessage[]): void;
  error(message: NotificationMessage | NotificationMessage[]): void;
  prompt(
    severity: Severity,
    message: string,
    choices: readonly (IPromptChoice | IPromptChoiceWithMenu)[],
    options?: IPromptOptions,
  ): INotificationHandle;
  status(message: NotificationMessage, options?: IStatusMessageOptions): IStatusHandle;
}

export class NoOpNotification implements INotificationHandle {
  public readonly progress = new NoOpProgress();
  public readonly onDidClose = Event.None as Event<void>;
  public readonly onDidChangeVisibility = Event.None as Event<boolean>;

  public updateSeverity(): void {}
  public updateMessage(): void {}
  public updateActions(): void {}
  public close(): void {}
}

export class NoOpProgress implements INotificationProgress {
  public infinite(): void {}
  public done(): void {}
  public total(): void {}
  public worked(): void {}
}

export function withSeverityPrefix(label: string, severity: Severity): string {
  if (severity === Severity.Error) {
    return localize("severityPrefix.error", "Error: {label}", { label });
  }

  if (severity === Severity.Warning) {
    return localize("severityPrefix.warning", "Warning: {label}", { label });
  }

  return localize("severityPrefix.info", "Info: {label}", { label });
}
