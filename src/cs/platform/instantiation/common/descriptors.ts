export class SyncDescriptor<T> {
  public readonly ctor: new (...args: any[]) => T;
  public readonly staticArguments: unknown[];
  public readonly supportsDelayedInstantiation: boolean;

  constructor(
    ctor: new (...args: any[]) => T,
    staticArguments: unknown[] = [],
    supportsDelayedInstantiation = false,
  ) {
    this.ctor = ctor;
    this.staticArguments = staticArguments;
    this.supportsDelayedInstantiation = supportsDelayedInstantiation;
  }
}

export interface SyncDescriptor0<T> {
  readonly ctor: new () => T;
}
