import type { IAction } from "src/cs/base/common/actions";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const INotificationService = createDecorator<INotificationService>("notificationService");

export const DEFAULT_NOTIFICATION_TOAST_ID = "workbench.notificationToast";

export type NotificationToastType = "success" | "error" | "warning" | "info";
export type NotificationToastPosition = "absolute" | "fixed";

export type NotificationToastOptions = {
  readonly actions?: readonly IAction[];
  readonly dataUi?: string;
  readonly duration?: number;
  readonly id?: string;
  readonly message: string;
  readonly onClose?: () => void;
  readonly position?: NotificationToastPosition;
  readonly type?: NotificationToastType;
};

export type NotificationToastEvent =
  | { readonly kind: "show"; readonly options: NotificationToastOptions }
  | { readonly kind: "hide"; readonly id?: string }
  | { readonly kind: "dispose"; readonly id?: string }
  | { readonly kind: "disposeAll" };

export interface INotificationService {
  readonly _serviceBrand: undefined;

  readonly toasts: readonly NotificationToastOptions[];
  readonly onDidChangeToast: Event<NotificationToastEvent>;

  showToast(options: NotificationToastOptions): void;
  hideToast(id?: string): void;
  disposeToast(id?: string): void;
  disposeToasts(): void;
}

export class NotificationService extends Disposable implements INotificationService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeToastEmitter = this._register(new Emitter<NotificationToastEvent>());
  private readonly toastOptions = new Map<string, NotificationToastOptions>();

  public get toasts(): readonly NotificationToastOptions[] {
    return [...this.toastOptions.values()];
  }

  public readonly onDidChangeToast = this.onDidChangeToastEmitter.event;

  public showToast(options: NotificationToastOptions): void {
    this.toastOptions.set(options.id ?? DEFAULT_NOTIFICATION_TOAST_ID, options);
    this.onDidChangeToastEmitter.fire({ kind: "show", options });
  }

  public hideToast(id?: string): void {
    this.toastOptions.delete(id ?? DEFAULT_NOTIFICATION_TOAST_ID);
    this.onDidChangeToastEmitter.fire({ kind: "hide", id });
  }

  public disposeToast(id?: string): void {
    this.toastOptions.delete(id ?? DEFAULT_NOTIFICATION_TOAST_ID);
    this.onDidChangeToastEmitter.fire({ kind: "dispose", id });
  }

  public disposeToasts(): void {
    this.toastOptions.clear();
    this.onDidChangeToastEmitter.fire({ kind: "disposeAll" });
  }
}

export const notificationService = new NotificationService();

registerSingleton(INotificationService, NotificationService, InstantiationType.Delayed);
