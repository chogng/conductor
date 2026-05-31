import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";

export const enum LifecyclePhase {
  Starting = 1,
  Ready = 2,
  Restored = 3,
  Eventually = 4,
}

export const ILifecycleService = createDecorator<ILifecycleService>("lifecycleService");

export interface ILifecycleService {
  readonly _serviceBrand: undefined;
  readonly phase: LifecyclePhase;
  readonly onDidShutdown: Event<void>;
  when(phase: LifecyclePhase): Promise<void>;
}

export class LifecycleService extends Disposable implements ILifecycleService {
  public declare readonly _serviceBrand: undefined;

  private currentPhase = LifecyclePhase.Starting;
  private readonly onDidShutdownEmitter = this._register(new Emitter<void>());
  private readonly pendingPhases = new Map<LifecyclePhase, Array<() => void>>();

  public readonly onDidShutdown = this.onDidShutdownEmitter.event;

  public get phase(): LifecyclePhase {
    return this.currentPhase;
  }

  public setPhase(phase: LifecyclePhase): void {
    if (phase <= this.currentPhase) {
      return;
    }

    this.currentPhase = phase;

    for (const [pendingPhase, callbacks] of Array.from(this.pendingPhases)) {
      if (pendingPhase <= phase) {
        this.pendingPhases.delete(pendingPhase);
        for (const callback of callbacks) {
          callback();
        }
      }
    }
  }

  public when(phase: LifecyclePhase): Promise<void> {
    if (this.currentPhase >= phase) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const callbacks = this.pendingPhases.get(phase) ?? [];
      callbacks.push(resolve);
      this.pendingPhases.set(phase, callbacks);
    });
  }

  public shutdown(): void {
    this.onDidShutdownEmitter.fire();
  }
}
