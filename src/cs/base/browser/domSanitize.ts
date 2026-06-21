/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from "src/cs/base/browser/dom";
import { Schemas } from "src/cs/base/common/network";

import dompurify, * as DomPurifyTypes from "./dompurify/dompurify.js";

export const basicMarkupHtmlTags = Object.freeze([
  "a",
  "abbr",
  "b",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "label",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "source",
  "span",
  "strike",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "tt",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

export const defaultAllowedAttrs = Object.freeze([
  "href",
  "target",
  "src",
  "alt",
  "title",
  "for",
  "name",
  "role",
  "tabindex",
  "x-dispatch",
  "required",
  "checked",
  "placeholder",
  "type",
  "start",
  "width",
  "height",
  "align",
]);

const fakeRelativeUrlProtocol = "conductor-relative-path";

interface AllowedLinksConfig {
  readonly override: readonly string[] | "*";
  readonly allowRelativePaths: boolean;
}

function validateLink(value: string, allowedProtocols: AllowedLinksConfig): boolean {
  if (allowedProtocols.override === "*") {
    return true;
  }

  try {
    const url = new URL(value, `${fakeRelativeUrlProtocol}://`);
    if (allowedProtocols.override.includes(url.protocol.replace(/:$/, ""))) {
      return true;
    }

    if (
      allowedProtocols.allowRelativePaths &&
      url.protocol === `${fakeRelativeUrlProtocol}:` &&
      !value.trim().toLowerCase().startsWith(fakeRelativeUrlProtocol)
    ) {
      return true;
    }

    return false;
  }
  catch {
    return false;
  }
}

function hookDomPurifyHrefAndSrcSanitizer(
  allowedLinkProtocols: AllowedLinksConfig,
  allowedMediaProtocols: AllowedLinksConfig,
): void {
  dompurify.addHook("afterSanitizeAttributes", node => {
    for (const attr of ["href", "src"]) {
      if (!node.hasAttribute(attr)) {
        continue;
      }

      const attrValue = node.getAttribute(attr) as string;
      if (attr === "href") {
        if (!attrValue.startsWith("#") && !validateLink(attrValue, allowedLinkProtocols)) {
          node.removeAttribute(attr);
        }
      }
      else if (!validateLink(attrValue, allowedMediaProtocols)) {
        node.removeAttribute(attr);
      }
    }
  });
}

export type SanitizeAttributePredicate = (
  node: Element,
  data: { readonly attrName: string; readonly attrValue: string },
) => boolean | string;

export interface SanitizeAttributeRule {
  readonly attributeName: string;
  shouldKeep: SanitizeAttributePredicate;
}

export interface DomSanitizerConfig {
  readonly allowedTags?: {
    readonly override?: readonly string[];
    readonly augment?: readonly string[];
  };

  readonly allowedAttributes?: {
    readonly override?: ReadonlyArray<string | SanitizeAttributeRule>;
    readonly augment?: ReadonlyArray<string | SanitizeAttributeRule>;
  };

  readonly allowedLinkProtocols?: {
    readonly override?: readonly string[] | "*";
  };

  readonly allowRelativeLinkPaths?: boolean;

  readonly allowedMediaProtocols?: {
    readonly override?: readonly string[] | "*";
  };

  readonly allowRelativeMediaPaths?: boolean;

  readonly replaceWithPlaintext?: boolean;
}

export type SanitizedHtml = string;

const defaultDomPurifyConfig = Object.freeze({
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: true,
  ALLOWED_ATTR: [...defaultAllowedAttrs],
  ALLOWED_TAGS: [...basicMarkupHtmlTags],
} satisfies DomPurifyTypes.Config);

export function sanitizeHtml(untrusted: string, config?: DomSanitizerConfig): SanitizedHtml {
  return doSanitizeHtml(untrusted, config, "html");
}

function doSanitizeHtml(untrusted: string, config: DomSanitizerConfig | undefined, outputType: "dom"): DocumentFragment;
function doSanitizeHtml(untrusted: string, config: DomSanitizerConfig | undefined, outputType: "html"): SanitizedHtml;
function doSanitizeHtml(
  untrusted: string,
  config: DomSanitizerConfig | undefined,
  outputType: "dom" | "html",
): SanitizedHtml | DocumentFragment {
  try {
    const resolvedConfig: DomPurifyTypes.Config = { ...defaultDomPurifyConfig };

    if (config?.allowedTags?.override) {
      resolvedConfig.ALLOWED_TAGS = [...config.allowedTags.override];
    }
    if (config?.allowedTags?.augment) {
      resolvedConfig.ALLOWED_TAGS = [...(resolvedConfig.ALLOWED_TAGS ?? []), ...config.allowedTags.augment];
    }

    let resolvedAttributes: Array<string | SanitizeAttributeRule> = [...defaultAllowedAttrs];
    if (config?.allowedAttributes?.override) {
      resolvedAttributes = [...config.allowedAttributes.override];
    }
    if (config?.allowedAttributes?.augment) {
      resolvedAttributes = [...resolvedAttributes, ...config.allowedAttributes.augment];
    }

    resolvedAttributes = resolvedAttributes.map((attr): string | SanitizeAttributeRule => {
      if (typeof attr === "string") {
        return attr.toLowerCase();
      }

      return {
        attributeName: attr.attributeName.toLowerCase(),
        shouldKeep: attr.shouldKeep,
      };
    });

    const allowedAttrNames = new Set(resolvedAttributes.map(attr => typeof attr === "string" ? attr : attr.attributeName));
    const allowedAttrPredicates = new Map<string, SanitizeAttributeRule>();
    for (const attr of resolvedAttributes) {
      if (typeof attr === "string") {
        allowedAttrPredicates.delete(attr);
      }
      else {
        allowedAttrPredicates.set(attr.attributeName, attr);
      }
    }

    resolvedConfig.ALLOWED_ATTR = Array.from(allowedAttrNames);

    hookDomPurifyHrefAndSrcSanitizer(
      {
        allowRelativePaths: config?.allowRelativeLinkPaths ?? false,
        override: config?.allowedLinkProtocols?.override ?? [Schemas.http, Schemas.https],
      },
      {
        allowRelativePaths: config?.allowRelativeMediaPaths ?? false,
        override: config?.allowedMediaProtocols?.override ?? [Schemas.http, Schemas.https],
      },
    );

    if (config?.replaceWithPlaintext) {
      dompurify.addHook("uponSanitizeElement", replaceWithPlainTextHook);
    }

    if (allowedAttrPredicates.size) {
      dompurify.addHook("uponSanitizeAttribute", (node, e) => {
        const predicate = allowedAttrPredicates.get(e.attrName);
        if (predicate) {
          const result = predicate.shouldKeep(node, e);
          if (typeof result === "string") {
            e.keepAttr = true;
            e.attrValue = result;
          }
          else {
            e.keepAttr = result;
          }
        }
        else {
          e.keepAttr = allowedAttrNames.has(e.attrName);
        }
      });
    }

    if (outputType === "dom") {
      return dompurify.sanitize(untrusted, {
        ...resolvedConfig,
        RETURN_DOM_FRAGMENT: true,
      });
    }

    return dompurify.sanitize(untrusted, {
      ...resolvedConfig,
      RETURN_TRUSTED_TYPE: false,
    });
  }
  finally {
    dompurify.removeAllHooks();
  }
}

const selfClosingTags = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];

const replaceWithPlainTextHook: DomPurifyTypes.UponSanitizeElementHook = (node, data) => {
  if (!data.allowedTags[data.tagName] && data.tagName !== "body") {
    const replacement = convertTagToPlaintext(node);
    if (replacement) {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.parentElement?.insertBefore(replacement, node);
      }
      else {
        node.parentElement?.replaceChild(replacement, node);
      }
    }
  }
};

export function convertTagToPlaintext(node: Node): DocumentFragment | undefined {
  if (!node.ownerDocument) {
    return undefined;
  }

  let startTagText: string;
  let endTagText: string | undefined;
  if (node.nodeType === Node.COMMENT_NODE) {
    startTagText = `<!--${node.textContent}-->`;
  }
  else if (node instanceof Element) {
    const tagName = node.tagName.toLowerCase();
    const isSelfClosing = selfClosingTags.includes(tagName);
    const attrString = node.attributes.length
      ? ` ${Array.from(node.attributes)
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(" ")}`
      : "";
    startTagText = `<${tagName}${attrString}>`;
    if (!isSelfClosing) {
      endTagText = `</${tagName}>`;
    }
  }
  else {
    return undefined;
  }

  const fragment = document.createDocumentFragment();
  const textNode = node.ownerDocument.createTextNode(startTagText);
  fragment.appendChild(textNode);
  while (node.firstChild) {
    fragment.appendChild(node.firstChild);
  }

  if (endTagText) {
    fragment.appendChild(node.ownerDocument.createTextNode(endTagText));
  }

  return fragment;
}

export function safeSetInnerHtml(node: HTMLElement, untrusted: string, config?: DomSanitizerConfig): void {
  const fragment = doSanitizeHtml(untrusted, config, "dom");
  reset(node, fragment);
}
