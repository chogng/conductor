import assert from "assert";

import { MarshalledId } from "../../common/marshallingIds.ts";
import { isWindows } from "../../common/platform.ts";
import { URI } from "../../common/uri.ts";
import {
  DefaultURITransformer,
  transformAndReviveIncomingURIs,
  transformOutgoingURIs,
} from "../../common/uriIpc.ts";
import { createURITransformer } from "../../common/uriTransformer.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/uri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("joinPath keeps file names as file-system paths", () => {
    const root = URI.file("C:\\Users\\lanxi\\Desktop\\293K");
    const resource = URI.joinPath(
      root,
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM].csv",
    );

    assert.equal(
      resource.path,
      "/C:/Users/lanxi/Desktop/293K/Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM].csv",
    );
    assert.match(resource.toString(), /%20/);
    assert.doesNotMatch(resource.fsPath, /%20/);
  });

  test("isUri recognizes URI instances and upstream URI shape", () => {
    const resource = URI.file("C:\\data\\sample.csv");
    const uriLike = {
      authority: resource.authority,
      fragment: resource.fragment,
      path: resource.path,
      query: resource.query,
      scheme: resource.scheme,
      fsPath: resource.fsPath,
      with: (change: Parameters<URI["with"]>[0]) => resource.with(change),
      toString: () => resource.toString(),
    };

    assert.equal(URI.isUri(resource), true);
    assert.equal(URI.isUri(uriLike), true);
    assert.equal(URI.isUri(resource.toJSON()), false);
  });

  test("toJSON marks URI values for IPC revive", () => {
    const resource = URI.file("C:\\data\\sample.csv");
    const raw = JSON.parse(JSON.stringify({ resource }));

    assert.equal(raw.resource.$mid, MarshalledId.Uri);
    assert.equal(raw.resource.path, "/C:/data/sample.csv");

    const revived = transformAndReviveIncomingURIs(raw, DefaultURITransformer);
    assert.equal(revived.resource instanceof URI, true);
    assert.equal(revived.resource.path, "/C:/data/sample.csv");
    assert.equal(
      revived.resource.fsPath,
      isWindows ? "C:\\data\\sample.csv" : "/C:/data/sample.csv",
    );
  });

  test("remote URI transformer maps file schemes like upstream", () => {
    const transformer = createURITransformer("remote-host");
    const payload = transformOutgoingURIs({ resource: URI.file("C:\\data\\sample.csv") }, transformer);

    assert.equal(payload.resource.scheme, "vscode-remote");
    assert.equal(payload.resource.authority, "remote-host");
    assert.equal(
      URI.revive(payload.resource).toString(),
      "vscode-remote://remote-host/C:/data/sample.csv",
    );

    const revived = transformAndReviveIncomingURIs(
      JSON.parse(JSON.stringify(payload)),
      transformer,
    );
    assert.equal(revived.resource.scheme, "file");
    assert.equal(revived.resource.path, "/C:/data/sample.csv");
    assert.equal(
      revived.resource.fsPath,
      isWindows ? "C:\\data\\sample.csv" : "/C:/data/sample.csv",
    );
  });
});
