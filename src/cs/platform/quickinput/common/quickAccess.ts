import type { CancellationToken } from "src/cs/base/common/cancellation";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { ContextKeyExpression, IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import { Registry } from "src/cs/platform/registry/common/platform";
import type {
  IQuickNavigateConfiguration,
  IQuickPick,
  IQuickPickDidAcceptEvent,
  IQuickPickItem,
  IKeyMods,
  ItemActivation,
} from "src/cs/platform/quickinput/common/quickInput";

export interface QuickAccessProviderRunOptions {
  readonly from?: string;
  readonly placeholder?: string;
  readonly handleAccept?: (item: IQuickPickItem, isBackgroundAccept: boolean) => void;
}

export interface QuickAccessItem extends IQuickPickItem {
  accept?(keyMods?: IKeyMods, event?: IQuickPickDidAcceptEvent): void | Promise<void>;
}

export const enum DefaultQuickAccessFilterValue {
  PRESERVE = 0,
  LAST = 1,
}

export interface QuickAccessProvider {
  readonly defaultFilterValue?: string | DefaultQuickAccessFilterValue;

  provide(
    picker: IQuickPick<IQuickPickItem, { useSeparators: true }>,
    token: CancellationToken,
    options?: QuickAccessProviderRunOptions,
  ): IDisposable;
}

export interface QuickAccessProviderHelp {
  readonly prefix?: string;
  readonly description: string;
  readonly commandId?: string;
  readonly commandCenterOrder?: number;
  readonly commandCenterLabel?: string;
}

export type QuickAccessProviderDescriptor = {
  readonly ctor: new (...args: any[]) => QuickAccessProvider;
  readonly prefix: string;
  readonly placeholder?: string;
  readonly helpEntries?: readonly QuickAccessProviderHelp[];
  readonly contextKey?: string;
  readonly when?: ContextKeyExpression;
};

export interface QuickAccessOptions {
  readonly quickNavigateConfiguration?: IQuickNavigateConfiguration;
  readonly itemActivation?: ItemActivation;
  readonly preserveValue?: boolean;
  readonly providerOptions?: QuickAccessProviderRunOptions;
  readonly enabledProviderPrefixes?: readonly string[];
  readonly placeholder?: string;
}

export interface IQuickAccessController {
  show(value?: string, options?: QuickAccessOptions): void;
  pick(value?: string, options?: QuickAccessOptions): Promise<IQuickPickItem[] | undefined>;
}

export const QuickAccessExtensions = {
  QuickAccess: "platform.quickinput.quickAccess",
} as const;

export interface IQuickAccessRegistry {
  registerQuickAccessProvider(provider: QuickAccessProviderDescriptor): IDisposable;
  getQuickAccessProvider(value: string, contextKeyService?: IContextKeyService): QuickAccessProviderDescriptor | undefined;
  getQuickAccessProviders(contextKeyService?: IContextKeyService): QuickAccessProviderDescriptor[];
}

export class QuickAccessRegistry implements IQuickAccessRegistry {
  private defaultProvider: QuickAccessProviderDescriptor | undefined;
  private readonly providers: QuickAccessProviderDescriptor[] = [];

  public registerQuickAccessProvider(provider: QuickAccessProviderDescriptor): IDisposable {
    if (provider.prefix.length === 0) {
      this.defaultProvider = provider;
    } else {
      this.providers.push(provider);
    }

    this.providers.sort((first, second) => second.prefix.length - first.prefix.length);

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

  public getQuickAccessProvider(
    value: string,
    contextKeyService?: IContextKeyService,
  ): QuickAccessProviderDescriptor | undefined {
    const provider = value
      ? this.providers.find(candidate =>
        value.startsWith(candidate.prefix) && this.matchesWhen(candidate, contextKeyService))
      : undefined;
    return provider ?? (this.defaultProvider && this.matchesWhen(this.defaultProvider, contextKeyService)
      ? this.defaultProvider
      : undefined);
  }

  public getQuickAccessProviders(contextKeyService?: IContextKeyService): QuickAccessProviderDescriptor[] {
    return [
      ...(this.defaultProvider ? [this.defaultProvider] : []),
      ...this.providers,
    ].filter(provider => this.matchesWhen(provider, contextKeyService));
  }

  private matchesWhen(
    provider: QuickAccessProviderDescriptor,
    contextKeyService: IContextKeyService | undefined,
  ): boolean {
    return !provider.when || !!contextKeyService?.contextMatchesRules(provider.when);
  }
}

Registry.add(QuickAccessExtensions.QuickAccess, new QuickAccessRegistry());
