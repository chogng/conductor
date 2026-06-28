import { DeferredPromise } from "src/cs/base/common/async";
import { CancellationTokenSource } from "src/cs/base/common/cancellation";
import { Event } from "src/cs/base/common/event";
import { Disposable, DisposableStore, isDisposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { IContextKeyService, type IContextKeyService as IContextKeyServiceType } from "src/cs/platform/contextkey/common/contextkey";
import { IInstantiationService, type IInstantiationService as IInstantiationServiceType } from "src/cs/platform/instantiation/common/instantiation";
import { IQuickInputService, ItemActivation, type IQuickInputService as IQuickInputServiceType, type IQuickPick, type IQuickPickItem } from "src/cs/platform/quickinput/common/quickInput";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  DefaultQuickAccessFilterValue,
  QuickAccessExtensions,
  type IQuickAccessController,
  type IQuickAccessRegistry,
  type QuickAccessOptions,
  type QuickAccessProvider,
  type QuickAccessProviderDescriptor,
} from "src/cs/platform/quickinput/common/quickAccess";

export class QuickAccessController extends Disposable implements IQuickAccessController {
  private readonly registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);
  private readonly providers = new Map<QuickAccessProviderDescriptor, QuickAccessProvider>();
  private readonly lastAcceptedPickerValues = new Map<QuickAccessProviderDescriptor, string>();

  private visibleQuickAccess: {
    readonly picker: IQuickPick<IQuickPickItem, { useSeparators: true }>;
    readonly descriptor: QuickAccessProviderDescriptor | undefined;
    value: string;
  } | undefined = undefined;

  public constructor(
    @IQuickInputService private readonly quickInputService: IQuickInputServiceType,
    @IInstantiationService private readonly instantiationService: IInstantiationServiceType,
    @IContextKeyService private readonly contextKeyService: IContextKeyServiceType,
  ) {
    super();

    this._register(toDisposable(() => {
      for (const provider of this.providers.values()) {
        if (isDisposable(provider)) {
          provider.dispose();
        }
      }
      this.providers.clear();
      this.visibleQuickAccess?.picker.dispose();
    }));
  }

  public pick(value = "", options?: QuickAccessOptions): Promise<IQuickPickItem[] | undefined> {
    return this.doShowOrPick(value, true, options);
  }

  public show(value = "", options?: QuickAccessOptions): void {
    this.doShowOrPick(value, false, options);
  }

  private doShowOrPick(value: string, pick: true, options?: QuickAccessOptions): Promise<IQuickPickItem[] | undefined>;
  private doShowOrPick(value: string, pick: false, options?: QuickAccessOptions): void;
  private doShowOrPick(
    value: string,
    pick: boolean,
    options?: QuickAccessOptions,
  ): Promise<IQuickPickItem[] | undefined> | void {
    const [provider, descriptor] = this.getOrInstantiateProvider(value, options?.enabledProviderPrefixes);

    const visibleQuickAccess = this.visibleQuickAccess;
    const visibleDescriptor = visibleQuickAccess?.descriptor;
    if (visibleQuickAccess && descriptor && visibleDescriptor === descriptor) {
      if (value !== descriptor.prefix && !options?.preserveValue) {
        visibleQuickAccess.picker.value = value;
      }

      this.adjustValueSelection(visibleQuickAccess.picker, descriptor, options);
      return;
    }

    if (descriptor && !options?.preserveValue) {
      let newValue: string | undefined;

      if (visibleQuickAccess && visibleDescriptor && visibleDescriptor !== descriptor) {
        const filterWithoutPrefix = visibleQuickAccess.value.slice(visibleDescriptor.prefix.length);
        if (filterWithoutPrefix) {
          newValue = `${descriptor.prefix}${filterWithoutPrefix}`;
        }
      }

      if (!newValue) {
        const defaultFilterValue = provider?.defaultFilterValue;
        if (defaultFilterValue === DefaultQuickAccessFilterValue.LAST) {
          newValue = this.lastAcceptedPickerValues.get(descriptor);
        } else if (typeof defaultFilterValue === "string") {
          newValue = `${descriptor.prefix}${defaultFilterValue}`;
        }
      }

      if (typeof newValue === "string") {
        value = newValue;
      }
    }

    const visibleSelection = visibleQuickAccess?.picker.valueSelection;
    const visibleValue = visibleQuickAccess?.picker.value;
    const disposables = new DisposableStore();
    const picker = disposables.add(this.quickInputService.createQuickPick<IQuickPickItem>({ useSeparators: true }));
    picker.value = value;
    this.adjustValueSelection(picker, descriptor, options);
    picker.placeholder = options?.placeholder ?? descriptor?.placeholder;
    picker.quickNavigate = options?.quickNavigateConfiguration;
    picker.hideInput = !!picker.quickNavigate && !visibleQuickAccess;
    if (typeof options?.itemActivation === "number" || options?.quickNavigateConfiguration) {
      picker.itemActivation = options?.itemActivation ?? ItemActivation.SECOND;
    }
    picker.contextKey = descriptor?.contextKey;
    picker.filterValue = input => input.substring(descriptor ? descriptor.prefix.length : 0);

    let pickPromise: DeferredPromise<IQuickPickItem[]> | undefined;
    if (pick) {
      pickPromise = new DeferredPromise<IQuickPickItem[]>();
      disposables.add(Event.once(picker.onWillAccept)(event => {
        event.veto();
        picker.hide();
      }));
    }

    disposables.add(this.registerPickerListeners(picker, provider, descriptor, value, options));

    const cts = disposables.add(new CancellationTokenSource());
    if (provider) {
      disposables.add(provider.provide(picker, cts.token, options?.providerOptions));
    }

    Event.once(picker.onDidHide)(() => {
      if (picker.selectedItems.length === 0) {
        cts.cancel();
      }

      disposables.dispose();
      pickPromise?.complete(picker.selectedItems.slice(0));
    });

    picker.show();

    if (visibleSelection && visibleValue === value) {
      picker.valueSelection = visibleSelection;
    }

    if (pick) {
      return pickPromise!.promise;
    }
  }

  private adjustValueSelection(
    picker: IQuickPick<IQuickPickItem, { useSeparators: true }>,
    descriptor?: QuickAccessProviderDescriptor,
    options?: QuickAccessOptions,
  ): void {
    picker.valueSelection = options?.preserveValue
      ? [picker.value.length, picker.value.length]
      : [descriptor?.prefix.length ?? 0, picker.value.length];
  }

  private registerPickerListeners(
    picker: IQuickPick<IQuickPickItem, { useSeparators: true }>,
    provider: QuickAccessProvider | undefined,
    descriptor: QuickAccessProviderDescriptor | undefined,
    value: string,
    options?: QuickAccessOptions,
  ): IDisposable {
    const disposables = new DisposableStore();

    const visibleQuickAccess = this.visibleQuickAccess = { picker, descriptor, value };
    disposables.add(toDisposable(() => {
      if (visibleQuickAccess === this.visibleQuickAccess) {
        this.visibleQuickAccess = undefined;
      }
    }));

    disposables.add(picker.onDidChangeValue(inputValue => {
      const [providerForValue] = this.getOrInstantiateProvider(inputValue, options?.enabledProviderPrefixes);
      if (providerForValue !== provider) {
        this.show(inputValue, {
          enabledProviderPrefixes: options?.enabledProviderPrefixes,
          preserveValue: true,
          providerOptions: options?.providerOptions,
        });
      } else {
        visibleQuickAccess.value = inputValue;
      }
    }));

    if (descriptor) {
      disposables.add(picker.onDidAccept(() => {
        this.lastAcceptedPickerValues.set(descriptor, picker.value);
      }));
    }

    return disposables;
  }

  private getOrInstantiateProvider(
    value: string,
    enabledProviderPrefixes?: readonly string[],
  ): [QuickAccessProvider | undefined, QuickAccessProviderDescriptor | undefined] {
    const providerDescriptor = this.registry.getQuickAccessProvider(value, this.contextKeyService);
    if (!providerDescriptor || enabledProviderPrefixes && !enabledProviderPrefixes.includes(providerDescriptor.prefix)) {
      return [undefined, undefined];
    }

    let provider = this.providers.get(providerDescriptor);
    if (!provider) {
      provider = this.instantiationService.createInstance(providerDescriptor.ctor);
      this.providers.set(providerDescriptor, provider);
    }

    return [provider, providerDescriptor];
  }
}
