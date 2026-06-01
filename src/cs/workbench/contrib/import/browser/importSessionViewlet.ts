import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  ImportSessionController,
  type ImportSessionFileInfo,
  type ImportSessionRef,
} from "src/cs/workbench/contrib/import/browser/importSessionController";
import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";

import "src/cs/workbench/contrib/import/browser/media/importSessionViewlet.css";

export type ImportSessionViewletProps = {
  readonly importSessionRef: { current: ImportSessionRef | null };
  readonly files?: FileEntry[];
  readonly onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  readonly onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  readonly onFileRemoved?: (fileId: string) => void;
  readonly onFileSelected?: (fileId: string | null) => void;
  readonly selectedFileId?: string | null;
  readonly t: TranslateFn;
};

export class ImportSessionViewlet implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly cardRoot: HTMLDivElement;
  private readonly sessionHost: HTMLDivElement;
  private readonly sessionController: ImportSessionController;
  private props: ImportSessionViewletProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ImportSessionViewletProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("import-session-viewlet-host");

    const { cardRoot, root, sessionHost } = this.createDom(props);
    this.root = root;
    this.cardRoot = cardRoot;
    this.sessionHost = sessionHost;
    this.host.appendChild(this.root);

    this.sessionController = new ImportSessionController(this.sessionHost, {
      files: props.files,
      onFileImported: props.onFileImported,
      onFilesReplaced: props.onFilesReplaced,
      onFileRemoved: props.onFileRemoved,
      onFileSelected: props.onFileSelected,
      selectedFileId: props.selectedFileId,
      t: props.t,
    });

    props.importSessionRef.current = this.sessionController;
    this.render();
  }

  setProps(nextProps: ImportSessionViewletProps): void {
    this.props = nextProps;
    nextProps.importSessionRef.current = this.sessionController;
    this.sessionController.setProps({
      files: nextProps.files,
      onFileImported: nextProps.onFileImported,
      onFilesReplaced: nextProps.onFilesReplaced,
      onFileRemoved: nextProps.onFileRemoved,
      onFileSelected: nextProps.onFileSelected,
      selectedFileId: nextProps.selectedFileId,
      t: nextProps.t,
    });
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.props.importSessionRef.current === this.sessionController) {
      this.props.importSessionRef.current = null;
    }
    this.sessionController.dispose();
    this.host.classList.remove("import-session-viewlet-host");
    this.root.remove();
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    this.root.setAttribute("aria-label", this.props.t("da_import_section"));
  }

  private createDom(props: ImportSessionViewletProps): {
    readonly cardRoot: HTMLDivElement;
    readonly root: HTMLDivElement;
    readonly sessionHost: HTMLDivElement;
  } {
    const root = document.createElement("div");
    root.className = "import-session-viewlet-root workbench_sidebar_part";
    root.setAttribute("aria-label", props.t("da_import_section"));

    const section = document.createElement("section");
    section.className = "import-session-viewlet-section";

    const cardRoot = document.createElement("div");
    cardRoot.className = "import-session-viewlet-card import-session-viewlet-card--body card card--fill";
    this.applyCardTracking(cardRoot);

    const sessionHost = document.createElement("div");
    sessionHost.className = "import-session-viewlet-session-host";

    cardRoot.appendChild(sessionHost);
    section.appendChild(cardRoot);
    root.append(section);

    return { cardRoot, root, sessionHost };
  }

  private applyCardTracking(cardRoot: HTMLDivElement): void {
    cardRoot.dataset.cta = normalizeCtaName("Device analysis") ?? "";
    cardRoot.dataset.ctaPosition = normalizeCtaToken("data-import") ?? "";
    cardRoot.dataset.ctaCopy = normalizeCtaToken("import session") ?? "";
  }
}
