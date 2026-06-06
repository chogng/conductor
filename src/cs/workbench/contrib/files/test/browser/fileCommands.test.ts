import assert from "assert";

import { FileService } from "../../../../../platform/files/common/fileService.ts";
import {
  canImportFolderWithFileService,
  getFolderImportSupportForFileService,
} from "../../browser/fileCommands.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  test("folder import does not require browser folder picker for non-HTML file services", () => {
    const filesService = new FileService();

    assert.deepEqual(
      getFolderImportSupportForFileService(filesService),
      { reason: null, supported: true },
    );
    assert.equal(canImportFolderWithFileService(filesService), true);
  });
});
