import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { OriginCurveExportSeriesOption } from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";

export type RcAnalysisToolbarOptions = {
  biasOptions: OriginCurveExportSeriesOption[];
  isPending: boolean;
  onAnalyze: () => void | Promise<void>;
  onBiasChange: (nextKey: string) => void;
  rowCount: number;
  selectedBiasKey: string;
  t: TranslateFn;
};

export const renderRcAnalysisToolbar = (
  container: HTMLElement,
  {
    biasOptions,
    isPending,
    onAnalyze,
    onBiasChange,
    rowCount,
    selectedBiasKey,
    t,
  }: RcAnalysisToolbarOptions,
): (() => void) => {
  container.textContent = "";

  const toolbar = document.createElement("div");
  toolbar.className = "rounded-xl border border-border bg-bg-page/40 px-4 py-3";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("da_rc_toolbar_aria_label"));

  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-3 flex-wrap";

  const selectorGroup = document.createElement("div");
  selectorGroup.className = "flex items-center gap-2 flex-wrap";

  const label = document.createElement("label");
  label.className = "text-xs text-text-secondary whitespace-nowrap";
  label.htmlFor = "analysis-rc-bias-select";
  label.textContent = t("da_rc_bias_label");

  const select = document.createElement("select");
  select.id = "analysis-rc-bias-select";
  select.className =
    "h-8 rounded-lg border border-border bg-bg-page px-2 py-1 text-xs text-text-primary da-neutral-select";
  select.value = selectedBiasKey;
  select.disabled = isPending;

  for (const option of biasOptions) {
    const item = document.createElement("option");
    item.value = option.key;
    item.textContent = option.label;
    item.selected = option.key === selectedBiasKey;
    select.appendChild(item);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "action-btn action-btn--primary action-btn--sm";
  button.disabled = isPending || !rowCount;
  button.textContent = isPending ? t("da_rc_run_pending") : t("da_rc_run_button");

  const onSelectChange = () => onBiasChange(String(select.value ?? ""));
  const onButtonClick = () => {
    void onAnalyze();
  };

  select.addEventListener("change", onSelectChange);
  button.addEventListener("click", onButtonClick);

  selectorGroup.append(label, select);
  row.append(selectorGroup, button);
  toolbar.appendChild(row);
  container.appendChild(toolbar);

  return () => {
    select.removeEventListener("change", onSelectChange);
    button.removeEventListener("click", onButtonClick);
    container.textContent = "";
  };
};
