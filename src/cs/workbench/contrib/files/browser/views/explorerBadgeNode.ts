/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type ExplorerBadgePresentation = {
  readonly color?: string | null;
  readonly fileKey: string;
  readonly isWarning: boolean;
  readonly label: string;
  readonly source?: string | null;
  readonly state: string;
  readonly title?: string | null;
} | null;

export class ExplorerBadgeNode {
  private boundFileKey: string | null = null;
  private lastKey = "";

  public constructor(
    private readonly node: HTMLSpanElement,
  ) {}

  public bind(fileKey: string): void {
    if (this.boundFileKey === fileKey) {
      return;
    }

    this.boundFileKey = fileKey;
    this.lastKey = "";
  }

  public setBadge(fileKey: string, badge: ExplorerBadgePresentation): void {
    if (this.boundFileKey !== fileKey) {
      return;
    }

    const key = this.createKey(badge);
    if (this.lastKey === key) {
      return;
    }

    this.lastKey = key;
    this.apply(badge);
  }

  private createKey(badge: ExplorerBadgePresentation): string {
    if (!badge) {
      return "empty";
    }

    return [
      badge.fileKey,
      badge.color ?? "",
      badge.label,
      badge.state,
      badge.source ?? "",
      badge.title ?? "",
      badge.isWarning ? "1" : "0",
    ].join("\u001f");
  }

  private apply(badge: ExplorerBadgePresentation): void {
    if (!badge) {
      this.node.textContent = "";
      this.node.removeAttribute("title");
      delete this.node.dataset.source;
      delete this.node.dataset.state;
      delete this.node.dataset.warning;
      delete this.node.dataset.color;
      this.node.hidden = true;
      return;
    }

    this.node.textContent = badge.label;
    if (badge.color) {
      this.node.dataset.color = badge.color;
    } else {
      delete this.node.dataset.color;
    }
    this.node.dataset.state = badge.state;
    if (badge.source) {
      this.node.dataset.source = badge.source;
    } else {
      delete this.node.dataset.source;
    }
    if (badge.title) {
      this.node.title = badge.title;
    } else {
      this.node.removeAttribute("title");
    }
    this.node.dataset.warning = badge.isWarning ? "true" : "false";
    this.node.hidden = false;
  }
}
