import { Disposable } from "src/cs/base/common/lifecycle";
import { IContextKeyService, type IContextKeyService as IContextKeyServiceType } from "src/cs/platform/contextkey/common/contextkey";
import { WebFileSystemAccess } from "src/cs/platform/files/browser/webFileSystemAccess";
import { HasWebFileSystemAccess } from "src/cs/workbench/common/contextkeys";

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
