import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { UriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentityService";

suite("platform/uriIdentity/common/UriIdentityService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("canonicalizes file URI paths and preserves caller fragments", () => {
    const service = store.add(new UriIdentityService());
    const first = URI.from({
      fragment: "first",
      path: "/workspace/data/../data/File.csv",
      scheme: "file",
    });
    const second = URI.from({
      fragment: "second",
      path: "/workspace/data/File.csv",
      scheme: "file",
    });

    const canonicalFirst = service.asCanonicalUri(first);
    const canonicalSecond = service.asCanonicalUri(second);

    assert.equal(canonicalFirst.path, "/workspace/data/File.csv");
    assert.equal(canonicalFirst.fragment, "first");
    assert.equal(canonicalSecond.path, canonicalFirst.path);
    assert.equal(canonicalSecond.fragment, "second");
  });

  test("keeps private non-file URI paths unchanged", () => {
    const service = store.add(new UriIdentityService());
    const resource = URI.from({
      path: "/workspace/data/../data/File.csv",
      scheme: "memory",
    });

    assert.equal(service.asCanonicalUri(resource).path, resource.path);
    assert.equal(service.extUri.isEqual(
      URI.from({ path: "/workspace/Data.csv", scheme: "memory" }),
      URI.from({ path: "/workspace/data.csv", scheme: "memory" }),
    ), false);
  });
});
