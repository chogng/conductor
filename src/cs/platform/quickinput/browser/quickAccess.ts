import { Registry } from "src/cs/platform/registry/common/platform";
import { Disposable, isDisposable, toDisposable } from "src/cs/base/common/lifecycle";
import {
  QuickAccessExtensions,
  type IQuickAccessController,
  type IQuickAccessRegistry,
  type QuickAccessProviderDescriptor,
} from "src/cs/platform/quickinput/common/quickAccess";
import { IInstantiationService, type IInstantiationService as IInstantiationServiceType } from "src/cs/platform/instantiation/common/instantiation";
import { IQuickInputService, type IQuickInputService as IQuickInputServiceType } from "src/cs/platform/quickinput/common/quickInput";

type QuickAccessProviderInstance = InstanceType<QuickAccessProviderDescriptor["ctor"]>;

export class QuickAccessController extends Disposable implements IQuickAccessController {
  private readonly registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);
  private readonly providers = new Map<QuickAccessProviderDescriptor, QuickAccessProviderInstance>();

  public constructor(
    @IQuickInputService private readonly quickInputService: IQuickInputServiceType,
    @IInstantiationService private readonly instantiationService: IInstantiationServiceType,
  ) {
    super();

    this._register(toDisposable(() => {
      for (const provider of this.providers.values()) {
        if (isDisposable(provider)) {
          provider.dispose();
        }
      }
      this.providers.clear();
    }));
  }

  public show(value = ""): void {
    void this.doShow(value);
  }

  private async doShow(value: string): Promise<void> {
    const descriptor = this.registry.getQuickAccessProvider(value);
    if (!descriptor) {
      return;
    }

    const filter = value.startsWith(descriptor.prefix)
      ? value.slice(descriptor.prefix.length)
      : "";
    const provider = this.getOrCreateProvider(descriptor);
    const item = await this.quickInputService.pick({
      ariaLabel: descriptor.placeholder,
      items: await provider.provide(filter),
      placeholder: descriptor.placeholder,
    });
    await item?.accept?.();
  }

  private getOrCreateProvider(descriptor: QuickAccessProviderDescriptor): QuickAccessProviderInstance {
    const existing = this.providers.get(descriptor);
    if (existing) {
      return existing;
    }

    const provider = this.instantiationService.createInstance(descriptor.ctor);
    this.providers.set(descriptor, provider);
    return provider;
  }
}
