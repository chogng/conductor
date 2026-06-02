import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { FileEntry, FilesPaneRef } from "src/cs/workbench/contrib/files/common/files";
import {
  FilesController,
  type ImportSessionFileInfo,
} from "src/cs/workbench/contrib/files/browser/filesController";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";

import "src/cs/workbench/contrib/files/browser/views/media/filesPane.css";

export type FilesPaneProps = {
  readonly filesPaneRef: { current: FilesPaneRef | null };
  readonly files?: FileEntry[];
  readonly onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  readonly onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  readonly onFileRemoved?: (fileId: string) => void;
  readonly onFileSelected?: (fileId: string | null) => void;
  readonly selectedFileId?: string | null;
  readonly t: TranslateFn;
};

export class FilesPane implements IDisposable {
  private readonly host: HTMLElement;
  private readonly body: HTMLDivElement;
  private readonly sessionHost: HTMLDivElement;
  private readonly controller: FilesController;
  private props: FilesPaneProps;
  private disposed = false;

  constructor(host: HTMLElement, props: FilesPaneProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("files-pane");

    const { body, sessionHost } = this.createDom();
    this.body = body;
    this.sessionHost = sessionHost;
    this.host.appendChild(this.body);

    this.controller = new FilesController(this.sessionHost, {
      files: props.files,
      onFileImported: props.onFileImported,
      onFilesReplaced: props.onFilesReplaced,
      onFileRemoved: props.onFileRemoved,
      onFileSelected: props.onFileSelected,
      selectedFileId: props.selectedFileId,
      t: props.t,
    });

    props.filesPaneRef.current = this.controller;
  }

  setProps(nextProps: FilesPaneProps): void {
    this.props = nextProps;
    nextProps.filesPaneRef.current = this.controller;
    this.controller.setProps({
      files: nextProps.files,
      onFileImported: nextProps.onFileImported,
      onFilesReplaced: nextProps.onFilesReplaced,
      onFileRemoved: nextProps.onFileRemoved,
      onFileSelected: nextProps.onFileSelected,
      selectedFileId: nextProps.selectedFileId,
      t: nextProps.t,
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.props.filesPaneRef.current === this.controller) {
      this.props.filesPaneRef.current = null;
    }
    this.controller.dispose();
    this.host.classList.remove("files-pane");
    this.body.remove();
  }

  private createDom(): {
    readonly body: HTMLDivElement;
    readonly sessionHost: HTMLDivElement;
  } {
    const body = document.createElement("div");
    body.className = "files-pane-body";
    this.applyCardTracking(body);

    const sessionHost = document.createElement("div");
    sessionHost.className = "files-pane-session-host";

    body.append(sessionHost);

    return { body, sessionHost };
  }

  private applyCardTracking(body: HTMLDivElement): void {
    body.dataset.cta = normalizeCtaName("Device analysis") ?? "";
    body.dataset.ctaPosition = normalizeCtaToken("data-import") ?? "";
    body.dataset.ctaCopy = normalizeCtaToken("files pane") ?? "";
  }
}
