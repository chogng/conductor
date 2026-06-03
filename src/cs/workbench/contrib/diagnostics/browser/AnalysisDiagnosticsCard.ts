import {
  getCardClassName,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import {
  getInputBoxFieldClassName,
  getInputBoxFieldState,
  getInputBoxNativeClassName,
  getInputBoxWrapperClassName,
} from "src/cs/base/browser/ui/inputbox/inputBox";
import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";

type DropdownOption = {
  disabled?: boolean;
  label?: string | number;
  value: string | number;
};

type AnalysisDiagnosticsCardProps = {
  showDiagnosticsPanel: boolean;
  diagnosticsHeading: string;
  diagnosticsDescription: string;
  diagnosticsContextBadges?: Array<{
    color?: string | null;
    text: string;
  }>;
  plotYUnitLabel: string;
  showCurveProbePanel: boolean;
  plotXFactor: number;
  curveProbeXPlaceholder: string;
  curveProbeXInput: string;
  setCurveProbeXInput: (value: string) => void;
  curveProbeMode: "linear" | "log";
  setCurveProbeMode: (value: "linear" | "log") => void;
  curveProbeRows: any[];
  xTooltipDigits: number;
  resolvedXUnitLabel: string;
  showAreaDiagnosticsControls: boolean;
  areaInput: string;
  setAreaInput: (value: string) => void;
  areaDiagnosticsSummary: {
    areaValue: number | null;
    jon: number | null;
    joff: number | null;
  };
  transferMetricsApplicable: boolean;
  analysisCompactInputWrapperClass: string;
  analysisCompactInputClass: string;
  analysisCompactPageFieldClass: string;
};

const AnalysisDiagnosticsCard = (props: AnalysisDiagnosticsCardProps): any => {
  if (!props.showDiagnosticsPanel) {
    return null;
  }
  return createAnalysisDiagnosticsCard(props);
};

export const createAnalysisDiagnosticsCard = (
  props: AnalysisDiagnosticsCardProps,
): HTMLElement => {
  const card = createCard({
    variant: "panel",
    className: "diagnostics_card",
  });

  if (!props.showCurveProbePanel || props.showAreaDiagnosticsControls) {
    card.append(createHeader(props));
  }

  const body = document.createElement("div");
  body.className = "diagnostics_card_body";
  if (props.showCurveProbePanel) {
    body.append(createCurveProbePanel(props));
  }
  if (props.showAreaDiagnosticsControls) {
    body.append(createAreaControls(props));
  }
  card.append(body);
  return card;
};

const createHeader = ({
  diagnosticsContextBadges = [],
  diagnosticsDescription,
  diagnosticsHeading,
}: AnalysisDiagnosticsCardProps): HTMLElement => {
  const header = document.createElement("div");
  header.className = "diagnostics_card_header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("div");
  title.className = "diagnostics_card_title";
  title.textContent = diagnosticsHeading;
  const description = document.createElement("div");
  description.className = "diagnostics_card_description";
  description.textContent = diagnosticsDescription;
  titleGroup.append(title, description);
  header.append(titleGroup);

  const badges = createContextBadges(diagnosticsContextBadges);
  if (badges) {
    header.append(badges);
  }
  return header;
};

const createCurveProbePanel = (props: AnalysisDiagnosticsCardProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "diagnostics_probe_panel";

  const controls = document.createElement("div");
  controls.className = "diagnostics_probe_controls";

  const leftControls = document.createElement("div");
  leftControls.className = "diagnostics_probe_left_controls";
  leftControls.append(
    createPlainText("span", "diagnostics_nowrap_label", "x:"),
    createInput({
      id: "analysis-curve-probe-x-input",
      value: props.curveProbeXInput,
      onChange: props.setCurveProbeXInput,
      placeholder: props.curveProbeXPlaceholder,
      className: props.analysisCompactInputWrapperClass,
      fieldClassName: `${props.analysisCompactPageFieldClass} diagnostics_probe_x_field`,
      inputClassName: props.analysisCompactInputClass,
    }),
    createPlainText("span", "diagnostics_nowrap_label", "插值:"),
    createDropdown({
      id: "analysis-curve-probe-mode-select",
      size: "sm",
      value: props.curveProbeMode,
      onChange: (next) => props.setCurveProbeMode(next === "log" ? "log" : "linear"),
      options: [
        { value: "linear", label: "线性" },
        { value: "log", label: "对数" },
      ],
      className: "diagnostics_probe_mode_select",
    }),
  );
  controls.append(leftControls);

  const badges = createContextBadges(props.diagnosticsContextBadges ?? []);
  if (badges) {
    controls.append(badges);
  }
  root.append(controls);

  if (props.curveProbeXInput.trim()) {
    root.append(createProbeTable(props));
  }
  return root;
};

const createProbeTable = ({
  curveProbeRows,
  plotXFactor,
  plotYUnitLabel,
  resolvedXUnitLabel,
  xTooltipDigits,
}: AnalysisDiagnosticsCardProps): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "diagnostics_probe_table_wrapper";

  const table = document.createElement("table");
  table.className = "diagnostics_probe_table";
  table.append(createProbeTableHead());

  const tbody = document.createElement("tbody");
  for (const row of curveProbeRows) {
    tbody.append(
      createProbeRow({
        plotXFactor,
        plotYUnitLabel,
        resolvedXUnitLabel,
        row,
        xTooltipDigits,
      }),
    );
  }
  table.append(tbody);
  wrapper.append(table);
  return wrapper;
};

const createProbeTableHead = (): HTMLElement => {
  const thead = document.createElement("thead");
  const row = document.createElement("tr");
  row.className = "diagnostics_probe_table_header_row";
  for (const label of ["曲线", "对应 y", "备注", "参考点"]) {
    const th = document.createElement("th");
    th.className = "diagnostics_probe_table_header_cell";
    th.textContent = label;
    row.append(th);
  }
  thead.append(row);
  return thead;
};

const createProbeRow = ({
  plotXFactor,
  plotYUnitLabel,
  resolvedXUnitLabel,
  row,
  xTooltipDigits,
}: {
  readonly plotXFactor: number;
  readonly plotYUnitLabel: string;
  readonly resolvedXUnitLabel: string;
  readonly row: any;
  readonly xTooltipDigits: number;
}): HTMLElement => {
  const tr = document.createElement("tr");
  tr.className = "diagnostics_probe_table_row";
  const sample = row?.sample ?? null;
  const yValue = Number(sample?.y);
  const left = sample?.left ?? null;
  const right = sample?.right ?? null;
  const bracketText =
    Number.isFinite(left?.x) && Number.isFinite(right?.x)
      ? `[${formatNumber(left.x * plotXFactor, { digits: xTooltipDigits })}, ${formatNumber(right.x * plotXFactor, { digits: xTooltipDigits })}] ${resolvedXUnitLabel}`
      : "n/a";

  const curveCell = document.createElement("td");
  curveCell.className = "diagnostics_probe_table_cell diagnostics_probe_table_cell--primary";
  const curve = document.createElement("span");
  curve.className = "diagnostics_curve_label";
  const color = document.createElement("span");
  color.className = "diagnostics_curve_swatch";
  color.style.backgroundColor = String(row.color ?? "");
  curve.append(color, createPlainText("span", "", String(row.name ?? "")));
  curveCell.append(curve);

  tr.append(
    curveCell,
    createCell(
      Number.isFinite(yValue)
        ? `${formatNumber(yValue, { digits: 6 })} ${plotYUnitLabel}`
        : "n/a",
      "diagnostics_probe_table_cell diagnostics_probe_table_cell--primary",
    ),
    createCell(formatProbeModeLabel(sample?.kind), "diagnostics_probe_table_cell"),
    createCell(bracketText, "diagnostics_probe_table_cell"),
  );
  return tr;
};

const createAreaControls = (props: AnalysisDiagnosticsCardProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "diagnostics_area_controls";
  root.append(createPlainText("div", "diagnostics_area_title", "J Controls"));

  const inputRow = document.createElement("div");
  inputRow.className = "diagnostics_area_input_row";
  inputRow.append(
    createPlainText("span", "diagnostics_nowrap_label", "Area (for J = |I|/Area):"),
    createInput({
      id: "analysis-area-input",
      value: props.areaInput,
      onChange: props.setAreaInput,
      placeholder: "e.g. 1e-4",
      className: props.analysisCompactInputWrapperClass,
      fieldClassName: `${props.analysisCompactPageFieldClass} diagnostics_area_field`,
      inputClassName: props.analysisCompactInputClass,
    }),
  );
  root.append(inputRow, createAreaSummary(props));
  return root;
};

const createAreaSummary = ({
  areaDiagnosticsSummary,
  plotYUnitLabel,
  transferMetricsApplicable,
}: AnalysisDiagnosticsCardProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "diagnostics_area_summary";
  if (areaDiagnosticsSummary.areaValue !== null) {
    root.append(
      createPlainText(
        "div",
        "diagnostics_area_summary_card",
        `Using area: ${formatNumber(areaDiagnosticsSummary.areaValue, { digits: 4 })} cm^2`,
      ),
    );
  } else {
    root.append(
      createPlainText(
        "div",
        "diagnostics_area_summary_card diagnostics_area_summary_card--warning",
        "Enter a positive area to enable current-density conversion.",
      ),
    );
  }

  if (areaDiagnosticsSummary.areaValue !== null && transferMetricsApplicable) {
    root.append(
      createPlainText(
        "div",
        "diagnostics_area_summary_card",
        `Jon: ${areaDiagnosticsSummary.jon !== null ? formatNumber(areaDiagnosticsSummary.jon, { digits: 3 }) : "n/a"} ${plotYUnitLabel}/cm^2 | Joff: ${areaDiagnosticsSummary.joff !== null ? formatNumber(areaDiagnosticsSummary.joff, { digits: 3 }) : "n/a"} ${plotYUnitLabel}/cm^2`,
      ),
    );
  }
  return root;
};

const createContextBadges = (
  diagnosticsContextBadges: Array<{ color?: string | null; text: string }>,
): HTMLElement | null => {
  if (!diagnosticsContextBadges.length) {
    return null;
  }

  const root = document.createElement("div");
  root.className = "diagnostics_context_badges";
  diagnosticsContextBadges.forEach((badge) => {
    const item = document.createElement("div");
    item.className = "diagnostics_context_badge";
    item.title = badge.text;
    const content = document.createElement("span");
    content.className = "diagnostics_context_badge_content";
    if (badge.color) {
      const swatch = document.createElement("span");
      swatch.className = "diagnostics_context_badge_swatch";
      swatch.style.backgroundColor = badge.color;
      content.append(swatch);
    }
    content.append(createPlainText("span", "diagnostics_context_badge_text", badge.color ? badge.text : `${badge.text}：`));
    item.append(content);
    root.append(item);
  });
  return root;
};

const createCard = ({
  className = "",
  variant = "default",
}: {
  readonly className?: string;
  readonly variant?: CardVariant;
}): HTMLElement => {
  const card = document.createElement("div");
  card.className = getCardClassName({ className, variant });
  return card;
};

const createInput = ({
  className = "",
  fieldClassName = "",
  id,
  inputClassName = "",
  onChange,
  placeholder,
  value,
}: {
  readonly className?: string;
  readonly fieldClassName?: string;
  readonly id: string;
  readonly inputClassName?: string;
  readonly onChange: (nextValue: string) => void;
  readonly placeholder?: string;
  readonly value?: string | number;
}): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = getInputBoxWrapperClassName(className);
  wrapper.dataset.style = "inputbox";

  const field = document.createElement("div");
  field.className = getInputBoxFieldClassName({ fieldClassName });
  field.dataset.icon = "without";
  field.dataset.state = getInputBoxFieldState();

  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.value = String(value ?? "");
  input.placeholder = placeholder ?? "";
  input.autocomplete = "off";
  input.className = getInputBoxNativeClassName({ inputClassName });
  input.addEventListener("input", () => onChange(input.value));
  field.append(input);
  wrapper.append(field);
  return wrapper;
};

const createDropdown = ({
  className = "",
  disabled = false,
  id,
  onChange,
  options = [],
  size = "md",
  value,
}: {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly onChange?: (next: string | number) => void;
  readonly options?: DropdownOption[];
  readonly size?: "sm" | "md" | "xl";
  readonly value?: string | number;
}): HTMLSelectElement => {
  const select = document.createElement("select");
  if (id) {
    select.id = id;
  }
  select.disabled = disabled;
  select.value = String(value ?? "");
  select.className = `dropdown-field dropdown-field--${size} ${className}`.trim();
  select.addEventListener("change", () => onChange?.(select.value));
  for (const option of options) {
    const element = document.createElement("option");
    element.value = String(option.value);
    element.disabled = Boolean(option.disabled);
    element.textContent = String(option.label ?? option.value);
    select.append(element);
  }
  return select;
};

const createCell = (text: string, className: string): HTMLTableCellElement => {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = text;
  return cell;
};

const createPlainText = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
};

const formatProbeModeLabel = (kindRaw: unknown): string => {
  const kind = String(kindRaw ?? "");
  if (kind === "exact") return "命中";
  if (kind === "interpolated") return "插值";
  if (kind === "outOfRange") return "超出";
  return "无法计算";
};

export default AnalysisDiagnosticsCard;
