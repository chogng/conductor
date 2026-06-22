/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getNLSLanguage, localize, type NLSLanguage } from "src/cs/nls";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import {
  MODAL_BACKDROP_CLASS,
  MODAL_BODY_SCROLL_CLASS,
  MODAL_OVERLAY_CLASS,
  createModalCloseActionBar,
  getModalDialogClassName,
  getModalDialogId,
  getModalTitleId,
} from "src/cs/base/browser/ui/modal/modal";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Disposable, DisposableStore, MutableDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";

import enReleaseNotesMarkdown from "src/cs/workbench/contrib/update/browser/releaseNotes/current.en.md?raw";
import zhReleaseNotesMarkdown from "src/cs/workbench/contrib/update/browser/releaseNotes/current.zh.md?raw";

import "src/cs/workbench/contrib/update/browser/media/releaseNotesEditor.css";

export type ReleaseNotesMarkdownInput = {
  readonly currentVersion?: string | null;
  readonly fallbackVersionLabel: string;
};

type WorkbenchMarkdownRenderer = typeof import("src/cs/workbench/browser/markdownRenderer").renderWorkbenchMarkdown;

const releaseNotesByLanguage: Record<NLSLanguage, string> = {
  en: enReleaseNotesMarkdown,
  zh: zhReleaseNotesMarkdown,
};

export function readBundledReleaseNotesMarkdown(input: ReleaseNotesMarkdownInput): string {
  const version = input.currentVersion?.trim() || input.fallbackVersionLabel;
  const markdown = releaseNotesByLanguage[getNLSLanguage()] ?? enReleaseNotesMarkdown;
  return markdown.replaceAll("{{version}}", version);
}

export class ReleaseNotesEditor extends Disposable {
  private readonly currentDialog = this._register(new MutableDisposable<ReleaseNotesDialog>());
  private disposed = false;

  public show(currentVersion?: string | null): boolean {
    if (typeof document === "undefined") {
      return false;
    }

    const markdown = readBundledReleaseNotesMarkdown({
      currentVersion,
      fallbackVersionLabel: localize("update.releaseNotes.unknownVersion", "Current Version"),
    });

    this.close();
    void this.openDialog(markdown).catch(() => undefined);
    return true;
  }

  public close(): void {
    this.currentDialog.clear();
  }

  public override dispose(): void {
    this.disposed = true;
    super.dispose();
  }

  private async openDialog(markdown: string): Promise<void> {
    const { renderWorkbenchMarkdown } = await import("src/cs/workbench/browser/markdownRenderer");
    if (this.disposed || typeof document === "undefined") {
      return;
    }
    this.currentDialog.current = this.createDialog(markdown, renderWorkbenchMarkdown);
  }

  private createDialog(markdown: string, renderMarkdown: WorkbenchMarkdownRenderer): ReleaseNotesDialog {
    const disposeStore = new DisposableStore();
    const overlay = document.createElement("div");
    overlay.className = MODAL_OVERLAY_CLASS;

    const backdrop = document.createElement("div");
    backdrop.className = MODAL_BACKDROP_CLASS;
    overlay.appendChild(backdrop);

    const dialogId = getModalDialogId("update-release-notes") ?? "update-release-notes-dialog";
    const titleId = getModalTitleId("update-release-notes", "update-release-notes");
    const panel = document.createElement("section");
    panel.className = getModalDialogClassName({
      className: "update-release-notes-modal",
      size: "xl",
      variant: "solid",
    });
    panel.id = dialogId;
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", titleId);

    const header = document.createElement("header");
    header.className = "modal_header update-release-notes-modal__header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "update-release-notes-modal__titleWrap";
    titleWrap.append(createLxIcon({
      className: "update-release-notes-modal__titleIcon",
      icon: LxIcon.fileText,
      size: 18,
    }));
    const heading = document.createElement("h2");
    heading.className = "modal_title update-release-notes-modal__title";
    heading.id = titleId;
    heading.textContent = localize("update.releaseNotes.dialogTitle", "Release Notes");
    titleWrap.appendChild(heading);

    const closeActionBar = disposeStore.add(createModalCloseActionBar({
      className: "update-release-notes-modal__close",
      id: "update.releaseNotes.close",
      label: localize("update.releaseNotes.close", "Close"),
      run: () => this.close(),
    }));
    header.append(titleWrap, closeActionBar.domNode);

    const body = document.createElement("div");
    body.className = `modal_body ${MODAL_BODY_SCROLL_CLASS} update-release-notes-modal__body`;
    body.appendChild(renderMarkdown(markdown, {
      className: "update-release-notes-markdown",
    }));

    panel.append(header, body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    disposeStore.add(addDisposableListener(backdrop, EventType.MOUSE_DOWN, event => {
      if (event.target === backdrop) {
        this.close();
      }
    }));
    disposeStore.add(addDisposableListener(document, EventType.KEY_DOWN, event => {
      if (event.key === "Escape") {
        this.close();
      }
    }));
    queueMicrotask(() => panel.focus());

    return new ReleaseNotesDialog(overlay, disposeStore);
  }
}

class ReleaseNotesDialog extends Disposable {
  public constructor(
    private readonly overlay: HTMLElement,
    disposables: DisposableStore,
  ) {
    super();
    this._register(disposables);
  }

  public override dispose(): void {
    super.dispose();
    this.overlay.remove();
  }
}
