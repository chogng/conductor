import assert from "assert";

import { DisposableStore } from "src/cs/base/common/lifecycle";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { QuickAccessController } from "src/cs/platform/quickinput/browser/quickAccess";
import {
  QuickAccessExtensions,
  type IQuickAccessController,
  type IQuickAccessRegistry,
  type QuickAccessItem,
  type QuickAccessProvider,
} from "src/cs/platform/quickinput/common/quickAccess";
import {
  IQuickInputService,
  type IQuickInputService as IQuickInputServiceType,
  type QuickPickItem,
  type QuickPickOptions,
} from "src/cs/platform/quickinput/common/quickInput";
import { BrowserQuickInputService } from "src/cs/platform/quickinput/browser/quickInputService";

suite("base/test/browser/platform/quickInputService", () => {
  teardown(() => {
    document.querySelectorAll(".quick-input-overlay").forEach(element => element.remove());
  });

  test("renders all matching quick pick items", async () => {
    const instantiationService = new InstantiationService();
    const service = new BrowserQuickInputService(instantiationService);
    const items = Array.from({ length: 35 }, (_, index) => {
      const label = `Item ${index + 1}`;
      return {
        id: label,
        label,
      };
    });

    try {
      void service.pick({ items });
      await animationFrames(1);

      const renderedItems = document.querySelectorAll<HTMLElement>(".quick-input-item");
      assert.equal(renderedItems.length, 35);
      assert.equal(renderedItems[34]?.dataset.quickPickItemId, "Item 35");
    } finally {
      service.dispose();
      instantiationService.dispose();
    }
  });

  test("instantiates quick access providers on first use", async () => {
    const store = new DisposableStore();
    const registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);
    const pickedItems: QuickPickItem[][] = [];
    const providedFilters: string[] = [];
    let constructedProviders = 0;

    class TestQuickAccessProvider implements QuickAccessProvider {
      public constructor() {
        constructedProviders += 1;
      }

      public provide(filter: string): readonly QuickAccessItem[] {
        providedFilters.push(filter);
        return [{
          id: `test.${filter}`,
          label: filter,
        }];
      }
    }

    const quickInputService: IQuickInputServiceType = {
      _serviceBrand: undefined,
      quickAccess: { show: () => undefined } satisfies IQuickAccessController,
      pick: async <T extends QuickPickItem>(options: QuickPickOptions<T>): Promise<T | undefined> => {
        pickedItems.push([...options.items]);
        return undefined;
      },
    };
    const serviceCollection = new ServiceCollection([IQuickInputService, quickInputService]);
    const controllerInstantiationService = store.add(new InstantiationService(serviceCollection));

    store.add(registry.registerQuickAccessProvider({
      ctor: TestQuickAccessProvider,
      prefix: "lazy-test ",
      placeholder: "Lazy test",
    }));

    try {
      const controller = store.add(controllerInstantiationService.createInstance(QuickAccessController));

      assert.equal(constructedProviders, 0);

      controller.show("lazy-test alpha");
      await microtasks(2);
      controller.show("lazy-test beta");
      await microtasks(2);

      assert.equal(constructedProviders, 1);
      assert.deepEqual(providedFilters, ["alpha", "beta"]);
      assert.deepEqual(pickedItems.map(items => items[0]?.id), ["test.alpha", "test.beta"]);
    } finally {
      store.dispose();
    }
  });
});

const animationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

const microtasks = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};
