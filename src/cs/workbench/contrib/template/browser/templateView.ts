import { createButton } from "src/cs/base/browser/ui/button/button";
import {
  getInputFieldClassName,
  getInputFieldState,
  getInputNativeClassName,
} from "src/cs/base/browser/ui/input/input";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import type {
  PreviewFileLike,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import DataPreviewArea from "src/cs/workbench/contrib/data/DataPreviewArea";
import TemplateManagerPreviewWorkspace from "./templatePreviewWorkspace";
import {
  createEmptyTemplateConfig,
  type TemplateConfig,
} from "src/cs/workbench/contrib/template/common/templateManagerUtils";

export type TemplateManagerProps = {
  readonly t: TranslateFn;
  previewFile?: PreviewFileLike | null;
  previewStatus?: Partial<SessionPreviewStatus> | null;
  rawData?: RawDataEntry[];
  getPreviewRow?: (rowIndex: number) => unknown;
  ensurePreviewCells?: (fileId: string, cells: Array<{
    colIndex: number;
    rowIndex: number;
  }>) => Promise<unknown> | unknown;
  ensurePreviewRows?: (fileId: string, startRow: number, endRow: number) => Promise<unknown> | unknown;
  onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  getPreviewRowsVersion?: () => number;
  analysisSettings?: Record<string, unknown> | null;
  onUpdateSettings?: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

const createField = ({
  label,
  name,
  value,
  onInput,
}: {
  label: string;
  name: keyof TemplateConfig;
  value: string;
  onInput: (name: keyof TemplateConfig, value: string) => void;
}): HTMLElement => {
  const wrapper = document.createElement("label");
  wrapper.className = "template_field";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  const input = document.createElement("input");
  input.className = `${getInputNativeClassName()} ${getInputFieldClassName({ fieldClassName: "template_field_input" })}`;
  input.dataset.state = getInputFieldState();
  input.value = value;
  input.autocomplete = "off";
  input.addEventListener("input", () => onInput(name, input.value));

  wrapper.append(labelElement, input);
  return wrapper;
};

const createSectionTitle = (text: string): HTMLElement => {
  const title = document.createElement("h3");
  title.className = "template_section_title";
  title.textContent = text;
  return title;
};

export const createTemplateManager = ({
  previewFile,
  previewStatus,
  rawData = [],
  getPreviewRow,
  ensurePreviewRows,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  subscribePreviewRowsVersion,
  getPreviewRowsVersion,
  t,
}: TemplateManagerProps): HTMLElement => {
  let config = createEmptyTemplateConfig();
  const containerRef = { current: null as HTMLElement | null };

  const setConfig = (next: TemplateConfig | ((previous: TemplateConfig) => TemplateConfig)) => {
    config = typeof next === "function" ? next(config) : next;
  };

  const writeFieldFromPreview = (field: string, value: string) => {
    if (!(field in config)) return;
    setConfig((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const panel = document.createElement("div");
  panel.className = "template_manager";
  containerRef.current = panel;

  const header = document.createElement("div");
  header.className = "template_manager_header";
  header.append(createSectionTitle(t("da_data_extraction_template")));

  const actionBar = document.createElement("div");
  actionBar.className = "template_manager_actions";
  const applyButton = createButton({
    label: t("da_apply_template"),
    size: "sm",
    variant: "primary",
  });
  applyButton.addEventListener("click", () => {
    void onTemplateApplied?.({ ...config });
  });
  const applyNewButton = createButton({
    label: t("da_apply_new_files"),
    size: "sm",
    variant: "secondary",
  });
  applyNewButton.addEventListener("click", () => {
    void onTemplateAppliedIncremental?.({ ...config });
  });
  actionBar.append(applyButton, applyNewButton);
  header.append(actionBar);
  panel.append(header);

  const form = document.createElement("div");
  form.className = "template_form";
  form.append(
    createField({
      label: t("da_template_name"),
      name: "name",
      value: config.name,
      onInput: writeFieldFromPreview as (name: keyof TemplateConfig, value: string) => void,
    }),
    createField({
      label: t("da_template_x_start"),
      name: "xDataStart",
      value: config.xDataStart,
      onInput: writeFieldFromPreview as (name: keyof TemplateConfig, value: string) => void,
    }),
    createField({
      label: t("da_template_x_end"),
      name: "xDataEnd",
      value: config.xDataEnd,
      onInput: writeFieldFromPreview as (name: keyof TemplateConfig, value: string) => void,
    }),
    createField({
      label: t("da_template_y_legend_start"),
      name: "yLegendStart",
      value: config.yLegendStart,
      onInput: writeFieldFromPreview as (name: keyof TemplateConfig, value: string) => void,
    }),
    createField({
      label: t("da_template_y_legend_count"),
      name: "yLegendCount",
      value: config.yLegendCount,
      onInput: writeFieldFromPreview as (name: keyof TemplateConfig, value: string) => void,
    }),
  );

  const meta = document.createElement("p");
  meta.className = "template_meta";
  meta.textContent = t("da_template_file_count", { count: rawData.length });
  form.append(meta);

  const left = document.createElement("div");
  left.className = "template_config_panel";
  left.append(form);

  const preview = TemplateManagerPreviewWorkspace({
    containerRef,
    config,
    ensurePreviewRows,
    getPreviewRow,
    getPreviewRowsVersion,
    interactive: true,
    previewFile,
    previewStatus,
    setConfig,
    subscribePreviewRowsVersion,
    t: t as TranslateFn,
    writeFieldFromPreview,
  });

  panel.append(DataPreviewArea({
    tabPanel: left,
    tablePreview: preview,
  }));

  return panel;
};

const TemplateManager = (props: TemplateManagerProps): any =>
  createTemplateManager(props);

export default TemplateManager;
