/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { reset } from "src/cs/base/browser/dom";
import { Schemas } from "src/cs/base/common/network";

import dompurify, * as DomPurifyTypes from "./dompurify/dompurify.js";

// This sanitizer is for Conductor-owned document fragments such as release notes
// and user guides. It is intentionally not a general webpage renderer; remote
// pages need a separate sandbox/navigation/resource-loading boundary.
export const basicMarkupHtmlTags = Object.freeze([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "samp",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "video",
  "wbr",
]);

export const defaultAllowedAttrs = Object.freeze([
  "alt",
  "height",
  "href",
  "loading",
  "preload",
  "rel",
  "role",
  "src",
  "target",
  "title",
  "type",
  "width",
]);

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

interface AttributePlan {
  readonly names: readonly string[];
  readonly nameSet: ReadonlySet<string>;
  readonly rules: ReadonlyMap<string, SanitizeAttributeRule>;
}

interface ResourcePolicy {
  readonly protocols: readonly string[] | "*";
  readonly allowRelative: boolean;
}

interface SanitizePlan {
  readonly attributes: AttributePlan;
  readonly dompurifyConfig: DomPurifyTypes.Config;
  readonly linkPolicy: ResourcePolicy;
  readonly mediaPolicy: ResourcePolicy;
  readonly replaceWithPlaintext: boolean;
}

const defaultLinkProtocols = Object.freeze([Schemas.http, Schemas.https]);
const defaultMediaProtocols = Object.freeze([Schemas.http, Schemas.https]);
const urlSchemePattern = /^([a-z][a-z0-9+.-]*):/i;
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;
const hrefTags = new Set(["a", "area"]);
const srcTags = new Set(["audio", "embed", "iframe", "img", "input", "script", "source", "track", "video"]);
const safeLinkTargets = new Set(["_blank", "_parent", "_self", "_top"]);
const blankTargetRelTokens = ["noopener", "noreferrer"];
const voidHtmlTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

export function sanitizeHtml(untrusted: string, config?: DomSanitizerConfig): SanitizedHtml {
  const plan = createSanitizePlan(config);
  const purifier = createPurifier();
  installDomPurifyHooks(purifier, plan);
  return purifier.sanitize(untrusted, {
    ...plan.dompurifyConfig,
    RETURN_TRUSTED_TYPE: false,
  });
}

export function safeSetInnerHtml(node: HTMLElement, untrusted: string, config?: DomSanitizerConfig): void {
  const plan = createSanitizePlan(config);
  const purifier = createPurifier();
  installDomPurifyHooks(purifier, plan);
  const fragment = purifier.sanitize(untrusted, {
    ...plan.dompurifyConfig,
    RETURN_DOM_FRAGMENT: true,
  });
  reset(node, fragment);
}

function createSanitizePlan(config: DomSanitizerConfig | undefined): SanitizePlan {
  const allowedTags = resolveNames(
    config?.allowedTags?.override ?? basicMarkupHtmlTags,
    config?.allowedTags?.augment,
  );
  const attributes = resolveAttributes(config);

  return {
    attributes,
    dompurifyConfig: {
      // The sanitized content is display markup, not trusted app UI. Keep
      // author-controlled semantic and data channels closed unless a caller
      // explicitly allows specific attributes through allowedAttributes.
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: true,
      ALLOWED_ATTR: [...attributes.names],
      ALLOWED_TAGS: allowedTags,
      KEEP_CONTENT: true,
    },
    linkPolicy: {
      allowRelative: config?.allowRelativeLinkPaths ?? false,
      protocols: config?.allowedLinkProtocols?.override ?? defaultLinkProtocols,
    },
    mediaPolicy: {
      allowRelative: config?.allowRelativeMediaPaths ?? false,
      protocols: config?.allowedMediaProtocols?.override ?? defaultMediaProtocols,
    },
    replaceWithPlaintext: config?.replaceWithPlaintext ?? false,
  };
}

function resolveNames(names: readonly string[], augment: readonly string[] | undefined): string[] {
  const resolved = new Set<string>();
  for (const name of names) {
    resolved.add(name.toLowerCase());
  }
  for (const name of augment ?? []) {
    resolved.add(name.toLowerCase());
  }
  return [...resolved];
}

function resolveAttributes(config: DomSanitizerConfig | undefined): AttributePlan {
  const configured = [
    ...(config?.allowedAttributes?.override ?? defaultAllowedAttrs),
    ...(config?.allowedAttributes?.augment ?? []),
  ];
  const names = new Set<string>();
  const rules = new Map<string, SanitizeAttributeRule>();

  for (const entry of configured) {
    if (typeof entry === "string") {
      const name = entry.toLowerCase();
      names.add(name);
      rules.delete(name);
      continue;
    }

    const name = entry.attributeName.toLowerCase();
    names.add(name);
    rules.set(name, {
      attributeName: name,
      shouldKeep: entry.shouldKeep,
    });
  }

  return {
    names: [...names],
    nameSet: names,
    rules,
  };
}

function createPurifier(): DomPurifyTypes.DOMPurify {
  return dompurify();
}

function installDomPurifyHooks(purifier: DomPurifyTypes.DOMPurify, plan: SanitizePlan): void {
  const resourceHook: DomPurifyTypes.ElementHook = node => {
    hardenElementAttributes(node, plan);
  };
  purifier.addHook("afterSanitizeAttributes", resourceHook);

  const attributeHook = plan.attributes.rules.size
    ? createAttributeRuleHook(plan.attributes)
    : undefined;
  if (attributeHook) {
    purifier.addHook("uponSanitizeAttribute", attributeHook);
  }

  const elementHook = plan.replaceWithPlaintext
    ? createPlaintextReplacementHook()
    : undefined;
  if (elementHook) {
    purifier.addHook("uponSanitizeElement", elementHook);
  }
}

function createAttributeRuleHook(attributes: AttributePlan): DomPurifyTypes.UponSanitizeAttributeHook {
  return (node, data) => {
    const attrName = data.attrName.toLowerCase();
    const rule = attributes.rules.get(attrName);
    if (!rule) {
      data.keepAttr = attributes.nameSet.has(attrName);
      return;
    }

    const result = rule.shouldKeep(node, {
      attrName,
      attrValue: data.attrValue,
    });
    if (typeof result === "string") {
      data.attrValue = result;
      data.keepAttr = true;
      return;
    }

    data.keepAttr = result;
  };
}

function createPlaintextReplacementHook(): DomPurifyTypes.UponSanitizeElementHook {
  return (node, data) => {
    if (data.allowedTags[data.tagName] || data.tagName === "body") {
      return;
    }

    const replacement = convertTagToPlaintext(node);
    const parent = node.parentNode;
    if (!replacement || !parent) {
      return;
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      parent.insertBefore(replacement, node);
      return;
    }

    parent.replaceChild(replacement, node);
  };
}

function hardenElementAttributes(node: Element, plan: SanitizePlan): void {
  // DOMPurify decides whether an attribute name is generally allowed. Conductor
  // adds context rules: resource attributes must live on matching tags, and
  // links that open new windows must carry a safe rel value.
  sanitizeResourceAttribute(node, "href", plan.linkPolicy);
  sanitizeResourceAttribute(node, "src", plan.mediaPolicy);
  sanitizeLinkTarget(node, plan.attributes.nameSet);
}

function sanitizeResourceAttribute(node: Element, attributeName: "href" | "src", policy: ResourcePolicy): void {
  const value = node.getAttribute(attributeName);
  if (value === null) {
    return;
  }
  if (!canUseResourceAttribute(node, attributeName)) {
    node.removeAttribute(attributeName);
    return;
  }

  const isFragmentLink = attributeName === "href" && value.trim().startsWith("#");
  if (isFragmentLink && !controlCharacterPattern.test(value)) {
    return;
  }

  if (!isAllowedResourceValue(value, policy)) {
    node.removeAttribute(attributeName);
  }
}

function canUseResourceAttribute(node: Element, attributeName: "href" | "src"): boolean {
  const tagName = node.localName.toLowerCase();
  return attributeName === "href"
    ? hrefTags.has(tagName)
    : srcTags.has(tagName);
}

function sanitizeLinkTarget(node: Element, allowedAttributeNames: ReadonlySet<string>): void {
  const target = node.getAttribute("target");
  if (target === null) {
    return;
  }
  if (node.localName.toLowerCase() !== "a") {
    node.removeAttribute("target");
    return;
  }

  const normalizedTarget = target.trim().toLowerCase();
  if (!safeLinkTargets.has(normalizedTarget)) {
    node.removeAttribute("target");
    return;
  }
  if (normalizedTarget !== "_blank") {
    return;
  }
  if (!allowedAttributeNames.has("rel")) {
    node.removeAttribute("target");
    return;
  }

  node.setAttribute("rel", mergeRelTokens(node.getAttribute("rel")));
}

function mergeRelTokens(value: string | null): string {
  const tokens = new Set((value ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.toLowerCase()));
  for (const token of blankTargetRelTokens) {
    tokens.add(token);
  }
  return [...tokens].join(" ");
}

function isAllowedResourceValue(value: string, policy: ResourcePolicy): boolean {
  const candidate = value.trim();
  if (!candidate || controlCharacterPattern.test(candidate)) {
    return false;
  }
  if (policy.protocols === "*") {
    return true;
  }
  if (candidate.startsWith("//")) {
    return false;
  }

  const scheme = urlSchemePattern.exec(candidate)?.[1]?.toLowerCase();
  if (scheme) {
    return policy.protocols.includes(scheme);
  }

  return policy.allowRelative;
}

export function convertTagToPlaintext(node: Node): DocumentFragment | undefined {
  const ownerDocument = node.ownerDocument;
  if (!ownerDocument) {
    return undefined;
  }

  const startText = getPlaintextStart(node);
  if (!startText) {
    return undefined;
  }

  const fragment = ownerDocument.createDocumentFragment();
  fragment.appendChild(ownerDocument.createTextNode(startText));
  while (node.firstChild) {
    fragment.appendChild(node.firstChild);
  }

  const endText = getPlaintextEnd(node);
  if (endText) {
    fragment.appendChild(ownerDocument.createTextNode(endText));
  }

  return fragment;
}

function getPlaintextStart(node: Node): string | undefined {
  if (node.nodeType === Node.COMMENT_NODE) {
    return `<!--${node.textContent ?? ""}-->`;
  }
  if (!(node instanceof Element)) {
    return undefined;
  }

  const tagName = node.tagName.toLowerCase();
  const attributes = Array.from(node.attributes)
    .map(attribute => ` ${attribute.name}="${attribute.value}"`)
    .join("");
  return `<${tagName}${attributes}>`;
}

function getPlaintextEnd(node: Node): string | undefined {
  if (!(node instanceof Element)) {
    return undefined;
  }

  const tagName = node.tagName.toLowerCase();
  return voidHtmlTags.has(tagName) ? undefined : `</${tagName}>`;
}
