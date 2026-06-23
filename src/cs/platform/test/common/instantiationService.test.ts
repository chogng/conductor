/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";

interface IDelayedTestService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeValue: Event<string>;

  getValue(): string;
  fireValue(value: string): void;
}

const IDelayedTestService = createDecorator<IDelayedTestService>("delayedTestService");

class DelayedTestService extends Disposable implements IDelayedTestService {
  public static constructionCount = 0;

  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeValueEmitter = this._register(new Emitter<string>());
  public readonly onDidChangeValue = this.onDidChangeValueEmitter.event;

  public constructor() {
    super();
    DelayedTestService.constructionCount++;
  }

  public getValue(): string {
    return "ready";
  }

  public fireValue(value: string): void {
    this.onDidChangeValueEmitter.fire(value);
  }
}

class DelayedServiceConsumer {
  public constructor(
    @IDelayedTestService private readonly delayedTestService: IDelayedTestService,
  ) {}

  public getValue(): string {
    return this.delayedTestService.getValue();
  }

  public onDidChangeValue(listener: (value: string) => void) {
    return this.delayedTestService.onDidChangeValue(listener);
  }

  public fireValue(value: string): void {
    this.delayedTestService.fireValue(value);
  }
}

suite("platform/instantiation/common/InstantiationService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  setup(() => {
    DelayedTestService.constructionCount = 0;
  });

  test("does not construct delayed services during constructor injection", () => {
    const instantiationService = store.add(createTestInstantiationService());
    const consumer = instantiationService.createInstance(DelayedServiceConsumer);

    assert.equal(DelayedTestService.constructionCount, 0);
    assert.equal(consumer.getValue(), "ready");
    assert.equal(DelayedTestService.constructionCount, 1);
    assert.equal(consumer.getValue(), "ready");
    assert.equal(DelayedTestService.constructionCount, 1);
  });

  test("keeps early event subscriptions without forcing construction", () => {
    const instantiationService = store.add(createTestInstantiationService());
    const consumer = instantiationService.createInstance(DelayedServiceConsumer);
    const values: string[] = [];

    store.add(consumer.onDidChangeValue(value => values.push(value)));

    assert.equal(DelayedTestService.constructionCount, 0);

    assert.equal(consumer.getValue(), "ready");
    consumer.fireValue("changed");

    assert.deepEqual(values, ["changed"]);
    assert.equal(DelayedTestService.constructionCount, 1);
  });
});

const createTestInstantiationService = (): InstantiationService =>
  new InstantiationService(new ServiceCollection([
    IDelayedTestService,
    new SyncDescriptor(DelayedTestService, [], true),
  ]));
