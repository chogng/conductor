/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";

export interface ISplice<T> {
  readonly deleteCount: number;
  readonly start: number;
  readonly toInsert: readonly T[];
}

export interface ISpliceable<T> {
  splice(start: number, deleteCount: number, toInsert: readonly T[]): void;
}

export interface ISequence<T> {
  readonly elements: T[];
  readonly onDidSplice: Event<ISplice<T>>;
}

export class Sequence<T> implements ISequence<T>, ISpliceable<T> {
  public readonly elements: T[] = [];
  private readonly onDidSpliceEmitter = new Emitter<ISplice<T>>();

  public readonly onDidSplice: Event<ISplice<T>> = this.onDidSpliceEmitter.event;

  public splice(start: number, deleteCount: number, toInsert: readonly T[] = []): void {
    this.elements.splice(start, deleteCount, ...toInsert);
    this.onDidSpliceEmitter.fire({ start, deleteCount, toInsert });
  }
}
