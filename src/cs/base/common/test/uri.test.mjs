import assert from "node:assert/strict";
import test from "node:test";

import { MarshalledId } from "../marshallingIds.ts";
import { URI } from "../uri.ts";
import {
  DefaultURITransformer,
  transformAndReviveIncomingURIs,
  transformOutgoingURIs,
} from "../uriIpc.ts";
import { createURITransformer } from "../uriTransformer.ts";

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

test("toJSON marks URI values for IPC revive", () => {
  const resource = URI.file("C:\\data\\sample.csv");
  const raw = JSON.parse(JSON.stringify({ resource }));

  assert.equal(raw.resource.$mid, MarshalledId.Uri);
  assert.equal(raw.resource.path, "/C:/data/sample.csv");

  const revived = transformAndReviveIncomingURIs(raw, DefaultURITransformer);
  assert.equal(revived.resource instanceof URI, true);
  assert.equal(revived.resource.fsPath, "C:\\data\\sample.csv");
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
  assert.equal(revived.resource.fsPath, "C:\\data\\sample.csv");
});
