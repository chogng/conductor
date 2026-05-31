import { CancellationToken, CancellationTokenSource, DeferredPromise } from "src/cs/base/common/async";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { mainWindow } from "src/cs/base/browser/window";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ILifecycleService,
  LifecyclePhase,
  LifecyclePhaseToString,
  ShutdownReason,
  StartupKind,
  WillShutdownJoinerOrder,
  type BeforeShutdownErrorEvent,
  type BeforeShutdownEvent,
  type IWillShutdownEventJoiner,
  type WillShutdownEvent,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";

export class BrowserLifecycleService extends Disposable implements ILifecycleService {
  public declare readonly _serviceBrand: undefined;

  private currentPhase = LifecyclePhase.Starting;
  private readonly phaseWhen = new Map<LifecyclePhase, DeferredPromise<void>>();
  private readonly shutdownStore = this._register(new DisposableStore());
  private didShutdown = false;
  private didRunWillShutdown = false;
  private isShuttingDown = false;

  private readonly onBeforeShutdownEmitter = this._register(new Emitter<BeforeShutdownEvent>());
  private readonly onShutdownVetoEmitter = this._register(new Emitter<void>());
  private readonly onBeforeShutdownErrorEmitter = this._register(new Emitter<BeforeShutdownErrorEvent>());
  private readonly onWillShutdownEmitter = this._register(new Emitter<WillShutdownEvent>());
  private readonly onDidShutdownEmitter = this._register(new Emitter<void>());

  public readonly startupKind = this.resolveStartupKind();
  public readonly onBeforeShutdown = this.onBeforeShutdownEmitter.event;
  public readonly onShutdownVeto = this.onShutdownVetoEmitter.event;
  public readonly onBeforeShutdownError = this.onBeforeShutdownErrorEmitter.event;
  public readonly onWillShutdown = this.onWillShutdownEmitter.event;
  public readonly onDidShutdown = this.onDidShutdownEmitter.event;

  public constructor() {
    super();
    this.registerListeners();
  }

  public get phase(): LifecyclePhase {
    return this.currentPhase;
  }

  public set phase(value: LifecyclePhase) {
    if (value < this.currentPhase) {
      throw new Error("Lifecycle cannot go backwards.");
    }

    if (value === this.currentPhase) {
      return;
    }

    this.currentPhase = value;
    console.debug(`[lifecycle] phase changed (value: ${LifecyclePhaseToString(value)})`);

    for (const [phase, promise] of Array.from(this.phaseWhen)) {
      if (phase <= value) {
        promise.complete(undefined);
        this.phaseWhen.delete(phase);
      }
    }
  }

  public get willShutdown(): boolean {
    return this.isShuttingDown;
  }

  public async when(phase: LifecyclePhase): Promise<void> {
    if (phase <= this.currentPhase) {
      return;
    }

    let promise = this.phaseWhen.get(phase);
    if (!promise) {
      promise = new DeferredPromise<void>();
      this.phaseWhen.set(phase, promise);
    }

    await promise.p;
  }

  public async shutdown(): Promise<void> {
    if (this.didShutdown) {
      return;
    }

    const reason = ShutdownReason.Close;
    const veto = await this.handleBeforeShutdown(reason);
    if (veto) {
      this.onShutdownVetoEmitter.fire();
      return;
    }

    await this.handleWillShutdown(reason);
    this.didShutdown = true;
    this.onDidShutdownEmitter.fire();
  }

  private registerListeners(): void {
    this._register(addDisposableListener(mainWindow, EventType.BEFORE_UNLOAD, event => {
      if (this.didShutdown || !this.vetoBeforeUnload()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }));

    this._register(addDisposableListener(mainWindow, "pagehide", () => {
      void this.shutdown();
    }));
  }

  private resolveStartupKind(): StartupKind {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
      return StartupKind.NewWindow;
    }

    const timing = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return timing?.type === "reload" ? StartupKind.ReloadedWindow : StartupKind.NewWindow;
  }

  private async handleBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
    const vetos: Array<boolean | Promise<boolean>> = [];

    this.onBeforeShutdownEmitter.fire({
      reason,
      veto(value) {
        vetos.push(value);
      },
    });

    try {
      const results = await Promise.all(vetos.map(veto => Promise.resolve(veto)));
      return results.some(Boolean);
    }
    catch (error) {
      this.onBeforeShutdownErrorEmitter.fire({
        reason,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return true;
    }
  }

  private vetoBeforeUnload(): boolean {
    const vetos: Array<boolean | Promise<boolean>> = [];

    this.onBeforeShutdownEmitter.fire({
      reason: ShutdownReason.Close,
      veto(value) {
        vetos.push(value);
      },
    });

    const veto = vetos.some(value => value === true || value instanceof Promise);
    if (veto) {
      this.onShutdownVetoEmitter.fire();
    }

    return veto;
  }

  private async handleWillShutdown(reason: ShutdownReason): Promise<void> {
    if (this.didRunWillShutdown) {
      return;
    }

    this.didRunWillShutdown = true;
    this.isShuttingDown = true;

    const joiners: Promise<void>[] = [];
    const lastJoiners: Array<() => Promise<void>> = [];
    const pendingJoiners = new Set<IWillShutdownEventJoiner>();
    const cancellation = this.shutdownStore.add(new CancellationTokenSource());

    this.onWillShutdownEmitter.fire({
      reason,
      token: cancellation.token,
      joiners: () => Array.from(pendingJoiners),
      join: (promiseOrFn, joiner) => {
        pendingJoiners.add(joiner);

        if (joiner.order === WillShutdownJoinerOrder.Last) {
          const promiseFn = typeof promiseOrFn === "function" ? promiseOrFn : () => promiseOrFn;
          lastJoiners.push(() => promiseFn().finally(() => pendingJoiners.delete(joiner)));
          return;
        }

        const promise = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
        joiners.push(promise.finally(() => pendingJoiners.delete(joiner)));
      },
      force: () => cancellation.cancel(),
    });

    await this.settleJoiners(joiners, cancellation.token);
    await this.settleJoiners(lastJoiners.map(joiner => joiner()), cancellation.token);
    cancellation.dispose();
  }

  private async settleJoiners(joiners: Promise<void>[], token: CancellationToken): Promise<void> {
    if (joiners.length === 0 || token.isCancellationRequested) {
      return;
    }

    try {
      await Promise.allSettled(joiners);
    }
    catch {
      // Promise.allSettled does not reject; this guard keeps shutdown resilient if the host changes.
    }
  }
}

registerSingleton(ILifecycleService, BrowserLifecycleService, InstantiationType.Eager);
