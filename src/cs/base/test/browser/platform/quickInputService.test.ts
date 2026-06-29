import assert from "assert";

import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { PickerQuickAccessProvider } from "src/cs/platform/quickinput/browser/pickerQuickAccess";
import { QuickAccessController } from "src/cs/platform/quickinput/browser/quickAccess";
import {
  QuickAccessExtensions,
  type IQuickAccessRegistry,
  type QuickAccessItem,
} from "src/cs/platform/quickinput/common/quickAccess";
import {
  IQuickInputService,
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
    const providedFilters: string[] = [];
    let constructedProviders = 0;

    class TestQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessItem> {
      public constructor() {
        super("lazy-test ");
        constructedProviders += 1;
      }

      protected getPicks(filter: string): readonly QuickAccessItem[] {
        providedFilters.push(filter);
        return [{
          id: `test.${filter}`,
          label: filter,
        }];
      }
    }

    const serviceCollection = new ServiceCollection();
    const controllerInstantiationService = store.add(new InstantiationService(serviceCollection));
    const quickInputService = store.add(new BrowserQuickInputService(controllerInstantiationService));
    const contextKeyService = store.add(new ContextKeyService());
    serviceCollection.set(IQuickInputService, quickInputService);
    serviceCollection.set(IContextKeyService, contextKeyService);

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
      assert.equal(
        document.querySelector<HTMLElement>(".quick-input-item")?.dataset.quickPickItemId,
        "test.beta",
      );
    } finally {
      store.dispose();
    }
  });

  test("keeps provider opened by accepted quick access item", async () => {
    const store = new DisposableStore();
    const registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);

    class DefaultTestQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessItem> {
      public constructor(
        @IQuickInputService private readonly quickInputService: IQuickInputService,
      ) {
        super();
      }

      protected getPicks(): readonly QuickAccessItem[] {
        return [{
          accept: () => this.quickInputService.quickAccess.show("command-test "),
          id: "test.gotoCommands",
          label: "Go to Commands",
        }];
      }
    }

    class CommandTestQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessItem> {
      public constructor() {
        super("command-test ");
      }

      protected getPicks(): readonly QuickAccessItem[] {
        return [{
          id: "test.command",
          label: "Command",
        }];
      }
    }

    const serviceCollection = new ServiceCollection();
    const controllerInstantiationService = store.add(new InstantiationService(serviceCollection));
    const quickInputService = store.add(new BrowserQuickInputService(controllerInstantiationService));
    const contextKeyService = store.add(new ContextKeyService());
    serviceCollection.set(IQuickInputService, quickInputService);
    serviceCollection.set(IContextKeyService, contextKeyService);

    store.add(registry.registerQuickAccessProvider({
      ctor: DefaultTestQuickAccessProvider,
      prefix: "",
      placeholder: "Search",
    }));
    store.add(registry.registerQuickAccessProvider({
      ctor: CommandTestQuickAccessProvider,
      prefix: "command-test ",
      placeholder: "Search commands",
    }));

    try {
      const controller = store.add(controllerInstantiationService.createInstance(QuickAccessController));

      controller.show("");
      await microtasks(2);
      const commandItem = document.querySelector<HTMLElement>("[data-quick-pick-item-id='test.gotoCommands']");
      commandItem?.dispatchEvent(new MouseEvent("mouseenter"));
      assert.equal(
        document.querySelector<HTMLElement>("[data-quick-pick-item-id='test.gotoCommands']"),
        commandItem,
      );

      commandItem?.click();
      await microtasks(2);

      assert.equal(
        document.querySelector<HTMLInputElement>(".quick-input-panel .inputbox_native")?.value,
        "command-test ",
      );
      assert.equal(
        document.querySelector<HTMLElement>(".quick-input-item")?.dataset.quickPickItemId,
        "test.command",
      );
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
