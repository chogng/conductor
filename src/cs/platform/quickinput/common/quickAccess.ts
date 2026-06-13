import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { Registry } from "src/cs/platform/registry/common/platform";
import type { QuickPickItem } from "src/cs/platform/quickinput/common/quickInput";

export interface QuickAccessItem extends QuickPickItem {
  accept?(): void | Promise<void>;
}

export interface QuickAccessProvider {
  provide(filter: string): readonly QuickAccessItem[] | Promise<readonly QuickAccessItem[]>;
}

export type QuickAccessProviderDescriptor = {
  readonly prefix: string;
  readonly placeholder?: string;
  readonly provider: QuickAccessProvider;
};

export interface QuickAccessOptions {
  readonly preserveValue?: boolean;
}

export interface IQuickAccessController {
  show(value?: string, options?: QuickAccessOptions): void;
}

export const QuickAccessExtensions = {
  QuickAccess: "platform.quickinput.quickAccess",
} as const;

export interface IQuickAccessRegistry {
  registerQuickAccessProvider(provider: QuickAccessProviderDescriptor): IDisposable;
  getQuickAccessProvider(value: string): QuickAccessProviderDescriptor | undefined;
  getQuickAccessProviders(): QuickAccessProviderDescriptor[];
}

export class QuickAccessRegistry implements IQuickAccessRegistry {
  private defaultProvider: QuickAccessProviderDescriptor | undefined;
  private readonly providers: QuickAccessProviderDescriptor[] = [];

  public registerQuickAccessProvider(provider: QuickAccessProviderDescriptor): IDisposable {
    if (provider.prefix.length === 0) {
      this.defaultProvider = provider;
    } else {
      this.providers.push(provider);
      this.providers.sort((first, second) => second.prefix.length - first.prefix.length);
    }

    return toDisposable(() => {
      if (this.defaultProvider === provider) {
        this.defaultProvider = undefined;
        return;
      }

      const index = this.providers.indexOf(provider);
      if (index >= 0) {
        this.providers.splice(index, 1);
      }
    });
  }

  public getQuickAccessProvider(value: string): QuickAccessProviderDescriptor | undefined {
    const provider = value
      ? this.providers.find(candidate => value.startsWith(candidate.prefix))
      : undefined;
    return provider ?? this.defaultProvider;
  }

  public getQuickAccessProviders(): QuickAccessProviderDescriptor[] {
    return [
      ...(this.defaultProvider ? [this.defaultProvider] : []),
      ...this.providers,
    ];
  }
}

Registry.add(QuickAccessExtensions.QuickAccess, new QuickAccessRegistry());
