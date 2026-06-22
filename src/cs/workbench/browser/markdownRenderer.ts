/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

import { safeSetInnerHtml, type DomSanitizerConfig } from "src/cs/base/browser/domSanitize";
import { Schemas } from "src/cs/base/common/network";

export type WorkbenchMarkdownRenderOptions = {
  readonly className?: string;
};

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "p",
  "strong",
  "em",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "blockquote",
  "hr",
  "video",
  "source",
];

const ALLOWED_ATTR = [
  "alt",
  "controls",
  "href",
  "loading",
  "preload",
  "rel",
  "src",
  "target",
  "title",
  "type",
];

const sanitizeConfig: DomSanitizerConfig = {
  allowedAttributes: {
    override: ALLOWED_ATTR,
  },
  allowedLinkProtocols: {
    override: [Schemas.http, Schemas.https, Schemas.mailto],
  },
  allowedMediaProtocols: {
    override: [Schemas.https],
  },
  allowedTags: {
    override: ALLOWED_TAGS,
  },
  allowRelativeMediaPaths: true,
};

const markdown = createWorkbenchMarkdownIt();

type WorkbenchMarkdownRenderEnv = {
  readonly linkStack: boolean[];
};

export function renderWorkbenchMarkdown(
  markdownText: string,
  options: WorkbenchMarkdownRenderOptions = {},
): HTMLElement {
  const root = document.createElement("div");
  root.className = options.className ?? "workbench-markdown";
  const env: WorkbenchMarkdownRenderEnv = { linkStack: [] };
  const unsafeHtml = markdown.render(String(markdownText ?? ""), env);
  safeSetInnerHtml(root, unsafeHtml, sanitizeConfig);
  enforceWorkbenchMarkdownResourcePolicy(root);
  return root;
}

function createWorkbenchMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: false,
    typographer: false,
  });

  md.validateLink = url => isAllowedLinkUrl(url) || isAllowedMediaUrl(url);
  md.block.ruler.before("paragraph", "workbench_video", parseVideoBlock);
  md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
    const env = _env as WorkbenchMarkdownRenderEnv;
    const token = tokens[index];
    const href = token.attrGet("href") ?? "";
    const title = token.attrGet("title") ?? undefined;
    const isAllowed = isAllowedLinkUrl(href);
    env.linkStack.push(isAllowed);
    if (!isAllowed) {
      return "";
    }

    token.attrs = [];
    token.attrSet("href", href);
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
    if (title) {
      token.attrSet("title", title);
    }
    return self.renderToken(tokens, index, options);
  };
  md.renderer.rules.link_close = (_tokens, _index, _options, _env) => {
    const env = _env as WorkbenchMarkdownRenderEnv;
    return env.linkStack.pop() === false ? "" : "</a>";
  };
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const src = token.attrGet("src") ?? "";
    if (!isAllowedMediaUrl(src)) {
      return md.utils.escapeHtml(token.content);
    }

    const alt = token.content;
    const title = token.attrGet("title") ?? "";
    const attributes = [
      `src="${md.utils.escapeHtml(src)}"`,
      `alt="${md.utils.escapeHtml(alt)}"`,
      `loading="lazy"`,
    ];
    if (title) {
      attributes.push(`title="${md.utils.escapeHtml(title)}"`);
    }
    return `<img ${attributes.join(" ")}>`;
  };
  md.renderer.rules.workbench_video = (tokens, index) => {
    const token = tokens[index];
    const src = token.attrGet("src") ?? "";
    if (!isAllowedMediaUrl(src)) {
      return "";
    }

    const title = token.attrGet("title") ?? "";
    const type = token.attrGet("type") ?? "";
    const sourceAttributes = [`src="${md.utils.escapeHtml(src)}"`];
    if (type) {
      sourceAttributes.push(`type="${md.utils.escapeHtml(type)}"`);
    }
    const caption = title
      ? `<p><em>${md.utils.escapeHtml(title)}</em></p>`
      : "";
    return [
      `<video controls preload="metadata">`,
      `<source ${sourceAttributes.join(" ")}>`,
      `</video>`,
      caption,
    ].join("");
  };

  return md;
}

function parseVideoBlock(state: StateBlock, startLine: number, _endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const end = state.eMarks[startLine];
  const line = state.src.slice(start, end).trim();
  const video = parseVideoDirective(line);
  if (!video) {
    return false;
  }
  if (silent) {
    return true;
  }

  const token = state.push("workbench_video", "video", 0);
  token.block = true;
  token.attrSet("src", video.src);
  if (video.title) {
    token.attrSet("title", video.title);
  }
  if (video.type) {
    token.attrSet("type", video.type);
  }
  state.line = startLine + 1;
  return true;
}

function parseVideoDirective(line: string): { readonly src: string; readonly title?: string; readonly type?: string } | null {
  const match = /^@\[video\]\((\S+)(?:\s+"([^"]*)")?(?:\s+\{type="([^"]*)"\})?\)$/.exec(line);
  if (!match) {
    return null;
  }

  const src = match[1] ?? "";
  if (!isAllowedMediaUrl(src)) {
    return null;
  }

  return {
    src,
    title: match[2],
    type: match[3],
  };
}

function enforceWorkbenchMarkdownResourcePolicy(root: HTMLElement): void {
  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (!isAllowedLinkUrl(link.getAttribute("href") ?? "")) {
      link.replaceWith(document.createTextNode(link.textContent ?? ""));
      continue;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>("img[src]"))) {
    if (!isAllowedMediaUrl(image.getAttribute("src") ?? "")) {
      image.replaceWith(document.createTextNode(image.alt));
      continue;
    }
    image.loading = "lazy";
    image.removeAttribute("class");
    image.removeAttribute("style");
  }

  for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("video"))) {
    video.controls = true;
    video.preload = "metadata";
    for (const source of Array.from(video.querySelectorAll<HTMLSourceElement>("source[src]"))) {
      if (!isAllowedMediaUrl(source.getAttribute("src") ?? "")) {
        source.remove();
      }
    }
    if (!video.querySelector("source[src]")) {
      video.remove();
    }
  }
}

function isAllowedLinkUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url);
}

function isAllowedMediaUrl(url: string): boolean {
  return isRelativeUrl(url) || /^https:/i.test(url);
}

function isRelativeUrl(url: string): boolean {
  return Boolean(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//");
}
