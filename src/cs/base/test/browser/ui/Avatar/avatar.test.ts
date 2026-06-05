import assert from "assert";

import {
  getAvatarClassName,
  getAvatarContentClassName,
  getAvatarDataAttributes,
  getAvatarIconClassName,
  getAvatarMode,
} from "../../../../browser/ui/Avatar/Avatar.ts";

suite("base/test/browser/ui/Avatar/avatar", () => {
  test("avatar helpers resolve class names and mode", () => {
    assert.equal(getAvatarClassName(), "avatar");
    assert.equal(
      getAvatarClassName({ className: "extra", src: "avatar.png", variant: "empty" }),
      "avatar avatar--empty avatar--image extra",
    );
    assert.equal(getAvatarContentClassName(), "avatar__content");
    assert.equal(getAvatarIconClassName(), "avatar__icon");
  });

  test("getAvatarMode follows explicit mode, image, fallback and icon order", () => {
    assert.equal(getAvatarMode({ mode: "fallback", src: "avatar.png", fallback: "A" }), "fallback");
    assert.equal(getAvatarMode({ src: "avatar.png" }), "image");
    assert.equal(getAvatarMode({ fallback: "A" }), "fallback");
    assert.equal(getAvatarMode({}), "icon");
  });

  test("getAvatarDataAttributes exposes resolved mode", () => {
    assert.deepEqual(getAvatarDataAttributes({ src: "avatar.png" }), {
      "data-mode": "image",
    });
  });
});
