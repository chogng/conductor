import { Disposable } from "src/cs/base/common/lifecycle";
import {
  IContextKeyService,
  RawContextKey,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import { WebFileSystemAccess } from "src/cs/platform/files/browser/webFileSystemAccess";
import { HasWebFileSystemAccess } from "src/cs/workbench/common/contextkeys";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";

export const ActiveWorkbenchViewContext = new RawContextKey<string>("activeWorkbenchView", "");
export const ActiveWorkbenchMainPartContext = new RawContextKey<WorkbenchMainPart | "">("activeWorkbenchMainPart", "");
export const ActiveAuxiliaryBarViewContext = new RawContextKey<string>("activeAuxiliaryBarView", "");

export class WorkbenchContextKeysHandler extends Disposable {
  constructor(
    @IContextKeyService contextKeyService: IContextKeyServiceType,
  ) {
    super();

    HasWebFileSystemAccess
      .bindTo(contextKeyService)
      .set(WebFileSystemAccess.supported(globalThis));
  }
}
