import {
  getCardClassName,
  getCardDataAttributes,
  type CardVariant,
} from "cs/base/browser/ui/card/card";
import {
  getInputDataAttributes,
  getInputFieldClassName,
  getInputFieldState,
  getInputNativeClassName,
  getInputWrapperClassName,
} from "cs/base/browser/ui/input/input";
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
    className: "flex min-w-0 flex-col",
  });

  if (!props.showCurveProbePanel || props.showAreaDiagnosticsControls) {
    card.append(createHeader(props));
  }

  const body = document.createElement("div");
  body.className = "flex flex-col gap-3";
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
  header.className = "mb-3 flex items-center justify-between gap-2";

  const titleGroup = document.createElement("div");
  const title = document.createElement("div");
  title.className = "text-xs font-semibold text-text-primary";
  title.textContent = diagnosticsHeading;
  const description = document.createElement("div");
  description.className = "text-[11px] text-text-secondary";
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
  root.className = "flex flex-col gap-2 text-xs text-text-secondary";

  const controls = document.createElement("div");
  controls.className = "flex items-center justify-between gap-3 flex-wrap";

  const leftControls = document.createElement("div");
  leftControls.className = "flex items-center gap-2 flex-wrap";
  leftControls.append(
    createPlainText("span", "whitespace-nowrap", "x:"),
    createInput({
      id: "analysis-curve-probe-x-input",
      value: props.curveProbeXInput,
      onChange: props.setCurveProbeXInput,
      placeholder: props.curveProbeXPlaceholder,
      className: props.analysisCompactInputWrapperClass,
      fieldClassName: `${props.analysisCompactPageFieldClass} !w-[110px]`,
      inputClassName: props.analysisCompactInputClass,
    }),
    createPlainText("span", "whitespace-nowrap", "插值:"),
    createDropdown({
      id: "analysis-curve-probe-mode-select",
      size: "sm",
      value: props.curveProbeMode,
      onChange: (next) => props.setCurveProbeMode(next === "log" ? "log" : "linear"),
      options: [
        { value: "linear", label: "线性" },
        { value: "log", label: "对数" },
      ],
      className: "w-[96px]",
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
  wrapper.className = "overflow-x-auto rounded-lg border border-border/60 bg-bg-page/60";

  const table = document.createElement("table");
  table.className = "w-full min-w-[520px] table-fixed border-collapse text-xs";
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
  row.className = "border-b border-border text-text-secondary";
  for (const label of ["曲线", "对应 y", "备注", "参考点"]) {
    const th = document.createElement("th");
    th.className = "p-2 text-left font-semibold";
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
  tr.className = "border-b border-border/50 last:border-b-0";
  const sample = row?.sample ?? null;
  const yValue = Number(sample?.y);
  const left = sample?.left ?? null;
  const right = sample?.right ?? null;
  const bracketText =
    Number.isFinite(left?.x) && Number.isFinite(right?.x)
      ? `[${formatNumber(left.x * plotXFactor, { digits: xTooltipDigits })}, ${formatNumber(right.x * plotXFactor, { digits: xTooltipDigits })}] ${resolvedXUnitLabel}`
      : "n/a";

  const curveCell = document.createElement("td");
  curveCell.className = "p-2 text-text-primary";
  const curve = document.createElement("span");
  curve.className = "inline-flex items-center gap-2";
  const color = document.createElement("span");
  color.className = "inline-block h-2.5 w-2.5 rounded-sm";
  color.style.backgroundColor = String(row.color ?? "");
  curve.append(color, createPlainText("span", "", String(row.name ?? "")));
  curveCell.append(curve);

  tr.append(
    curveCell,
    createCell(
      Number.isFinite(yValue)
        ? `${formatNumber(yValue, { digits: 6 })} ${plotYUnitLabel}`
        : "n/a",
      "p-2 text-text-primary",
    ),
    createCell(formatProbeModeLabel(sample?.kind), "p-2"),
    createCell(bracketText, "p-2"),
  );
  return tr;
};

const createAreaControls = (props: AnalysisDiagnosticsCardProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "rounded-lg border border-border/60 bg-bg-surface px-3 py-2";
  root.append(createPlainText("div", "mb-2 text-[11px] font-semibold text-text-primary", "J Controls"));

  const inputRow = document.createElement("div");
  inputRow.className = "flex items-center gap-2 text-xs text-text-secondary flex-wrap";
  inputRow.append(
    createPlainText("span", "whitespace-nowrap", "Area (for J = |I|/Area):"),
    createInput({
      id: "analysis-area-input",
      value: props.areaInput,
      onChange: props.setAreaInput,
      placeholder: "e.g. 1e-4",
      className: props.analysisCompactInputWrapperClass,
      fieldClassName: `${props.analysisCompactPageFieldClass} !w-[100px]`,
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
  root.className = "mt-2 flex flex-col gap-2 text-xs text-text-secondary";
  if (areaDiagnosticsSummary.areaValue !== null) {
    root.append(
      createPlainText(
        "div",
        "rounded-lg border border-border/60 bg-bg-page/60 px-3 py-2 text-text-primary",
        `Using area: ${formatNumber(areaDiagnosticsSummary.areaValue, { digits: 4 })} cm^2`,
      ),
    );
  } else {
    root.append(
      createPlainText(
        "div",
        "rounded-lg border border-dashed border-amber-400/60 bg-amber-500/5 px-3 py-2 text-amber-600",
        "Enter a positive area to enable current-density conversion.",
      ),
    );
  }

  if (areaDiagnosticsSummary.areaValue !== null && transferMetricsApplicable) {
    root.append(
      createPlainText(
        "div",
        "rounded-lg border border-border/60 bg-bg-page/60 px-3 py-2 text-text-primary",
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
  root.className =
    "flex max-w-full items-center justify-end gap-3 flex-wrap text-xs text-text-secondary";
  diagnosticsContextBadges.forEach((badge) => {
    const item = document.createElement("div");
    item.className = "max-w-full";
    item.title = badge.text;
    const content = document.createElement("span");
    content.className = "flex items-center gap-2.5";
    if (badge.color) {
      const swatch = document.createElement("span");
      swatch.className = "inline-block h-3 w-3 shrink-0 rounded-sm";
      swatch.style.backgroundColor = badge.color;
      content.append(swatch);
    }
    content.append(createPlainText("span", "block truncate", badge.color ? badge.text : `${badge.text}：`));
    item.append(content);
    root.append(item);
  });
  return root;
};

const createCard = ({
  className = "",
  cta,
  ctaCopy,
  ctaPosition,
  variant = "default",
}: {
  readonly className?: string;
  readonly cta?: string;
  readonly ctaCopy?: string;
  readonly ctaPosition?: string;
  readonly variant?: CardVariant;
}): HTMLElement => {
  const card = document.createElement("div");
  for (const [name, value] of Object.entries(
    getCardDataAttributes({ cta, ctaCopy, ctaPosition }),
  )) {
    if (value !== undefined) {
      card.setAttribute(name, String(value));
    }
  }
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
  wrapper.className = getInputWrapperClassName(className);
  wrapper.dataset.style = "input";

  const field = document.createElement("div");
  field.className = getInputFieldClassName({ fieldClassName, size: "md" });
  field.dataset.icon = "without";
  field.dataset.state = getInputFieldState();
  for (const [name, dataValue] of Object.entries(getInputDataAttributes({}))) {
    if (dataValue !== undefined) {
      field.setAttribute(name, String(dataValue));
    }
  }

  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.value = String(value ?? "");
  input.placeholder = placeholder ?? "";
  input.autocomplete = "off";
  input.className = getInputNativeClassName({ inputClassName });
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
