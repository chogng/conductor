import { Disposable } from "src/cs/base/common/lifecycle";
import {
  IContextKeyService,
  RawContextKey,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import { WebFileSystemAccess } from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  AuxiliaryBarVisibleContext,
  HasWebFileSystemAccess,
  SideBarVisibleContext,
} from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
  type WorkbenchMainPart,
} from "src/cs/workbench/services/layout/browser/layoutService";

export const ActiveWorkbenchViewContext = new RawContextKey<string>("activeWorkbenchView", "");
export const ActiveWorkbenchMainPartContext = new RawContextKey<WorkbenchMainPart | "">("activeWorkbenchMainPart", "");
export const ActiveAuxiliaryBarViewContext = new RawContextKey<string>("activeAuxiliaryBarView", "");

export class WorkbenchContextKeysHandler extends Disposable {
  constructor(
    @IContextKeyService contextKeyService: IContextKeyServiceType,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
  ) {
    super();

    HasWebFileSystemAccess
      .bindTo(contextKeyService)
      .set(WebFileSystemAccess.supported(globalThis));

    const sideBarVisibleContext = SideBarVisibleContext.bindTo(contextKeyService);
    const auxiliaryBarVisibleContext = AuxiliaryBarVisibleContext.bindTo(contextKeyService);
    const updatePartVisibilityContextKeys = (): void => {
      sideBarVisibleContext.set(layoutService.isVisible(Parts.SIDEBAR_PART));
      auxiliaryBarVisibleContext.set(layoutService.isVisible(Parts.AUXILIARYBAR_PART));
    };
    updatePartVisibilityContextKeys();
    this._register(layoutService.onDidChangePartVisibility(updatePartVisibilityContextKeys));
  }
}
