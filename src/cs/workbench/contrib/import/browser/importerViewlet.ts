import { normalizeCogIconSvgMarkup } from "src/cs/base/browser/ui/cogIcon/cogIconMarkup";
import { createButton } from "src/cs/base/browser/ui/button/button";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  createImporterHeaderActions,
  importerClearSessionActionId,
  importerImportActionId,
  type ImporterHeaderAction,
} from "src/cs/workbench/contrib/import/browser/importerActions";
import {
  ImporterViewController,
  type ImporterRef,
  type ImporterViewProps,
} from "src/cs/workbench/contrib/import/browser/importerView";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";

import "src/cs/workbench/contrib/import/browser/media/importerViewlet.css";

export type ImporterViewletProps = {
  readonly hasSessionData: boolean;
  readonly importerRef: { current: ImporterRef | null };
  readonly onClearSession?: () => void;
  readonly onDataImported?: ImporterViewProps["onDataImported"];
  readonly onDataRemoved?: ImporterViewProps["onDataRemoved"];
  readonly onFileSelected?: ImporterViewProps["onFileSelected"];
  readonly onImportTrigger?: () => void;
  readonly rawData?: ImporterViewProps["files"];
  readonly selectedPreviewFileId?: ImporterViewProps["selectedFileId"];
  readonly t: TranslateFn;
};

export class ImporterViewletView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly headerActionsRoot: HTMLDivElement;
  private readonly cardRoot: HTMLDivElement;
  private readonly importerHost: HTMLDivElement;
  private readonly importerView: ImporterViewController;
  private props: ImporterViewletProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ImporterViewletProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("importer-viewlet-host");

    this.root = document.createElement("div");
    this.root.className = "importer-viewlet-root workbench_sidebar_part";
    this.root.setAttribute("aria-label", props.t("da_import_section"));

    const header = document.createElement("header");
    header.className =
      "workbench_sidebar_header workbench_sidebar_header--actions-only";
    this.headerActionsRoot = document.createElement("div");
    this.headerActionsRoot.className = "workbench_sidebar_header_actions";
    header.appendChild(this.headerActionsRoot);

    const section = document.createElement("section");
    section.className = "flex-1 flex flex-col min-h-0";

    this.cardRoot = document.createElement("div");
    this.cardRoot.id = "analysis-import-card";
    this.cardRoot.className = "card card--flat p-0 flex flex-col flex-1 min-h-0";
    this.cardRoot.dataset.cta = normalizeCtaName("Device analysis") ?? "";
    this.cardRoot.dataset.ctaPosition =
      normalizeCtaToken("data-import") ?? "";
    this.cardRoot.dataset.ctaCopy = normalizeCtaToken("csv importer") ?? "";

    this.importerHost = document.createElement("div");
    this.importerHost.className = "flex flex-col flex-1 min-h-0";
    this.cardRoot.appendChild(this.importerHost);
    section.appendChild(this.cardRoot);
    this.root.append(header, section);
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
    this.renderHeaderActions();
  }

  private renderHeaderActions(): void {
    this.headerActionsRoot.replaceChildren();

    const actions = createImporterHeaderActions({
      fileCount: this.props.rawData?.length ?? 0,
      hasSessionData: this.props.hasSessionData,
      t: this.props.t,
    });

    for (const action of actions) {
      this.headerActionsRoot.appendChild(this.renderHeaderAction(action));
    }
  }

  private renderHeaderAction(action: ImporterHeaderAction): HTMLElement {
    if (action.kind === "statusBadge") {
      const badge = document.createElement("span");
      badge.id = action.id;
      badge.className = "workbench_sidebar_header_status_badge";
      badge.setAttribute("role", "status");
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("aria-label", action.title);
      badge.title = action.title;

      const digits = document.createElement("span");
      digits.className = "workbench_sidebar_header_status_badge_digits";
      const digitViewport = document.createElement("span");
      digitViewport.className = "workbench_sidebar_header_status_badge_digit_viewport";
      const digit = document.createElement("span");
      digit.className = "workbench_sidebar_header_status_badge_digit";
      digit.textContent = action.badgeText ?? "";
      digitViewport.appendChild(digit);
      digits.appendChild(digitViewport);
      badge.appendChild(digits);
      return badge;
    }

    const content: Node[] = [];

    if (action.icon) {
      const icon = document.createElement("span");
      icon.className = "ui-cogicon shrink-0";
      icon.style.width = "16px";
      icon.style.height = "16px";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = normalizeCogIconSvgMarkup(action.icon);
      content.push(icon);
    }

    if (action.kind !== "icon") {
      const label = document.createElement("span");
      label.className = "min-w-0 truncate text-left";
      label.textContent = action.title;
      content.push(label);
    }

    const button = createButton({
      id: action.id,
      ariaLabel: action.title,
      className: action.kind === "icon"
        ? "workbench_sidebar_header_icon_btn"
        : "workbench_sidebar_header_btn",
      content,
      dataIcon: action.icon && action.kind !== "icon" ? "with" : undefined,
      disabled: Boolean(action.isDisabled),
      size: action.kind === "icon" ? "iconSm" : "sm",
      title: action.title,
      variant: action.kind === "primary" ? "primary" : "ghost",
    });
    button.addEventListener("click", () => this.handleHeaderAction(action.id));
    return button;
  }

  private handleHeaderAction(actionId: string): void {
    if (actionId === importerImportActionId) {
      if (this.props.onImportTrigger) {
        this.props.onImportTrigger();
        return;
      }

      this.props.importerRef.current?.openFileDialog?.();
      return;
    }

    if (actionId === importerClearSessionActionId) {
      this.props.onClearSession?.();
    }
  }
}
