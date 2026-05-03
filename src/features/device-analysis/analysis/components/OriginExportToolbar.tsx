import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight } from "lucide-react";
import Button from "../../../../components/ui/Button";
import ContentView from "../../../../components/ui/ContentView";
import Dropdown from "../../../../components/ui/Dropdown";
import DropdownField from "../../../../components/ui/DropdownField";
import DropdownTrigger from "../../../../components/ui/DropdownTrigger";
import Menu from "../../../../components/ui/Menu";
import MenuItem from "../../../../components/ui/MenuItem";
import MenuScrollArea from "../../../../components/ui/MenuScrollArea";
import {
  isDeviceAnalysisOriginExportMode,
  type DeviceAnalysisOriginExportContentKey,
  type DeviceAnalysisOriginExportMode,
} from "../lib/originSelectionExport";
import type {
  DeviceAnalysisOriginCanvasExportScope,
  DeviceAnalysisOriginCurveExportMode,
  DeviceAnalysisOriginFilteredCanvasKind,
} from "../useOriginCanvasExport";

export type OriginExportContentOption = {
  group: "basic" | "derived";
  key: DeviceAnalysisOriginExportContentKey;
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

type OriginExportContentMenuGroup = {
  key: OriginExportContentOption["group"];
  labelKey: string;
  options: OriginExportContentOption[];
};

export type ReplaceMatchingOriginSeriesAcrossFilesFn = (options: {
  fileIds?: unknown[];
  sourceSeriesRefs?: Array<{ fileId?: unknown; seriesId?: unknown }>;
}) => { matchedFileCount: number; matchedSeriesCount: number };

type OriginExportToolbarProps = {
  curveOptions: OriginCurveExportSeriesOption[];
  hasMixedExportYScales: boolean;
  mode: DeviceAnalysisOriginExportMode;
  onExportOriginZip: () => void | Promise<void>;
  onModeChange: (next: DeviceAnalysisOriginExportMode) => void;
  onOpenInOrigin: () => void | Promise<void>;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  originCanvasExportScope: DeviceAnalysisOriginCanvasExportScope;
  originExportContentOptions: OriginExportContentOption[];
  originFilteredCanvasKind: DeviceAnalysisOriginFilteredCanvasKind;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  resolvedCurveExportMode: DeviceAnalysisOriginCurveExportMode;
  scopedFileIds: string[];
  selectedContentKeys: DeviceAnalysisOriginExportContentKey[];
  selectedCurveOptionKeySet: Set<string>;
  setContentKeys: React.Dispatch<React.SetStateAction<DeviceAnalysisOriginExportContentKey[]>>;
  setOriginCanvasExportScope: React.Dispatch<React.SetStateAction<DeviceAnalysisOriginCanvasExportScope>>;
  setOriginFilteredCanvasKind: React.Dispatch<React.SetStateAction<DeviceAnalysisOriginFilteredCanvasKind>>;
  setResolvedCurveExportMode: (next: DeviceAnalysisOriginCurveExportMode) => void;
  showFilteredCanvasKindSelect: boolean;
  t: OriginExportContentTranslateFn;
};

const DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS: DeviceAnalysisOriginExportContentKey[] = ["iv"];
const ORIGIN_EXPORT_CONTENT_OPTION_GROUPS: Array<Pick<OriginExportContentMenuGroup, "key" | "labelKey">> = [
  { key: "basic", labelKey: "da_origin_export_content_group_basic" },
  { key: "derived", labelKey: "da_origin_export_content_group_derived" },
];

const normalizeOriginExportContentKeysForOptions = (
  keys: readonly DeviceAnalysisOriginExportContentKey[] | null | undefined,
  options: readonly OriginExportContentOption[],
): DeviceAnalysisOriginExportContentKey[] => {
  const allowedKeys = new Set(options.map((option) => option.key));
  const normalized = (Array.isArray(keys) ? keys : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS).filter(
    (key): key is DeviceAnalysisOriginExportContentKey => allowedKeys.has(key),
  );
  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
};

const OriginExportContentMenu = ({
  options,
  selectedKeys,
  setSelectedKeys,
  t,
}: {
  options: OriginExportContentOption[];
  selectedKeys: DeviceAnalysisOriginExportContentKey[];
  setSelectedKeys: React.Dispatch<React.SetStateAction<DeviceAnalysisOriginExportContentKey[]>>;
  t: OriginExportContentTranslateFn;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedLabels = options
    .filter((option) => selectedSet.has(option.key))
    .map((option) => t(option.labelKey));
  const summary = selectedLabels.join(" + ");
  const toggleContentKey = (key: DeviceAnalysisOriginExportContentKey) => {
    setSelectedKeys((prev) => {
      const current =
        Array.isArray(prev) && prev.length
          ? normalizeOriginExportContentKeysForOptions(prev, options)
          : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
      if (current.includes(key)) {
        if (current.length <= 1) return current;
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  };
  const groupedOptions: OriginExportContentMenuGroup[] = ORIGIN_EXPORT_CONTENT_OPTION_GROUPS
    .map((group) => ({
      key: group.key,
      labelKey: group.labelKey,
      options: options.filter((option) => option.group === group.key),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <div className="ui-select_warp w-fit da-neutral-select" data-style="select">
      <Dropdown isOpen={isOpen} onOpenChange={setIsOpen} anchorRef={anchorRef}>
        {({ setContentRef }) => (
          <>
            <DropdownTrigger
              fieldRef={anchorRef}
              id="device-analysis-origin-export-content-select"
              isOpen={isOpen}
              menuId="device-analysis-origin-export-content-menu"
              data-size="sm"
              onClick={() => setIsOpen((prev) => !prev)}
              fieldClassName="input_field ui-select_field--sm pr-1"
              className="input_native no-focus-outline p-0 text-left cursor-pointer select-none pr-6"
              indicatorClassName="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
              indicator={
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
              }
            >
              <span className="block truncate text-text-primary">{summary}</span>
            </DropdownTrigger>
            <ContentView
              isOpen={isOpen}
              align="left"
              zIndex={80}
              matchAnchorWidth
              triggerId="device-analysis-origin-export-content-select"
              menuId="device-analysis-origin-export-content-menu"
              anchorRef={anchorRef}
              contentRef={setContentRef}
              variant="menu"
            >
              {() => (
                <Menu withScrollArea={false}>
                  <div className="ui-menu__list">
                    {groupedOptions.map((group) => (
                      <div
                        key={group.key}
                        role="group"
                        aria-label={t(group.labelKey)}
                        className="ui-menu__group"
                      >
                        {group.options.map((option) => {
                          const checked = selectedSet.has(option.key);
                          return (
                            <MenuItem
                              key={option.key}
                              role="menuitemcheckbox"
                              aria-checked={checked}
                              data-selected={checked || undefined}
                              onClick={() => toggleContentKey(option.key)}
                              className="group"
                              left={
                                <span className="ui-menu__item-left">
                                  <span className="whitespace-nowrap">{t(option.labelKey)}</span>
                                </span>
                              }
                              right={
                                <span className="ui-menu__item-right">
                                  {checked ? <Check size={14} className="text-accent" /> : null}
                                </span>
                              }
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </Menu>
              )}
            </ContentView>
          </>
        )}
      </Dropdown>
    </div>
  );
};

export const OriginCurveExportMenu = ({
  curveOptions,
  selectedCurveOptionKeySet,
  mode,
  onSelectedCurveOptionKeysChange,
  scopedFileIds,
  setMode,
  replaceMatchingOriginSeriesAcrossFiles,
  t,
}: {
  curveOptions: OriginCurveExportSeriesOption[];
  selectedCurveOptionKeySet: Set<string>;
  mode: DeviceAnalysisOriginCurveExportMode;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  scopedFileIds: string[];
  setMode: (next: DeviceAnalysisOriginCurveExportMode) => void;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  t: OriginExportContentTranslateFn;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuContentRef = useRef<HTMLDivElement | null>(null);
  const selectItemRef = useRef<HTMLDivElement | null>(null);
  const submenuContentRef = useRef<HTMLDivElement | null>(null);
  const selectedSourceIds = useMemo(() => {
    if (mode === "all") {
      return curveOptions.map((option) => option.key).filter(Boolean);
    }
    return curveOptions
      .map((option) => option.key)
      .filter((key) => selectedCurveOptionKeySet.has(key));
  }, [curveOptions, mode, selectedCurveOptionKeySet]);
  const selectedSourceSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
  const displayLabel =
    mode === "all"
      ? t("da_origin_curve_export_mode_all")
      : selectedSourceIds.length
        ? t("da_origin_curve_export_mode_select_count", { count: selectedSourceIds.length })
        : t("da_origin_curve_export_mode_select");
  const applySourceSelection = (sourceIds: string[]) => {
    setMode("select");
    onSelectedCurveOptionKeysChange(sourceIds);
    const selectedKeySet = new Set(sourceIds);
    replaceMatchingOriginSeriesAcrossFiles({
      fileIds: scopedFileIds,
      sourceSeriesRefs: curveOptions
        .filter((option) => selectedKeySet.has(option.key))
        .map((option) => ({
          fileId: option.sourceFileId,
          seriesId: option.sourceSeriesId,
        })),
    });
  };
  const toggleSourceSeries = (seriesKey: string) => {
    const next = selectedSourceSet.has(seriesKey)
      ? selectedSourceIds.filter((item) => item !== seriesKey)
      : [...selectedSourceIds, seriesKey];
    applySourceSelection(next);
  };
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (menuContentRef.current?.contains(target)) return;
      if (submenuContentRef.current?.contains(target)) return;
      setIsOpen(false);
      setShowPicker(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  return (
    <div className="ui-select_warp w-fit da-neutral-select" data-style="select">
      <Dropdown
        isOpen={isOpen}
        onOpenChange={(next) => {
          setIsOpen(next);
          if (next) setShowPicker(mode === "select");
          else setShowPicker(false);
        }}
        anchorRef={anchorRef}
        closeOnClickOutside={false}
      >
        {({ setContentRef }) => (
          <>
            <DropdownTrigger
              fieldRef={anchorRef}
              id="device-analysis-origin-curve-export-mode-select"
              isOpen={isOpen}
              menuId="device-analysis-origin-curve-export-mode-menu"
              data-size="sm"
              onClick={() => setIsOpen((prev) => !prev)}
              fieldClassName="input_field ui-select_field--sm pr-1"
              className="input_native no-focus-outline p-0 text-left cursor-pointer select-none pr-6"
              indicatorClassName="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
              indicator={
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
              }
            >
              <span className="block truncate text-text-primary">{displayLabel}</span>
            </DropdownTrigger>
            <ContentView
              isOpen={isOpen}
              align="left"
              zIndex={80}
              triggerId="device-analysis-origin-curve-export-mode-select"
              menuId="device-analysis-origin-curve-export-mode-menu"
              anchorRef={anchorRef}
              contentRef={(node) => {
                menuContentRef.current = node;
                setContentRef(node);
              }}
              variant="menu"
            >
              {() => (
                <Menu withScrollArea={false}>
                  <div className="ui-menu__list">
                    <MenuItem
                      data-selected={mode === "all" || undefined}
                      onClick={() => {
                        setMode("all");
                        setShowPicker(false);
                        setIsOpen(false);
                      }}
                      onMouseEnter={() => setShowPicker(false)}
                      left={
                        <span className="ui-menu__item-left whitespace-nowrap">
                          {t("da_origin_curve_export_mode_all")}
                        </span>
                      }
                      right={
                        <span className="ui-menu__item-right">
                          {mode === "all" ? <Check size={14} className="text-accent" /> : null}
                        </span>
                      }
                    />
                    <MenuItem
                      ref={selectItemRef}
                      data-selected={mode === "select" || undefined}
                      onClick={() => {
                        setMode("select");
                        setShowPicker(true);
                      }}
                      onMouseEnter={() => setShowPicker(true)}
                      left={
                        <span className="ui-menu__item-left whitespace-nowrap">
                          {t("da_origin_curve_export_mode_select")}
                        </span>
                      }
                      right={
                        <span className="ui-menu__item-right">
                          <ChevronRight size={14} />
                        </span>
                      }
                    />
                  </div>
                </Menu>
              )}
            </ContentView>
            {isOpen && showPicker && curveOptions.length > 0 && selectItemRef.current ? (
              <ContentView
                isOpen
                align="left"
                side="right"
                zIndex={90}
                triggerId="device-analysis-origin-curve-export-mode-menu-select"
                menuId="device-analysis-origin-curve-export-picker-menu"
                anchorRef={selectItemRef}
                contentRef={(node) => {
                  submenuContentRef.current = node;
                }}
                variant="menu"
              >
                {() => (
                  <Menu withScrollArea={false}>
                    <MenuScrollArea>
                      <div className="ui-menu__list">
                        {curveOptions.map((option) => {
                          const key = String(option?.key ?? "");
                          const checked = selectedSourceSet.has(key);
                          return (
                            <MenuItem
                              key={key}
                              role="menuitemcheckbox"
                              aria-checked={checked}
                              data-selected={checked || undefined}
                              onClick={() => toggleSourceSeries(key)}
                              left={
                                <span className="ui-menu__item-left min-w-0">
                                  <span className="truncate">{option.label}</span>
                                </span>
                              }
                              right={
                                <span className="ui-menu__item-right">
                                  {checked ? <Check size={14} className="text-accent" /> : null}
                                </span>
                              }
                            />
                          );
                        })}
                      </div>
                    </MenuScrollArea>
                  </Menu>
                )}
              </ContentView>
            ) : null}
          </>
        )}
      </Dropdown>
    </div>
  );
};

const OriginExportToolbar = ({
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
}: OriginExportToolbarProps) => (
  <div className="rounded-xl border border-border bg-bg-page/40 px-4 py-3">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div
        role="toolbar"
        aria-label={t("da_analysis_results_tab_export")}
        className="flex items-center gap-2 flex-wrap"
      >
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {t("da_origin_export_mode_label")}
        </span>
        <DropdownField
          id="device-analysis-origin-export-mode-select"
          size="sm"
          value={mode}
          onChange={(next: any) => onModeChange(isDeviceAnalysisOriginExportMode(next) ? next : "merged")}
          options={[
            {
              value: "merged",
              label: t("da_origin_export_mode_merged"),
            },
            {
              value: "workbookSheets",
              label: t("da_origin_export_mode_workbook_sheets"),
            },
            {
              value: "workbookBooks",
              label: t("da_origin_export_mode_workbook_books"),
            },
            {
              value: "separate",
              label: t("da_origin_export_mode_separate"),
            },
          ]}
          className="w-fit da-neutral-select"
          stableWidth
          data-cta="Device Analysis"
          data-cta-position="export-pane"
          data-cta-copy="origin export mode"
        />
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {t("da_origin_canvas_scope_label")}
        </span>
        <DropdownField
          id="device-analysis-origin-canvas-scope-select"
          size="sm"
          value={originCanvasExportScope}
          onChange={(next: any) => {
            const normalizedScope =
              next === "current" || next === "filtered" || next === "selected" || next === "all"
                ? next
                : "selected";
            setOriginCanvasExportScope(normalizedScope);
          }}
          options={[
            {
              value: "all",
              label: t("da_origin_canvas_scope_all"),
            },
            {
              value: "current",
              label: t("da_origin_canvas_scope_current"),
            },
            {
              value: "filtered",
              label: t("da_origin_canvas_scope_filtered"),
            },
            {
              value: "selected",
              label: t("da_origin_canvas_scope_selected"),
            },
          ]}
          className="w-fit da-neutral-select"
          stableWidth
          data-cta="Device Analysis"
          data-cta-position="export-pane"
          data-cta-copy="origin canvas export scope"
        />
        {showFilteredCanvasKindSelect ? (
          <>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {t("da_origin_filtered_canvas_kind_label")}
            </span>
            <DropdownField
              id="device-analysis-origin-filtered-canvas-kind-select"
              size="sm"
              value={originFilteredCanvasKind}
              onChange={(next: any) => {
                setOriginFilteredCanvasKind(next === "transfer" ? "transfer" : "output");
              }}
              options={[
                {
                  value: "transfer",
                  label: t("da_origin_filtered_canvas_kind_transfer"),
                },
                {
                  value: "output",
                  label: t("da_origin_filtered_canvas_kind_output"),
                },
              ]}
              className="w-fit da-neutral-select"
              stableWidth
              data-cta="Device Analysis"
              data-cta-position="export-pane"
              data-cta-copy="origin filtered canvas kind"
            />
          </>
        ) : null}
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {t("da_origin_curve_export_mode_label")}
        </span>
        <OriginCurveExportMenu
          curveOptions={curveOptions}
          selectedCurveOptionKeySet={selectedCurveOptionKeySet}
          mode={resolvedCurveExportMode}
          onSelectedCurveOptionKeysChange={onSelectedCurveOptionKeysChange}
          scopedFileIds={scopedFileIds}
          setMode={setResolvedCurveExportMode}
          replaceMatchingOriginSeriesAcrossFiles={replaceMatchingOriginSeriesAcrossFiles}
          t={t}
        />
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {t("da_origin_export_content_label")}
        </span>
        <OriginExportContentMenu
          options={originExportContentOptions}
          selectedKeys={selectedContentKeys}
          setSelectedKeys={setContentKeys}
          t={t}
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            void onOpenInOrigin();
          }}
        >
          {t("da_open_in_origin")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void onExportOriginZip();
          }}
        >
          {t("da_export_origin_zip")}
        </Button>
      </div>
    </div>
    {mode === "merged" && hasMixedExportYScales ? (
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-border bg-bg-page/60 px-3 py-2 text-xs text-text-secondary">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            <span>{t("da_origin_export_mode_mixed_y_scale_split_hint")}</span>
          </div>
        </div>
      </div>
    ) : null}
  </div>
);

export default OriginExportToolbar;
