import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { IQuickAccessController } from "src/cs/platform/quickinput/common/quickAccess";

export const IQuickInputService = createDecorator<IQuickInputService>("quickInputService");

export interface QuickPickItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
}

export interface QuickPickOptions<T extends QuickPickItem> {
  readonly ariaLabel?: string;
  readonly emptyText?: string;
  readonly items: readonly T[];
  readonly placeholder?: string;
}

export interface IQuickInputService {
  readonly _serviceBrand: undefined;
  readonly quickAccess: IQuickAccessController;

  pick<T extends QuickPickItem>(options: QuickPickOptions<T>): Promise<T | undefined>;
}
