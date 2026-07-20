/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { replaceChildrenIfChanged } from "src/cs/base/browser/dom";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { SelectBox, type SelectBoxOptions } from "src/cs/base/browser/ui/selectBox/selectBox";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type {
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/services/export/common/export";
import type {
  OriginCurveExportSeriesOption,
  OriginExportContentOption,
} from "src/cs/workbench/services/export/common/exportModel";
import {
  type OriginExportContentKey,
  type OriginExportMode,
} from "src/cs/workbench/services/export/common/originExport";

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type OriginExportToolbarProps = {
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
  resolvedCurveExportMode: OriginCurveExportMode;
  selectedContentKeys: OriginExportContentKey[];
  selectedCurveOptionKeySet: Set<string>;
  setContentKeys: StateSetter<OriginExportContentKey[]>;
  setOriginCanvasExportScope: StateSetter<OriginCanvasExportScope>;
  setOriginFilteredCanvasKind: StateSetter<OriginFilteredCanvasKind>;
  setResolvedCurveExportMode: (next: OriginCurveExportMode) => void;
  showFilteredCanvasKindSelect: boolean;
};

export type OriginExportToolbarElement = HTMLElement & {
  readonly dispose: () => void;
  readonly update: (props: OriginExportToolbarProps) => void;
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

const normalizeOriginExportContentKeysForOptions = (
  keys: readonly OriginExportContentKey[] | null | undefined,
  options: readonly OriginExportContentOption[],
): OriginExportContentKey[] => {
  const allowedKeys = new Set(options.map(option => option.key));
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

const createToolbarButton = ({
  className,
  contentClassName,
  id,
  label,
  onClick,
  variant,
}: {
  className?: string;
  contentClassName?: string;
  id?: string;
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary";
}): HTMLButtonElement => {
  const button = createButton({
    className,
    contentClassName,
    id,
    label,
    size: "sm",
    variant,
  });
  button.addEventListener("click", onClick);
  return button;
};

export const createOriginExportToolbar = (
  props: OriginExportToolbarProps,
): OriginExportToolbarElement =>
  new OriginExportToolbarController(props).element;

class OriginExportToolbarController {
  private readonly store = new DisposableStore();
  private readonly root = document.createElement("div") as HTMLElement as OriginExportToolbarElement;
  private readonly header = document.createElement("div");
  private readonly toolbar = document.createElement("div");
  private readonly actions = document.createElement("div");
  private readonly hint = createMixedYScaleHint();
  private readonly curveSelector = document.createElement("div");
  private readonly curveChipGroup = document.createElement("div");
  private readonly contentChipGroup = document.createElement("div");
  private readonly modeSelect: SelectBox<OriginExportMode>;
  private readonly canvasScopeSelect: SelectBox<OriginCanvasExportScope>;
  private readonly filteredKindSelect: SelectBox<OriginFilteredCanvasKind>;
  private readonly curveModeSelect: SelectBox<OriginCurveExportMode>;
  private readonly modeField: HTMLElement;
  private readonly canvasScopeField: HTMLElement;
  private readonly filteredKindField: HTMLElement;
  private readonly curveField: HTMLElement;
  private readonly contentField: HTMLElement;
  private props: OriginExportToolbarProps;
  private modeSelectSignature = "";
  private canvasScopeSelectSignature = "";
  private filteredKindSelectSignature = "";
  private curveModeSelectSignature = "";

  constructor(props: OriginExportToolbarProps) {
    this.props = props;
    this.root.className = "origin_export_toolbar";
    this.header.className = "origin_export_toolbar_header";
    this.toolbar.className = "origin_export_toolbar_controls";
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", localize("origin.export.toolbarAriaLabel", "Export"));
    this.actions.className = "origin_export_toolbar_actions";
    this.curveSelector.className = "origin_export_toolbar_button_row origin_export_toolbar_select_actions";
    this.curveChipGroup.className = "origin_export_toolbar_chip_group";
    this.contentChipGroup.className = "origin_export_toolbar_chip_group";

    this.modeSelect = this.store.add(new SelectBox(this.createModeSelectOptions(props.mode)));
    this.canvasScopeSelect = this.store.add(new SelectBox(
      this.createCanvasScopeSelectOptions(props.originCanvasExportScope),
    ));
    this.filteredKindSelect = this.store.add(new SelectBox(
      this.createFilteredKindSelectOptions(props.originFilteredCanvasKind),
    ));
    this.curveModeSelect = this.store.add(new SelectBox(
      this.createCurveModeSelectOptions(props.resolvedCurveExportMode),
    ));
    this.store.add(this.modeSelect.onDidSelect(value => this.props.onModeChange(value)));
    this.store.add(this.canvasScopeSelect.onDidSelect(value => this.props.setOriginCanvasExportScope(value)));
    this.store.add(this.filteredKindSelect.onDidSelect(value => this.props.setOriginFilteredCanvasKind(value)));
    this.store.add(this.curveModeSelect.onDidSelect(value => this.props.setResolvedCurveExportMode(value)));

    this.modeField = createField(
      localize("origin.exportMode.label", "Export mode"),
      this.modeSelect.domNode,
    );
    this.canvasScopeField = createField(
      localize("origin.canvasScope.label", "Export files"),
      this.canvasScopeSelect.domNode,
    );
    this.filteredKindField = createField(
      localize("origin.filteredCanvasKind.label", "Type"),
      this.filteredKindSelect.domNode,
    );
    this.curveSelector.append(this.curveModeSelect.domNode);
    this.curveField = createField(
      localize("origin.curveExportMode.label", "Export curves"),
      this.curveSelector,
    );
    this.contentField = createField(
      localize("origin.export.contentLabel", "Export content"),
      this.contentChipGroup,
    );

    this.actions.append(
      createToolbarButton({
        className: "origin_export_toolbar_action_button",
        contentClassName: "origin_export_toolbar_action_button_content",
        id: "analysis-origin-open-btn",
        label: localize("origin.open.label", "Open in Origin"),
        onClick: () => void this.props.onOpenInOrigin(),
        variant: "primary",
      }),
      createToolbarButton({
        className: "origin_export_toolbar_action_button",
        contentClassName: "origin_export_toolbar_action_button_content",
        label: localize("origin.zipExport.label", "Export ZIP package"),
        onClick: () => void this.props.onExportOriginZip(),
        variant: "secondary",
      }),
    );
    this.header.append(this.toolbar, this.actions);
    this.root.append(this.header);

    Object.defineProperties(this.root, {
      dispose: {
        value: (): void => this.dispose(),
      },
      update: {
        value: (nextProps: OriginExportToolbarProps): void => this.update(nextProps),
      },
    });

    this.update(props);
  }

  public get element(): OriginExportToolbarElement {
    return this.root;
  }

  private update(props: OriginExportToolbarProps): void {
    this.props = props;
    this.syncSelectBoxes();
    this.renderCurveSelector();
    this.renderContentSelector();
    replaceChildrenIfChanged(
      this.toolbar,
      this.modeField,
      this.canvasScopeField,
      ...(props.showFilteredCanvasKindSelect ? [this.filteredKindField] : []),
      this.curveField,
      this.contentField,
    );
    replaceChildrenIfChanged(
      this.root,
      this.header,
      ...(props.mode === "merged" && props.hasMixedExportYScales ? [this.hint] : []),
    );
  }

  private syncSelectBoxes(): void {
    if (this.modeSelectSignature !== this.props.mode) {
      this.modeSelect.select(this.props.mode);
      this.modeSelectSignature = this.props.mode;
    }
    if (this.canvasScopeSelectSignature !== this.props.originCanvasExportScope) {
      this.canvasScopeSelect.select(this.props.originCanvasExportScope);
      this.canvasScopeSelectSignature = this.props.originCanvasExportScope;
    }
    if (this.filteredKindSelectSignature !== this.props.originFilteredCanvasKind) {
      this.filteredKindSelect.select(this.props.originFilteredCanvasKind);
      this.filteredKindSelectSignature = this.props.originFilteredCanvasKind;
    }
    if (this.curveModeSelectSignature !== this.props.resolvedCurveExportMode) {
      this.curveModeSelect.select(this.props.resolvedCurveExportMode);
      this.curveModeSelectSignature = this.props.resolvedCurveExportMode;
    }
  }

  private renderCurveSelector(): void {
    const {
      curveOptions,
      resolvedCurveExportMode,
      selectedCurveOptionKeySet,
    } = this.props;
    const showCurveOptions = resolvedCurveExportMode === "select" && curveOptions.length > 0;
    if (showCurveOptions) {
      this.curveChipGroup.replaceChildren(...curveOptions
        .map(option => {
          const key = String(option.key ?? "");
          if (!key) {
            return null;
          }
          return createToggleButton({
            checked: selectedCurveOptionKeySet.has(key),
            label: option.label,
            onClick: () => {
              const selectedKeys = this.props.curveOptions
                .map(item => String(item.key ?? ""))
                .filter(item => item && this.props.selectedCurveOptionKeySet.has(item));
              const nextKeys = this.props.selectedCurveOptionKeySet.has(key)
                ? selectedKeys.filter(item => item !== key)
                : [...selectedKeys, key];
              this.props.onSelectedCurveOptionKeysChange(nextKeys);
            },
          });
        })
        .filter((button): button is HTMLButtonElement => button !== null));
    }
    replaceChildrenIfChanged(
      this.curveSelector,
      this.curveModeSelect.domNode,
      ...(showCurveOptions ? [this.curveChipGroup] : []),
    );
  }

  private renderContentSelector(): void {
    const {
      originExportContentOptions,
      selectedContentKeys,
    } = this.props;
    const selectedSet = new Set(normalizeOriginExportContentKeysForOptions(
      selectedContentKeys,
      originExportContentOptions,
    ));
    this.contentChipGroup.replaceChildren(...originExportContentOptions.map(option =>
      createToggleButton({
        checked: selectedSet.has(option.key),
        label: option.label,
        onClick: () => {
          this.props.setContentKeys(previous => {
            const current = normalizeOriginExportContentKeysForOptions(
              previous,
              this.props.originExportContentOptions,
            );
            if (current.includes(option.key)) {
              return current.length <= 1
                ? current
                : current.filter(key => key !== option.key);
            }
            return [...current, option.key];
          });
        },
      }),
    ));
  }

  private createModeSelectOptions(
    value: OriginExportMode,
  ): SelectBoxOptions<OriginExportMode> {
    return {
      ariaLabel: localize("origin.exportMode.label", "Export mode"),
      className: "origin_export_toolbar_select_button",
      id: "analysis-origin-export-mode-select",
      options: [
        { value: "merged", label: localize("origin.exportMode.merged", "New columns") },
        { value: "workbookSheets", label: localize("origin.exportMode.workbookSheets", "New worksheet") },
        { value: "workbookBooks", label: localize("origin.exportMode.workbookBooks", "New workbook") },
        { value: "separate", label: localize("origin.exportMode.separate", "New window") },
      ],
      value,
    };
  }

  private createCanvasScopeSelectOptions(
    value: OriginCanvasExportScope,
  ): SelectBoxOptions<OriginCanvasExportScope> {
    return {
      ariaLabel: localize("origin.canvasScope.label", "Export files"),
      className: "origin_export_toolbar_select_button",
      id: "analysis-origin-canvas-scope-select",
      options: [
        { value: "all", label: localize("origin.canvasScope.all", "All") },
        { value: "current", label: localize("origin.canvasScope.current", "Current") },
        { value: "filtered", label: localize("origin.canvasScope.filtered", "Filtered") },
        { value: "selected", label: localize("origin.canvasScope.selected", "Choose") },
      ],
      value,
    };
  }

  private createFilteredKindSelectOptions(
    value: OriginFilteredCanvasKind,
  ): SelectBoxOptions<OriginFilteredCanvasKind> {
    return {
      ariaLabel: localize("origin.filteredCanvasKind.label", "Type"),
      className: "origin_export_toolbar_select_button",
      id: "analysis-origin-filtered-canvas-kind-select",
      options: [
        { value: "transfer", label: localize("origin.filteredCanvasKind.transfer", "Transfer") },
        { value: "output", label: localize("origin.filteredCanvasKind.output", "Output") },
      ],
      value,
    };
  }

  private createCurveModeSelectOptions(
    value: OriginCurveExportMode,
  ): SelectBoxOptions<OriginCurveExportMode> {
    return {
      ariaLabel: localize("origin.curveExportMode.label", "Export curves"),
      className: "origin_export_toolbar_select_button",
      id: "analysis-origin-curve-export-mode-select",
      options: [
        { value: "all", label: localize("origin.curveExportMode.all", "All") },
        { value: "select", label: localize("origin.curveExportMode.select", "Select") },
      ],
      value,
    };
  }

  private dispose(): void {
    this.store.dispose();
    this.root.replaceChildren();
    this.root.remove();
  }
}

const createMixedYScaleHint = (): HTMLElement => {
  const hint = document.createElement("div");
  hint.className = "origin_export_toolbar_hint";
  const box = document.createElement("div");
  box.className = "origin_export_toolbar_hint_box";
  const row = document.createElement("div");
  row.className = "origin_export_toolbar_hint_row";
  const icon = createLxIcon({
    icon: LxIcon.alertTriangle,
    size: 14,
    className: "origin_export_toolbar_hint_icon",
  });
  icon.setAttribute("aria-hidden", "true");
  row.appendChild(icon);
  appendText(row, "span", "", localize("origin.exportMode.mixedYScaleSplitHint", "The current export list mixes Linear and Log Y scales. Origin cannot use both axis types in the same graph layer, so this New columns export will be split into multiple worksheets before plotting."));
  box.appendChild(row);
  hint.appendChild(box);
  return hint;
};

export default createOriginExportToolbar;
