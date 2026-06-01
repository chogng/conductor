import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  ImporterViewController,
  type ImporterRef,
  type ImporterViewProps,
} from "src/cs/workbench/contrib/import/browser/importerView";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";

import "src/cs/workbench/contrib/import/browser/media/importerViewlet.css";

export type ImporterViewletProps = {
  readonly importerRef: { current: ImporterRef | null };
  readonly onDataImported?: ImporterViewProps["onDataImported"];
  readonly onDataRemoved?: ImporterViewProps["onDataRemoved"];
  readonly onFileSelected?: ImporterViewProps["onFileSelected"];
  readonly rawData?: ImporterViewProps["files"];
  readonly selectedPreviewFileId?: ImporterViewProps["selectedFileId"];
  readonly t: TranslateFn;
};

export class ImporterViewletView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly cardRoot: HTMLDivElement;
  private readonly importerHost: HTMLDivElement;
  private readonly importerView: ImporterViewController;
  private props: ImporterViewletProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ImporterViewletProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("importer-viewlet-host");

    const { cardRoot, importerHost, root } = this.createDom(props);
    this.root = root;
    this.cardRoot = cardRoot;
    this.importerHost = importerHost;
    this.host.appendChild(this.root);

    this.importerView = new ImporterViewController(this.importerHost, {
      files: props.rawData,
      onDataImported: props.onDataImported,
      onDataRemoved: props.onDataRemoved,
      onFileSelected: props.onFileSelected,
      selectedFileId: props.selectedPreviewFileId,
      t: props.t,
    });

    props.importerRef.current = this.importerView;
    this.render();
  }

  setProps(nextProps: ImporterViewletProps): void {
    this.props = nextProps;
    nextProps.importerRef.current = this.importerView;
    this.importerView.setProps({
      files: nextProps.rawData,
      onDataImported: nextProps.onDataImported,
      onDataRemoved: nextProps.onDataRemoved,
      onFileSelected: nextProps.onFileSelected,
      selectedFileId: nextProps.selectedPreviewFileId,
      t: nextProps.t,
    });
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.props.importerRef.current === this.importerView) {
      this.props.importerRef.current = null;
    }
    this.importerView.dispose();
    this.host.classList.remove("importer-viewlet-host");
    this.root.remove();
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    this.root.setAttribute("aria-label", this.props.t("da_import_section"));
  }

  private createDom(props: ImporterViewletProps): {
    readonly cardRoot: HTMLDivElement;
    readonly importerHost: HTMLDivElement;
    readonly root: HTMLDivElement;
  } {
    const root = document.createElement("div");
    root.className = "importer-viewlet-root workbench_sidebar_part";
    root.setAttribute("aria-label", props.t("da_import_section"));

    const section = document.createElement("section");
    section.className = "importer-viewlet-section";

    const cardRoot = document.createElement("div");
    cardRoot.className = "importer-viewlet-card importer-viewlet-card--body card card--fill";
    this.applyCardTracking(cardRoot);

    const importerHost = document.createElement("div");
    importerHost.className = "importer-viewlet-importer-host";

    cardRoot.appendChild(importerHost);
    section.appendChild(cardRoot);
    root.append(section);

    return { cardRoot, importerHost, root };
  }

  private applyCardTracking(cardRoot: HTMLDivElement): void {
    cardRoot.dataset.cta = normalizeCtaName("Device analysis") ?? "";
    cardRoot.dataset.ctaPosition = normalizeCtaToken("data-import") ?? "";
    cardRoot.dataset.ctaCopy = normalizeCtaToken("csv importer") ?? "";
  }
}
