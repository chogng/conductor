import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { AbstractPathService, IPathService } from "src/cs/workbench/services/path/common/pathService";

export class BrowserPathService extends AbstractPathService {
    constructor() {
        super(URI.file("/"), false);
    }
}

registerSingleton(IPathService, BrowserPathService, InstantiationType.Delayed);
