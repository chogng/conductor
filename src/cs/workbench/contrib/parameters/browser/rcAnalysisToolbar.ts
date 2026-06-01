import { createButton } from "src/cs/base/browser/ui/button/button";
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
  toolbar.className = "parameters_toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("da_rc_toolbar_aria_label"));

  const row = document.createElement("div");
  row.className = "parameters_toolbar_row";

  const selectorGroup = document.createElement("div");
  selectorGroup.className = "parameters_toolbar_selector";

  const label = document.createElement("label");
  label.className = "parameters_toolbar_label";
  label.htmlFor = "analysis-rc-bias-select";
  label.textContent = t("da_rc_bias_label");

  const select = document.createElement("select");
  select.id = "analysis-rc-bias-select";
  select.className = "parameters_toolbar_select da-neutral-select";
  select.value = selectedBiasKey;
  select.disabled = isPending;

  for (const option of biasOptions) {
    const item = document.createElement("option");
    item.value = option.key;
    item.textContent = option.label;
    item.selected = option.key === selectedBiasKey;
    select.appendChild(item);
  }

  const button = createButton({
    disabled: isPending || !rowCount,
    label: isPending ? t("da_rc_run_pending") : t("da_rc_run_button"),
    size: "sm",
    variant: "primary",
  });

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
