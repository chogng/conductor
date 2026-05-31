import type { MutableRef } from "src/cs/base/common/ref";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type {
  PreviewStatus as SessionPreviewStatus,
  StateSetter,
} from "src/cs/workbench/contrib/session/analysis-session-context";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import {
  PREVIEW_ZOOM_DEFAULT_PERCENT,
  offsetPreviewZoomPercent,
} from "./templateManagerPreviewZoom";
import {
  TemplateManagerPreviewEmptyState,
  TemplateManagerPreviewSurface,
} from "./templatePreviewSurface";

type PreviewStatus = Partial<SessionPreviewStatus>;

type TemplateManagerPreviewWorkspaceProps = {
  containerRef: MutableRef<HTMLElement | null>;
  config: TemplateConfig;
  ensurePreviewRows?: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<unknown> | unknown;
  getPreviewRow?: (rowIndex: number) => unknown;
  getPreviewRowsVersion?: () => number;
  interactive?: boolean;
  previewFile?: PreviewFileLike | null;
  previewStatus?: PreviewStatus | null;
  setConfig: StateSetter<TemplateConfig>;
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  t: TranslateFn;
  writeFieldFromPreview: (field: string, value: string) => void;
};

export class TemplateManagerPreviewWorkspaceView {
  public readonly element: HTMLElement;
  private previewZoomPercent = PREVIEW_ZOOM_DEFAULT_PERCENT;
  private props: TemplateManagerPreviewWorkspaceProps;

  constructor(props: TemplateManagerPreviewWorkspaceProps) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "h-full min-h-0";
    this.render();
  }

  public update(props: TemplateManagerPreviewWorkspaceProps): void {
    this.props = props;
    this.render();
  }

  public dispose(): void {
    this.element.replaceChildren();
    this.element.remove();
  }

  private render(): void {
    const { previewFile, previewStatus, t } = this.props;
    const actions = createZoomActions({
      adjust: (delta) => {
        this.previewZoomPercent = offsetPreviewZoomPercent(
          this.previewZoomPercent,
          delta,
        );
        this.render();
      },
      reset: () => {
        this.previewZoomPercent = PREVIEW_ZOOM_DEFAULT_PERCENT;
        this.render();
      },
      zoom: this.previewZoomPercent,
    });
    const content = TemplateManagerPreviewEmptyState({
      title: previewFile
        ? t("da_preview_loading")
        : t("da_preview_empty_title"),
      hint: previewFile
        ? t("da_preview_loading_hint")
        : t("da_preview_empty_hint"),
    }) as HTMLElement;

    this.element.replaceChildren(
      TemplateManagerPreviewSurface({
        actions,
        children: content,
        previewFile,
        previewStatus,
        t,
      }) as HTMLElement,
    );
  }
}

const TemplateManagerPreviewWorkspace = (
  props: TemplateManagerPreviewWorkspaceProps,
): any => new TemplateManagerPreviewWorkspaceView(props).element;

const createZoomActions = ({
  adjust,
  reset,
  zoom,
}: {
  readonly adjust: (delta: number) => void;
  readonly reset: () => void;
  readonly zoom: number;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "flex items-center gap-1 text-xs text-text-secondary";
  root.append(
    createZoomButton("-", () => adjust(-1)),
    createZoomLabel(`${zoom}%`),
    createZoomButton("+", () => adjust(1)),
    createZoomButton("100%", reset),
  );
  return root;
};

const createZoomButton = (
  label: string,
  onClick: () => void,
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rounded-md border border-border px-2 py-1 hover:bg-bg-page";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};

const createZoomLabel = (label: string): HTMLElement => {
  const span = document.createElement("span");
  span.className = "min-w-[44px] text-center font-mono";
  span.textContent = label;
  return span;
};

export default TemplateManagerPreviewWorkspace;
