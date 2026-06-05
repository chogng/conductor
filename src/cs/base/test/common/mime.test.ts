import assert from "assert";

import {
  getExtensionForMimeType,
  getMediaMime,
  getMediaOrTextMime,
  isTextStreamMime,
  normalizeMimeType,
} from "../../common/mime.ts";

suite("base/test/common/mime", () => {
  test("mime lookup resolves text and media extensions case-insensitively", () => {
    assert.equal(getMediaOrTextMime("data.CSV"), "text/csv");
    assert.equal(getMediaOrTextMime("image.PNG"), "image/png");
    assert.equal(getMediaMime("photo.jpeg"), "image/jpg");
    assert.equal(getMediaMime("unknown.bin"), undefined);
  });

  test("mime lookup returns a known extension for media aliases", () => {
    assert.ok([".jpe", ".jpeg", ".jpg"].includes(getExtensionForMimeType("image/jpeg") ?? ""));
    assert.equal(getExtensionForMimeType("image/png"), ".png");
    assert.equal(getExtensionForMimeType("unknown/type"), undefined);
  });

  test("normalizeMimeType lowercases type and subtype while preserving parameters", () => {
    assert.equal(normalizeMimeType("Text/Plain;Charset=UTF-8"), "text/plain;Charset=UTF-8");
    assert.equal(normalizeMimeType("invalid"), "invalid");
    assert.equal(normalizeMimeType("invalid", true), undefined);
  });

  test("isTextStreamMime recognizes notebook stream mime types", () => {
    assert.equal(isTextStreamMime("application/vnd.code.notebook.stdout"), true);
    assert.equal(isTextStreamMime("application/vnd.code.notebook.stderr"), true);
    assert.equal(isTextStreamMime("text/plain"), false);
  });
});
