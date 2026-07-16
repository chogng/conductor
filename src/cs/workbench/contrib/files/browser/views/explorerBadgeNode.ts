/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  isTemplateApplyPerformanceTraceEnabled,
  markTemplateApplyPerformanceTrace,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";

export type ExplorerBadgePresentation = {
  readonly color?: string | null;
  readonly fileKey: string;
  readonly label: string;
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

    if (isTemplateApplyPerformanceTraceEnabled()) {
      markTemplateApplyPerformanceTrace("explorer.badge.bind", {
        fileKey,
        previousFileKey: this.boundFileKey,
      });
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
    if (isTemplateApplyPerformanceTraceEnabled()) {
      markTemplateApplyPerformanceTrace("explorer.badge.apply", {
        color: badge?.color ?? null,
        fileKey,
        isConnected: this.node.isConnected,
        label: badge?.label ?? null,
      });
    }
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
    ].join("\u001f");
  }

  private apply(badge: ExplorerBadgePresentation): void {
    if (!badge) {
      this.node.textContent = "";
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
    this.node.hidden = false;
  }
}
