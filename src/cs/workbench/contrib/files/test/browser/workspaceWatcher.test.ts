import assert from "assert";

import { timeout } from "src/cs/base/common/async";
import { Emitter, type Event } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { FileChangeType, type IFileChange, type IFileService } from "src/cs/platform/files/common/files";
import { WorkspaceWatcher } from "src/cs/workbench/contrib/files/browser/workspaceWatcher";

suite("workbench/contrib/files/browser/workspaceWatcher", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("notifies for changes under the watched folder", async () => {
    const filesService = new TestFileService();
    const changedFolders: URI[] = [];
    const watcher = store.add(new WorkspaceWatcher(
      filesService,
      folder => changedFolders.push(folder),
      { changeReactDelay: 0 },
    ));
    const folder = URI.file("C:/workspace/data");

    watcher.watch(folder);
    filesService.fire([{
      resource: URI.file("C:/workspace/data/nested/A.csv"),
      type: FileChangeType.UPDATED,
    }]);
    await timeout(0);

    assert.deepEqual(changedFolders.map(folder => folder.fsPath.replace(/\\/g, "/")), [
      "C:/workspace/data",
    ]);
    assert.equal(watcher.isWatching(folder), true);
  });

  test("ignores changes outside the watched folder and after clear", async () => {
    const filesService = new TestFileService();
    let changeCount = 0;
    const watcher = store.add(new WorkspaceWatcher(
      filesService,
      () => changeCount += 1,
      { changeReactDelay: 0 },
    ));
    const folder = URI.file("C:/workspace/data");

    watcher.watch(folder);
    filesService.fire([{
      resource: URI.file("C:/workspace/other/A.csv"),
      type: FileChangeType.UPDATED,
    }]);
    await timeout(0);

    watcher.clear();
    filesService.fire([{
      resource: URI.file("C:/workspace/data/A.csv"),
      type: FileChangeType.UPDATED,
    }]);
    await timeout(0);

    assert.equal(changeCount, 0);
    assert.equal(watcher.isWatching(folder), false);
    assert.equal(filesService.disposedWatchCount, 1);
  });
});

class TestFileService implements Pick<IFileService, "onDidFilesChange" | "watch"> {
  private readonly filesChanged = new Emitter<readonly IFileChange[]>();
  public readonly onDidFilesChange: Event<readonly IFileChange[]> = this.filesChanged.event;
  public disposedWatchCount = 0;

  public watch(_resource: URI): IDisposable {
    return toDisposable(() => {
      this.disposedWatchCount += 1;
    });
  }

  public fire(changes: readonly IFileChange[]): void {
    this.filesChanged.fire(changes);
  }
}
