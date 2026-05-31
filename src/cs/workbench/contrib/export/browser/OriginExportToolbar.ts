import { createButton } from "src/cs/base/browser/ui/button/button";
import { createCogIcon } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import { lxAlertTriangle } from "src/cs/base/browser/ui/cogIcon/icons";
import {
  isOriginExportMode,
  type OriginExportContentKey,
  type OriginExportMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import type {
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/contrib/export/browser/originCanvasExport";

export type OriginExportContentOption = {
  group: "basic" | "derived";
  key: OriginExportContentKey;
  labelKey: string;
};

export type OriginCurveExportSeriesOption = {
  key: string;
  label: string;
  sourceFileId: string;
  sourceSeriesId: string;
};

export type OriginExportContentTranslateFn = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string;

export type ReplaceMatchingOriginSeriesAcrossFilesFn = (options: {
  fileIds?: unknown[];
  sourceSeriesRefs?: Array<{
    fileId?: unknown;
    seriesId?: unknown;
  }>;
}) => {
  matchedFileCount: number;
  matchedSeriesCount: number;
};

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

type OriginExportToolbarProps = {
  curveOptions: OriginCurveExportSeriesOption[];
  hasMixedExportYScales: boolean;
  mode: OriginExportMode;
  onExportOriginZip: () => void | Promise<void>;
  onModeChange: (next: OriginExportMode) => void;
  onOpenInOrigin: () => void | Promise<void>;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  originCanvasExportScope: OriginCanvasExportScope;
  originExportContentOptions: OriginExportContentOption[];
  originFilteredCanvasKind: OriginFilteredCanvasKind;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  resolvedCurveExportMode: OriginCurveExportMode;
  scopedFileIds: string[];
  selectedContentKeys: OriginExportContentKey[];
  selectedCurveOptionKeySet: Set<string>;
  setContentKeys: StateSetter<OriginExportContentKey[]>;
  setOriginCanvasExportScope: StateSetter<OriginCanvasExportScope>;
  setOriginFilteredCanvasKind: StateSetter<OriginFilteredCanvasKind>;
  setResolvedCurveExportMode: (next: OriginCurveExportMode) => void;
  showFilteredCanvasKindSelect: boolean;
  t: OriginExportContentTranslateFn;
};

const DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS: OriginExportContentKey[] = ["iv"];

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const appendText = (
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  className: string,
  text: string,
): HTMLElement => {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
};

const createSelect = <T extends string>({
  className = "w-fit da-neutral-select",
  id,
  options,
  value,
  onChange,
}: {
  className?: string;
  id: string;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (next: string) => void;
}): HTMLSelectElement => {
  const select = document.createElement("select");
  select.id = id;
  select.className = cx("dropdown-field dropdown-field--sm", className);
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));

  for (const option of options) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    select.appendChild(optionElement);
  }

  return select;
};

const normalizeOriginExportContentKeysForOptions = (
  keys: readonly OriginExportContentKey[] | null | undefined,
  options: readonly OriginExportContentOption[],
): OriginExportContentKey[] => {
  const allowedKeys = new Set(options.map((option) => option.key));
  const normalized = (Array.isArray(keys) ? keys : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS)
    .filter((key): key is OriginExportContentKey => allowedKeys.has(key));
  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
};

const createToggleButton = ({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = cx(
    "rounded-md border px-2 py-1 text-xs",
    checked
      ? "border-accent bg-accent/10 text-text-primary"
      : "border-border bg-bg-page/40 text-text-secondary",
  );
  button.setAttribute("aria-pressed", checked ? "true" : "false");
  button.dataset.selected = checked ? "true" : "false";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};

const createContentSelector = ({
  options,
  selectedKeys,
  setSelectedKeys,
  t,
}: {
  options: OriginExportContentOption[];
  selectedKeys: OriginExportContentKey[];
  setSelectedKeys: StateSetter<OriginExportContentKey[]>;
  t: OriginExportContentTranslateFn;
}): HTMLElement => {
  const selectedSet = new Set(normalizeOriginExportContentKeysForOptions(selectedKeys, options));
  const container = document.createElement("div");
  container.className = "flex items-center gap-1 flex-wrap";

  for (const option of options) {
    container.appendChild(createToggleButton({
      checked: selectedSet.has(option.key),
      label: t(option.labelKey),
      onClick: () => {
        setSelectedKeys((previous) => {
          const current = normalizeOriginExportContentKeysForOptions(previous, options);
          if (current.includes(option.key)) {
            return current.length <= 1
              ? current
              : current.filter((key) => key !== option.key);
          }
          return [...current, option.key];
        });
      },
    }));
  }

  return container;
};

const createCurveSelector = ({
  curveOptions,
  selectedCurveOptionKeySet,
  mode,
  onSelectedCurveOptionKeysChange,
  replaceMatchingOriginSeriesAcrossFiles,
  scopedFileIds,
  setMode,
  t,
}: {
  curveOptions: OriginCurveExportSeriesOption[];
  selectedCurveOptionKeySet: Set<string>;
  mode: OriginCurveExportMode;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  scopedFileIds: string[];
  setMode: (next: OriginCurveExportMode) => void;
  t: OriginExportContentTranslateFn;
}): HTMLElement => {
  const container = document.createElement("div");
  container.className = "flex items-center gap-1 flex-wrap";

  const modeSelect = createSelect<OriginCurveExportMode>({
    id: "analysis-origin-curve-export-mode-select",
    value: mode,
    options: [
      { value: "all", label: t("da_origin_curve_export_mode_all") },
      { value: "select", label: t("da_origin_curve_export_mode_select") },
    ],
    onChange: (next) => setMode(next === "select" ? "select" : "all"),
  });
  container.appendChild(modeSelect);

  if (mode !== "select" || curveOptions.length === 0) {
    return container;
  }

  const chipGroup = document.createElement("div");
  chipGroup.className = "flex items-center gap-1 flex-wrap";

  for (const option of curveOptions) {
    const key = String(option.key ?? "");
    if (!key) continue;

    chipGroup.appendChild(createToggleButton({
      checked: selectedCurveOptionKeySet.has(key),
      label: option.label,
      onClick: () => {
        const selectedKeys = curveOptions
          .map((item) => String(item.key ?? ""))
          .filter((item) => item && selectedCurveOptionKeySet.has(item));
        const nextKeys = selectedCurveOptionKeySet.has(key)
          ? selectedKeys.filter((item) => item !== key)
          : [...selectedKeys, key];

        onSelectedCurveOptionKeysChange(nextKeys);
        replaceMatchingOriginSeriesAcrossFiles({
          fileIds: scopedFileIds,
          sourceSeriesRefs: curveOptions
            .filter((item) => nextKeys.includes(String(item.key ?? "")))
            .map((item) => ({
              fileId: item.sourceFileId,
              seriesId: item.sourceSeriesId,
            })),
        });
      },
    }));
  }

  container.appendChild(chipGroup);
  return container;
};

const createToolbarButton = ({
  id,
  label,
  onClick,
  variant,
}: {
  id?: string;
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary";
}): HTMLButtonElement => {
  const button = createButton({
    id,
    label,
    size: "sm",
    variant,
  });
  button.addEventListener("click", onClick);
  return button;
};

const createOriginExportToolbar = ({
  curveOptions,
  hasMixedExportYScales,
  mode,
  onExportOriginZip,
  onModeChange,
  onOpenInOrigin,
  onSelectedCurveOptionKeysChange,
  originCanvasExportScope,
  originExportContentOptions,
  originFilteredCanvasKind,
  replaceMatchingOriginSeriesAcrossFiles,
  resolvedCurveExportMode,
  scopedFileIds,
  selectedContentKeys,
  selectedCurveOptionKeySet,
  setContentKeys,
  setOriginCanvasExportScope,
  setOriginFilteredCanvasKind,
  setResolvedCurveExportMode,
  showFilteredCanvasKindSelect,
  t,
}: OriginExportToolbarProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "rounded-xl border border-border bg-bg-page/40 px-4 py-3";

  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-3 flex-wrap";
  root.appendChild(header);

  const toolbar = document.createElement("div");
  toolbar.className = "flex items-center gap-2 flex-wrap";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("da_analysis_results_tab_export"));
  header.appendChild(toolbar);

  appendText(toolbar, "span", "text-xs text-text-secondary whitespace-nowrap", t("da_origin_export_mode_label"));
  toolbar.appendChild(createSelect<OriginExportMode>({
    id: "analysis-origin-export-mode-select",
    value: mode,
    options: [
      { value: "merged", label: t("da_origin_export_mode_merged") },
      { value: "workbookSheets", label: t("da_origin_export_mode_workbook_sheets") },
      { value: "workbookBooks", label: t("da_origin_export_mode_workbook_books") },
      { value: "separate", label: t("da_origin_export_mode_separate") },
    ],
    onChange: (next) => onModeChange(isOriginExportMode(next) ? next : "merged"),
  }));

  appendText(toolbar, "span", "text-xs text-text-secondary whitespace-nowrap", t("da_origin_canvas_scope_label"));
  toolbar.appendChild(createSelect<OriginCanvasExportScope>({
    id: "analysis-origin-canvas-scope-select",
    value: originCanvasExportScope,
    options: [
      { value: "all", label: t("da_origin_canvas_scope_all") },
      { value: "current", label: t("da_origin_canvas_scope_current") },
      { value: "filtered", label: t("da_origin_canvas_scope_filtered") },
      { value: "selected", label: t("da_origin_canvas_scope_selected") },
    ],
    onChange: (next) => {
      setOriginCanvasExportScope(
        next === "current" || next === "filtered" || next === "selected" || next === "all"
          ? next
          : "selected",
      );
    },
  }));

  if (showFilteredCanvasKindSelect) {
    appendText(toolbar, "span", "text-xs text-text-secondary whitespace-nowrap", t("da_origin_filtered_canvas_kind_label"));
    toolbar.appendChild(createSelect<OriginFilteredCanvasKind>({
      id: "analysis-origin-filtered-canvas-kind-select",
      value: originFilteredCanvasKind,
      options: [
        { value: "transfer", label: t("da_origin_filtered_canvas_kind_transfer") },
        { value: "output", label: t("da_origin_filtered_canvas_kind_output") },
      ],
      onChange: (next) => setOriginFilteredCanvasKind(next === "transfer" ? "transfer" : "output"),
    }));
  }

  appendText(toolbar, "span", "text-xs text-text-secondary whitespace-nowrap", t("da_origin_curve_export_mode_label"));
  toolbar.appendChild(createCurveSelector({
    curveOptions,
    selectedCurveOptionKeySet,
    mode: resolvedCurveExportMode,
    onSelectedCurveOptionKeysChange,
    replaceMatchingOriginSeriesAcrossFiles,
    scopedFileIds,
    setMode: setResolvedCurveExportMode,
    t,
  }));

  appendText(toolbar, "span", "text-xs text-text-secondary whitespace-nowrap", t("da_origin_export_content_label"));
  toolbar.appendChild(createContentSelector({
    options: originExportContentOptions,
    selectedKeys: selectedContentKeys,
    setSelectedKeys: setContentKeys,
    t,
  }));

  const actions = document.createElement("div");
  actions.className = "flex items-center gap-2 flex-wrap";
  actions.appendChild(createToolbarButton({
    id: "analysis-origin-open-btn",
    label: t("da_open_in_origin"),
    onClick: () => void onOpenInOrigin(),
    variant: "primary",
  }));
  actions.appendChild(createToolbarButton({
    label: t("da_export_origin_zip"),
    onClick: () => void onExportOriginZip(),
    variant: "secondary",
  }));
  header.appendChild(actions);

  if (mode === "merged" && hasMixedExportYScales) {
    const hint = document.createElement("div");
    hint.className = "mt-3 space-y-2";
    const box = document.createElement("div");
    box.className = "rounded-lg border border-border bg-bg-page/60 px-3 py-2 text-xs text-text-secondary";
    const row = document.createElement("div");
    row.className = "flex items-start gap-2";
    const icon = createCogIcon({
      icon: lxAlertTriangle,
      size: 14,
      className: "mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500",
    });
    icon.setAttribute("aria-hidden", "true");
    row.appendChild(icon);
    appendText(row, "span", "", t("da_origin_export_mode_mixed_y_scale_split_hint"));
    box.appendChild(row);
    hint.appendChild(box);
    root.appendChild(hint);
  }

  return root;
};

const OriginExportToolbar = (props: OriginExportToolbarProps): any =>
  createOriginExportToolbar(props);

export default OriginExportToolbar;
