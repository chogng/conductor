import assert from "assert";

import { safeSetInnerHtml, sanitizeHtml, type DomSanitizerConfig } from "src/cs/base/browser/domSanitize";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/domSanitize", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("removes executable markup and unsafe resource protocols", () => {
    const root = document.createElement("div");
    safeSetInnerHtml(root, [
      `<p onclick="run()">Hello<script>window.bad = true</script></p>`,
      `<a href="javascript:alert(1)" target="_blank">bad link</a>`,
      `<a href="https://example.com/docs">good link</a>`,
      `<img src="data:text/html,<svg onload=alert(1)>">`,
    ].join(""));

    const links = root.querySelectorAll("a");
    const image = root.querySelector("img");

    assert.equal(root.querySelector("script"), null);
    assert.equal(root.querySelector("p")?.hasAttribute("onclick"), false);
    assert.equal(links[0]?.hasAttribute("href"), false);
    assert.equal(links[0]?.getAttribute("target"), "_blank");
    assert.equal(links[1]?.getAttribute("href"), "https://example.com/docs");
    assert.equal(image?.hasAttribute("src"), false);
  });

  test("applies separate relative-path policies for links and media", () => {
    const root = htmlToElement(sanitizeHtml([
      `<a href="#section">hash</a>`,
      `<a href="./local-doc">relative link</a>`,
      `<img src="./asset.png">`,
      `<img src="//example.com/asset.png">`,
    ].join(""), {
      allowRelativeMediaPaths: true,
    }));

    const links = root.querySelectorAll("a");
    const images = root.querySelectorAll("img");

    assert.equal(links[0]?.getAttribute("href"), "#section");
    assert.equal(links[1]?.hasAttribute("href"), false);
    assert.equal(images[0]?.getAttribute("src"), "./asset.png");
    assert.equal(images[1]?.hasAttribute("src"), false);
  });

  test("hardens link targets and tag-specific resource attributes", () => {
    const root = htmlToElement(sanitizeHtml([
      `<p href="https://example.com" src="https://example.com/image.png" target="_blank">text</p>`,
      `<a href="https://example.com" target="_blank">blank</a>`,
      `<a href="https://example.com" target="popup">popup</a>`,
      `<img href="https://example.com" src="https://example.com/image.png">`,
    ].join("")));

    const paragraph = root.querySelector("p");
    const links = root.querySelectorAll("a");
    const image = root.querySelector("img");

    assert.equal(paragraph?.hasAttribute("href"), false);
    assert.equal(paragraph?.hasAttribute("src"), false);
    assert.equal(paragraph?.hasAttribute("target"), false);
    assert.equal(links[0]?.getAttribute("target"), "_blank");
    assert.equal(links[0]?.getAttribute("rel"), "noopener noreferrer");
    assert.equal(links[1]?.hasAttribute("target"), false);
    assert.equal(image?.hasAttribute("href"), false);
    assert.equal(image?.getAttribute("src"), "https://example.com/image.png");
  });

  test("uses configured attribute predicates", () => {
    const root = document.createElement("div");
    const config: DomSanitizerConfig = {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: () => "approved",
          },
          {
            attributeName: "role",
            shouldKeep: (_node, data) => data.attrValue === "button",
          },
        ],
      },
      allowedTags: {
        override: ["span"],
      },
    };

    safeSetInnerHtml(root, `<span title="draft" role="link">A</span><span title="draft" role="button">B</span>`, config);

    const spans = root.querySelectorAll("span");
    assert.deepEqual(Array.from(spans).map(span => ({
      role: span.getAttribute("role"),
      title: span.getAttribute("title"),
      text: span.textContent,
    })), [
      { role: null, title: "approved", text: "A" },
      { role: "button", title: "approved", text: "B" },
    ]);
  });

  test("keeps sanitizer hooks isolated per call", () => {
    const config: DomSanitizerConfig = {
      allowedAttributes: {
        augment: [
          {
            attributeName: "title",
            shouldKeep: () => "first-call",
          },
        ],
      },
    };

    const first = htmlToElement(sanitizeHtml(`<span title="draft">A</span>`, config));
    const second = htmlToElement(sanitizeHtml(`<span title="draft">B</span>`));

    assert.equal(first.querySelector("span")?.getAttribute("title"), "first-call");
    assert.equal(second.querySelector("span")?.getAttribute("title"), "draft");
  });

  test("can preserve unsupported tags as plaintext", () => {
    const root = htmlToElement(sanitizeHtml(`<p><badge tone="good">Nice</badge></p>`, {
      allowedAttributes: {
        override: [],
      },
      allowedTags: {
        override: ["p"],
      },
      replaceWithPlaintext: true,
    }));

    assert.equal(root.textContent, `<badge tone="good">Nice</badge>`);
  });

  test("safeSetInnerHtml replaces existing children with sanitized content", () => {
    const root = document.createElement("div");
    root.appendChild(document.createElement("hr"));

    safeSetInnerHtml(root, `<p>fresh</p><script>alert(1)</script>`);

    assert.equal(root.children.length, 1);
    assert.equal(root.firstElementChild?.tagName, "P");
    assert.equal(root.textContent, "fresh");
  });
});

function htmlToElement(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}
