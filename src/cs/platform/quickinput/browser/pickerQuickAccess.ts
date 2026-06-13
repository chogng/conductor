import type {
  QuickAccessItem,
  QuickAccessProvider,
} from "src/cs/platform/quickinput/common/quickAccess";

export abstract class PickerQuickAccessProvider<T extends QuickAccessItem = QuickAccessItem>
  implements QuickAccessProvider {

  public provide(filter: string): readonly T[] | Promise<readonly T[]> {
    return this.getPicks(filter.trim());
  }

  protected abstract getPicks(filter: string): readonly T[] | Promise<readonly T[]>;
}
