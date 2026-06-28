import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Event } from "src/cs/base/common/event";
import type { CancellationToken } from "src/cs/base/common/cancellation";

export const enum LifecyclePhase {
  Starting = 1,
  Ready = 2,
  Restored = 3,
  Eventually = 4,
}

export function LifecyclePhaseToString(phase: LifecyclePhase): string {
  switch (phase) {
    case LifecyclePhase.Starting:
      return "Starting";
    case LifecyclePhase.Ready:
      return "Ready";
    case LifecyclePhase.Restored:
      return "Restored";
    case LifecyclePhase.Eventually:
      return "Eventually";
  }
}

export const enum ShutdownReason {
  Close = 1,
  Quit = 2,
  Reload = 3,
  Load = 4,
}

export const enum StartupKind {
  NewWindow = 1,
  ReloadedWindow = 3,
  ReopenedWindow = 4,
}

export interface BeforeShutdownEvent {
  readonly reason: ShutdownReason;
  veto(value: boolean | Promise<boolean>, id: string): void;
}

export interface BeforeShutdownErrorEvent {
  readonly reason: ShutdownReason;
  readonly error: Error;
}

export const enum WillShutdownJoinerOrder {
  Default = 1,
  Last = 2,
}

export interface IWillShutdownEventJoiner {
  readonly id: string;
  readonly label: string;
  readonly order?: WillShutdownJoinerOrder;
}

export interface WillShutdownEvent {
  readonly reason: ShutdownReason;
  readonly token: CancellationToken;
  join(promise: Promise<void>, joiner: IWillShutdownEventJoiner): void;
  join(promiseFn: () => Promise<void>, joiner: IWillShutdownEventJoiner & { readonly order: WillShutdownJoinerOrder.Last }): void;
  joiners(): IWillShutdownEventJoiner[];
  force(): void;
}

export const ILifecycleService = createDecorator<ILifecycleService>("lifecycleService");

export interface ILifecycleService {
  readonly _serviceBrand: undefined;
  readonly startupKind: StartupKind;
  phase: LifecyclePhase;
  readonly onBeforeShutdown: Event<BeforeShutdownEvent>;
  readonly onShutdownVeto: Event<void>;
  readonly onBeforeShutdownError: Event<BeforeShutdownErrorEvent>;
  readonly onWillShutdown: Event<WillShutdownEvent>;
  readonly willShutdown: boolean;
  readonly onDidShutdown: Event<void>;
  when(phase: LifecyclePhase): Promise<void>;
  shutdown(): Promise<void>;
}
