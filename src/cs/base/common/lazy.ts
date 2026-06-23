/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const enum LazyValueState {
  Uninitialized,
  Running,
  Completed,
}

export class Lazy<T> {
  private state = LazyValueState.Uninitialized;
  private storedValue?: T;
  private storedError: Error | undefined;

  constructor(
    private readonly executor: () => T,
  ) {}

  public get hasValue(): boolean {
    return this.state === LazyValueState.Completed;
  }

  public get value(): T {
    if (this.state === LazyValueState.Uninitialized) {
      this.state = LazyValueState.Running;
      try {
        this.storedValue = this.executor();
      } catch (error) {
        this.storedError = error as Error;
      } finally {
        this.state = LazyValueState.Completed;
      }
    } else if (this.state === LazyValueState.Running) {
      throw new Error("Cannot read the value of a lazy that is being initialized");
    }

    if (this.storedError) {
      throw this.storedError;
    }

    return this.storedValue!;
  }

  public get rawValue(): T | undefined {
    return this.storedValue;
  }
}
