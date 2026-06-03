import { localize } from "src/cs/nls";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  createMenuAction,
  createMenuItemLabel,
  renderMenuItems,
} from "src/cs/base/browser/ui/menu/menu";
import { createDropdownButton } from "src/cs/base/browser/ui/dropdown/dropdown";
import type { IAction } from "src/cs/base/common/actions";
import type { DisposableStore } from "src/cs/base/common/lifecycle";
import { lxAlertTriangle, lxChevronDown } from "src/cs/base/common/lxicon";
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
  store?: DisposableStore;
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

const createField = (label: string, control: HTMLElement): HTMLElement => {
  const field = document.createElement("div");
  field.className = "origin_export_toolbar_field";
  appendText(field, "span", "origin_export_toolbar_label", label);
  field.appendChild(control);
  return field;
};

const createDropdown = <T extends string>({
  className = "origin_export_toolbar_select_button",
  id,
  options,
  store,
  value,
  onChange,
}: {
  className?: string;
  id: string;
  options: Array<{ label: string; value: T }>;
  store?: DisposableStore;
  value: T;
  onChange: (next: string) => void;
}): HTMLButtonElement => {
  const selected = options.find((option) => option.value === value) ?? options[0];
  const button = createDropdownButton({
    closeOnContentEvent: "menuitemactionrun",
    label: selected?.label ?? "",
    render: container => renderMenuItems(container, {
      className: "origin_export_toolbar_select_menu",
      items: () => createDropdownActions({
        options,
        value,
        onChange,
      }),
    }),
    surfaceClassName: "origin_export_toolbar_select_menu_surface",
    triggerIcon: lxChevronDown,
  });
  button.domNode.id = id;
  button.domNode.className = `${button.domNode.className} ${className}`.trim();
  store?.add(button);
  return button.domNode;
};

const createDropdownActions = <T extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: Array<{ label: string; value: T }>;
  readonly value: T;
  readonly onChange: (next: string) => void;
}): IAction[] =>
  options.map((option) =>
    createMenuAction({
      id: `origin.export.select.${option.value}`,
      label: option.label,
      left: createMenuItemLabel(option.label),
      run: () => onChange(option.value),
      selected: option.value === value,
      tabIndex: 0,
      value: option.value,
    }),
  );

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
    "origin_export_toolbar_toggle",
    checked && "origin_export_toolbar_toggle--checked",
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
}: {
  options: OriginExportContentOption[];
  selectedKeys: OriginExportContentKey[];
  setSelectedKeys: StateSetter<OriginExportContentKey[]>;
}): HTMLElement => {
  const selectedSet = new Set(normalizeOriginExportContentKeysForOptions(selectedKeys, options));
  const container = document.createElement("div");
  container.className = "origin_export_toolbar_chip_group";

  for (const option of options) {
    container.appendChild(createToggleButton({
      checked: selectedSet.has(option.key),
      label: localize(option.labelKey, option.labelKey),
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
  store,
}: {
  curveOptions: OriginCurveExportSeriesOption[];
  selectedCurveOptionKeySet: Set<string>;
  mode: OriginCurveExportMode;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  scopedFileIds: string[];
  setMode: (next: OriginCurveExportMode) => void;
  store?: DisposableStore;
}): HTMLElement => {
  const container = document.createElement("div");
  container.className = "origin_export_toolbar_button_row origin_export_toolbar_select_actions";

  const modeSelect = createDropdown<OriginCurveExportMode>({
    id: "analysis-origin-curve-export-mode-select",
    store,
    value: mode,
    options: [
      { value: "all", label: localize("da_origin_curve_export_mode_all", "All") },
      { value: "select", label: localize("da_origin_curve_export_mode_select", "Select") },
    ],
    onChange: (next) => setMode(next === "select" ? "select" : "all"),
  });
  container.appendChild(modeSelect);

  if (mode !== "select" || curveOptions.length === 0) {
    return container;
  }

  const chipGroup = document.createElement("div");
  chipGroup.className = "origin_export_toolbar_chip_group";

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
  store,
}: OriginExportToolbarProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "origin_export_toolbar";

  const header = document.createElement("div");
  header.className = "origin_export_toolbar_header";
  root.appendChild(header);

  const toolbar = document.createElement("div");
  toolbar.className = "origin_export_toolbar_controls";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", localize("analysis.results.export", "Export"));
  header.appendChild(toolbar);

  toolbar.appendChild(createField(
    localize("da_origin_export_mode_label", "Export mode"),
    createDropdown<OriginExportMode>({
      id: "analysis-origin-export-mode-select",
      store,
      value: mode,
      options: [
        { value: "merged", label: localize("da_origin_export_mode_merged", "New columns") },
        { value: "workbookSheets", label: localize("da_origin_export_mode_workbook_sheets", "New worksheet") },
        { value: "workbookBooks", label: localize("da_origin_export_mode_workbook_books", "New workbook") },
        { value: "separate", label: localize("da_origin_export_mode_separate", "New window") },
      ],
      onChange: (next) => onModeChange(isOriginExportMode(next) ? next : "merged"),
    }),
  ));

  toolbar.appendChild(createField(
    localize("da_origin_canvas_scope_label", "Scope"),
    createDropdown<OriginCanvasExportScope>({
      id: "analysis-origin-canvas-scope-select",
      store,
      value: originCanvasExportScope,
      options: [
        { value: "all", label: localize("da_origin_canvas_scope_all", "All") },
        { value: "current", label: localize("da_origin_canvas_scope_current", "Current") },
        { value: "filtered", label: localize("da_origin_canvas_scope_filtered", "Filtered") },
        { value: "selected", label: localize("da_origin_canvas_scope_selected", "Choose") },
      ],
      onChange: (next) => {
        setOriginCanvasExportScope(
          next === "current" || next === "filtered" || next === "selected" || next === "all"
            ? next
            : "selected",
        );
      },
    }),
  ));

  if (showFilteredCanvasKindSelect) {
    toolbar.appendChild(createField(
      localize("da_origin_filtered_canvas_kind_label", "Type"),
      createDropdown<OriginFilteredCanvasKind>({
        id: "analysis-origin-filtered-canvas-kind-select",
        store,
        value: originFilteredCanvasKind,
        options: [
          { value: "transfer", label: localize("da_origin_filtered_canvas_kind_transfer", "Transfer") },
          { value: "output", label: localize("da_origin_filtered_canvas_kind_output", "Output") },
        ],
        onChange: (next) => setOriginFilteredCanvasKind(next === "transfer" ? "transfer" : "output"),
      }),
    ));
  }

  toolbar.appendChild(createField(
    localize("da_origin_curve_export_mode_label", "Export curves"),
    createCurveSelector({
      curveOptions,
      selectedCurveOptionKeySet,
      mode: resolvedCurveExportMode,
      onSelectedCurveOptionKeysChange,
      replaceMatchingOriginSeriesAcrossFiles,
      scopedFileIds,
      setMode: setResolvedCurveExportMode,
      store,
    }),
  ));

  toolbar.appendChild(createField(
    localize("da_origin_export_content_label", "Export content"),
    createContentSelector({
      options: originExportContentOptions,
      selectedKeys: selectedContentKeys,
      setSelectedKeys: setContentKeys,
    }),
  ));

  const actions = document.createElement("div");
  actions.className = "origin_export_toolbar_actions";
  actions.appendChild(createToolbarButton({
    id: "analysis-origin-open-btn",
    label: localize("da_open_in_origin", "Open in Origin"),
    onClick: () => void onOpenInOrigin(),
    variant: "primary",
  }));
  actions.appendChild(createToolbarButton({
    label: localize("da_export_origin_zip", "Export ZIP package"),
    onClick: () => void onExportOriginZip(),
    variant: "secondary",
  }));
  header.appendChild(actions);

  if (mode === "merged" && hasMixedExportYScales) {
    const hint = document.createElement("div");
    hint.className = "origin_export_toolbar_hint";
    const box = document.createElement("div");
    box.className = "origin_export_toolbar_hint_box";
    const row = document.createElement("div");
    row.className = "origin_export_toolbar_hint_row";
    const icon = createLxIcon({
      icon: lxAlertTriangle,
      size: 14,
      className: "origin_export_toolbar_hint_icon",
    });
    icon.setAttribute("aria-hidden", "true");
    row.appendChild(icon);
    appendText(row, "span", "", localize("da_origin_export_mode_mixed_y_scale_split_hint", "The current export list mixes Linear and Log Y scales. Origin cannot use both axis types in the same graph layer, so this New columns export will be split into multiple worksheets before plotting."));
    box.appendChild(row);
    hint.appendChild(box);
    root.appendChild(hint);
  }

  return root;
};

const OriginExportToolbar = (props: OriginExportToolbarProps): any =>
  createOriginExportToolbar(props);

export default OriginExportToolbar;
