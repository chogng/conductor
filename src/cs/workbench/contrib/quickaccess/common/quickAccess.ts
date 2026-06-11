import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IQuickAccessService = createDecorator<IQuickAccessService>("quickAccessService");

export interface IQuickAccessService {
  readonly _serviceBrand: undefined;

  show(): void;
}
