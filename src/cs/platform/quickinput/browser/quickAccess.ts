import { Registry } from "src/cs/platform/registry/common/platform";
import {
  QuickAccessExtensions,
  type IQuickAccessController,
  type IQuickAccessRegistry,
  type QuickAccessOptions,
} from "src/cs/platform/quickinput/common/quickAccess";
import type { IQuickInputService } from "src/cs/platform/quickinput/common/quickInput";

export class QuickAccessController implements IQuickAccessController {
  private readonly registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);

  public constructor(
    private readonly quickInputService: IQuickInputService,
  ) {}

  public show(value = "", _options?: QuickAccessOptions): void {
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
    const item = await this.quickInputService.pick({
      ariaLabel: descriptor.placeholder,
      items: await descriptor.provider.provide(filter),
      placeholder: descriptor.placeholder,
    });
    await item?.accept?.();
  }
}
