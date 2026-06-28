import assert from "assert";

import {
  createFileDataTransferItem,
  createStringDataTransferItem,
  matchesMimeType,
  UriList,
  VSDataTransfer,
} from "src/cs/base/common/dataTransfer";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/dataTransfer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("stores multiple normalized mime entries", async () => {
    const dataTransfer = new VSDataTransfer();
    dataTransfer.append("Text/Plain", createStringDataTransferItem("alpha"));
    dataTransfer.append("text/plain", createStringDataTransferItem("beta"));

    assert.equal(dataTransfer.size, 1);
    assert.equal(dataTransfer.has("TEXT/PLAIN"), true);
    assert.equal(await dataTransfer.get("text/plain")?.asString(), "alpha");
    assert.deepEqual(
      Array.from(dataTransfer, ([mimeType, item]) => [mimeType, item.value]),
      [
        ["text/plain", "alpha"],
        ["text/plain", "beta"],
      ],
    );
  });

  test("matches wildcard mime types and files", () => {
    const dataTransfer = new VSDataTransfer();
    dataTransfer.append("image/png", createStringDataTransferItem("png"));

    assert.equal(dataTransfer.matches("image/*"), true);
    assert.equal(dataTransfer.matches("video/*"), false);
    assert.equal(matchesMimeType("*/*", ["text/plain"]), true);

    dataTransfer.append(
      "application/octet-stream",
      createFileDataTransferItem(
        "data.csv",
        URI.file("/tmp/data.csv"),
        async () => new Uint8Array([1, 2, 3]),
        {
          fileId: "file-data-csv",
          itemId: "item-data-csv",
          sheetId: "sheet-a",
          sheetName: "Sheet A",
        },
      ),
    );

    const file = dataTransfer.get("application/octet-stream")?.asFile();
    assert.equal(dataTransfer.matches("files"), true);
    assert.equal(file?.id, "file-data-csv");
    assert.equal(file?.sheetId, "sheet-a");
    assert.equal(file?.sheetName, "Sheet A");
    assert.equal(dataTransfer.get("application/octet-stream")?.id, "item-data-csv");
  });

  test("generates a file id when the caller does not provide one", () => {
    const item = createFileDataTransferItem(
      "workbook.xlsx",
      URI.file("/tmp/workbook.xlsx"),
      async () => new Uint8Array(),
      {
        sheetId: "0",
        sheetName: "Summary",
      },
    );

    const file = item.asFile();
    assert.ok(file?.id);
    assert.equal(file.sheetId, "0");
    assert.equal(file.sheetName, "Summary");
  });

  test("creates and parses uri lists", () => {
    const first = URI.file("/tmp/a.csv");
    const second = URI.file("/tmp/b.csv");
    const value = UriList.create([first, second, first]);

    assert.deepEqual(UriList.split(value), [first.toString(), second.toString()]);
    assert.deepEqual(UriList.parse(`# comment\r\n${value}`), [first.toString(), second.toString()]);
  });
});
