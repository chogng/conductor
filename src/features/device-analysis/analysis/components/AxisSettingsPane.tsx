import { useEffect, useState, type KeyboardEvent } from "react";
import { ArrowLeft } from "lucide-react";
import Button from "cs/base/browser/ui/Button/Button";
import Card from "cs/base/browser/ui/Card/Card";
import DropdownField from "cs/base/browser/ui/DropdownField/DropdownField";
import Input from "cs/base/browser/ui/Input/Input";
import ScrollArea from "cs/base/browser/ui/ScrollArea/ScrollArea";
import Switch from "cs/base/browser/ui/Switch/Switch";
import type { TranslateFn } from "../../../../context/language";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "../lib/originPlotOptions";

type AxisSettingsPaneProps = {
  axis: any;
  effectiveYScale: string;
  plotYUnitLabel: string;
  setAxis: (value: any) => void;
  yScaleWarning: string | null;
  xTooltipDigitsAuto: number;
  originOpenPlotOptions: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: Partial<OriginPlotOptions>) => void;
  onClose: () => void;
  analysisCompactInputWrapperClass: string;
  analysisCompactInputClass: string;
  t: TranslateFn;
};

const resetAxisSettings = (setAxis: (value: any) => void) => {
  setAxis((prev: any) => ({
    ...prev,
    xMin: "",
    xMax: "",
    xTicks: "auto",
    xTickCount: 6,
    xStep: "",
    xTooltipDigits: "",
    yMin: "",
    yMax: "",
    yScale: "linear",
    yTicks: "auto",
    yTickCount: 6,
    yStep: "",
    yDecadeStep: 1,
    showGrid: true,
    showMajorTicks: true,
    showMinorTicks: true,
    minorTickCount: "",
    tickLabelFontSize: "",
    axisTitleFontSize: "",
    legendFontSize: "",
    originTickLabelOffset: "",
    originAxisTitleGap: "",
  }));
};

export default function AxisSettingsPane({
  axis,
  effectiveYScale,
  plotYUnitLabel,
  setAxis,
  yScaleWarning,
  xTooltipDigitsAuto,
  originOpenPlotOptions,
  onOriginOpenPlotOptionsChange,
  onClose,
  analysisCompactInputWrapperClass,
  analysisCompactInputClass,
  t,
}: AxisSettingsPaneProps) {
  const compactInputWidth = "w-[132px]";
  const compactInputFieldClass =
    "!h-8 !gap-0 border border-border px-2 py-1";
  const sectionClassName =
    "overflow-hidden rounded-md border border-border/60 bg-bg-surface";
  const sectionHeaderClassName =
    "border-b border-border/50 px-3 py-2 text-xs font-semibold text-text-secondary";
  const settingRowClassName =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0";
  const normalizedOriginPlotOptions = normalizeOriginPlotOptions(
    originOpenPlotOptions,
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );
  const minorTicksEnabled = axis?.showMinorTicks !== false;
  const [lineWidthDraft, setLineWidthDraft] = useState(
    String(normalizedOriginPlotOptions.lineWidth),
  );
  const originPlotTypeOptions = [
    { value: "200", label: t("da_settings_origin_plot_type_200") },
    { value: "201", label: t("da_settings_origin_plot_type_201") },
    { value: "202", label: t("da_settings_origin_plot_type_202") },
  ];

  useEffect(() => {
    setLineWidthDraft(String(normalizedOriginPlotOptions.lineWidth));
  }, [normalizedOriginPlotOptions.lineWidth]);

  const blurInputOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  };

  const handleXAxisTickModeChange = (next: any) => {
    setAxis((prev: any) => ({
      ...prev,
      xTicks: next,
      xTickCount: next === "nice" ? prev.xTickCount : "",
      xStep: next === "step" ? prev.xStep : "",
    }));
  };

  const handleYAxisTickModeChange = (next: any) => {
    setAxis((prev: any) => ({
      ...prev,
      yTicks: next,
      yTickCount: next === "nice" ? prev.yTickCount : "",
      yStep: next === "step" ? prev.yStep : "",
      yDecadeStep: next === "decades" ? prev.yDecadeStep : "",
    }));
  };

  const commitLineWidthDraft = (nextDraft = lineWidthDraft) => {
    const normalized = normalizeOriginPlotOptions(
      { lineWidth: nextDraft },
      normalizedOriginPlotOptions,
    );
    if (normalized.lineWidth === normalizedOriginPlotOptions.lineWidth) {
      setLineWidthDraft(String(normalized.lineWidth));
      return;
    }
    setLineWidthDraft(String(normalized.lineWidth));
    onOriginOpenPlotOptionsChange?.({ lineWidth: normalized.lineWidth });
  };

  const handleLineWidthKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitLineWidthDraft(event.currentTarget.value);
    event.currentTarget.blur();
  };

  return (
    <Card variant="panel" className="h-full min-h-0 flex flex-col !pr-0">
      <div className="mb-3 pr-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-text-secondary hover:text-text-primary"
            title={t("da_chart_plot_settings_title")}
            aria-label={t("da_chart_plot_settings_title")}
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-text-primary">
              {t("da_chart_plot_settings_title")}
            </div>
          </div>
          <Button
            variant="text"
            size="sm"
            onClick={() => resetAxisSettings(setAxis)}
            className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary"
          >
            {t("da_chart_axis_reset")}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0" viewportClassName="pr-4" axis="y">
        <div className="flex flex-col gap-3">
          <div className={sectionClassName}>
            <div className={sectionHeaderClassName}>
              {t("da_chart_curve_settings_title")}
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_curve_type_label")}</div>
              <DropdownField
                id="device-analysis-plot-type-select"
                menuId="device-analysis-plot-type-menu"
                size="sm"
                value={String(normalizedOriginPlotOptions.type)}
                onChange={(next: any) => {
                  const normalized = normalizeOriginPlotOptions(
                    { type: next },
                    normalizedOriginPlotOptions,
                  );
                  onOriginOpenPlotOptionsChange?.({ type: normalized.type });
                }}
                options={originPlotTypeOptions}
                className={compactInputWidth}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">
                {t("da_settings_origin_plot_line_width_label")}
              </div>
              <Input
                id="device-analysis-plot-line-width-input"
                value={lineWidthDraft}
                onChange={setLineWidthDraft}
                onBlur={(event) => commitLineWidthDraft(event.currentTarget.value)}
                onKeyDown={handleLineWidthKeyDown}
                inputMode="decimal"
                placeholder={String(DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth)}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_settings_origin_plot_line_width_hint")}
              />
            </div>
          </div>

          <div className={sectionClassName}>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_grid_lines")}</div>
              <Switch
                id="device-analysis-axis-show-grid"
                size="sm"
                checked={axis?.showGrid !== false}
                onCheckedChange={(checked) =>
                  setAxis((prev: any) => ({ ...prev, showGrid: checked }))
                }
                aria-label={t("da_chart_axis_show_grid_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_major_ticks")}</div>
              <Switch
                id="device-analysis-axis-show-major-ticks"
                size="sm"
                checked={axis?.showMajorTicks !== false}
                onCheckedChange={(checked) =>
                  setAxis((prev: any) => ({ ...prev, showMajorTicks: checked }))
                }
                aria-label={t("da_chart_axis_show_major_ticks_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_minor_ticks")}</div>
              <Switch
                id="device-analysis-axis-show-minor-ticks"
                size="sm"
                checked={minorTicksEnabled}
                onCheckedChange={(checked) =>
                  setAxis((prev: any) => ({ ...prev, showMinorTicks: checked }))
                }
                aria-label={t("da_chart_axis_show_minor_ticks_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_minor_tick_count")}</div>
              <Input
                id="device-analysis-axis-minor-tick-count"
                value={axis.minorTickCount}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, minorTickCount: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="numeric"
                disabled={!minorTicksEnabled}
                placeholder="1"
                className={`${analysisCompactInputWrapperClass} w-[86px]`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_minor_tick_count_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_tick_label_font_size")}</div>
              <Input
                id="device-analysis-axis-tick-label-font-size"
                value={axis.tickLabelFontSize}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, tickLabelFontSize: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="numeric"
                placeholder="18"
                className={`${analysisCompactInputWrapperClass} w-[86px]`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_tick_label_font_size_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_title_font_size")}</div>
              <Input
                id="device-analysis-axis-title-font-size"
                value={axis.axisTitleFontSize}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, axisTitleFontSize: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="numeric"
                placeholder="22"
                className={`${analysisCompactInputWrapperClass} w-[86px]`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_title_font_size_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_legend_font_size")}</div>
              <Input
                id="device-analysis-axis-legend-font-size"
                value={axis.legendFontSize}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, legendFontSize: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="numeric"
                placeholder="18"
                className={`${analysisCompactInputWrapperClass} w-[86px]`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_legend_font_size_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_origin_tick_label_offset")}</div>
              <Input
                id="device-analysis-axis-origin-tick-label-offset"
                value={axis.originTickLabelOffset}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, originTickLabelOffset: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="decimal"
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} w-[86px]`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_origin_tick_label_offset_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_origin_title_gap")}</div>
              <Input
                id="device-analysis-axis-origin-title-gap"
                value={axis.originAxisTitleGap}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, originAxisTitleGap: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="decimal"
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} w-[86px]`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_origin_title_gap_title")}
              />
            </div>
          </div>

          <div className={sectionClassName}>
            <div className={sectionHeaderClassName}>
              {t("da_chart_axis_x_title")}
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_min")}</div>
              <Input
                id="device-analysis-axis-x-min"
                value={axis.xMin}
                onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xMin: nextValue }))}
                onKeyDown={blurInputOnEnter}
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_max")}</div>
              <Input
                id="device-analysis-axis-x-max"
                value={axis.xMax}
                onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xMax: nextValue }))}
                onKeyDown={blurInputOnEnter}
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_ticks")}</div>
              <DropdownField
                size="sm"
                value={axis.xTicks}
                onChange={handleXAxisTickModeChange}
                options={[
                  { value: "auto", label: t("da_chart_axis_auto") },
                  { value: "nice", label: t("da_chart_axis_nice") },
                  { value: "step", label: t("da_chart_axis_step") },
                ]}
                className={compactInputWidth}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_count")}</div>
              <Input
                id="device-analysis-axis-x-tick-count"
                value={axis.xTicks === "nice" ? axis.xTickCount : ""}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, xTickCount: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                disabled={axis.xTicks !== "nice"}
                placeholder="6"
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_nice_tick_count_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_step")}</div>
              <Input
                id="device-analysis-axis-x-step"
                value={axis.xTicks === "step" ? axis.xStep : ""}
                onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xStep: nextValue }))}
                onKeyDown={blurInputOnEnter}
                disabled={axis.xTicks !== "step"}
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_step_tick_increment_title")}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_x_tooltip_digits")}</div>
              <Input
                id="device-analysis-axis-x-tooltip-digits"
                value={axis.xTooltipDigits}
                onChange={(nextValue) =>
                  setAxis((prev: any) => ({ ...prev, xTooltipDigits: nextValue }))
                }
                onKeyDown={blurInputOnEnter}
                inputMode="numeric"
                placeholder={t("da_chart_axis_x_tooltip_digits_placeholder", {
                  auto: xTooltipDigitsAuto,
                })}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
                title={t("da_chart_axis_x_tooltip_digits_title")}
              />
            </div>
          </div>

          <div className={sectionClassName}>
            <div className={sectionHeaderClassName}>
              {t("da_chart_axis_y_title")}
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">
                {t("da_chart_axis_min")} ({plotYUnitLabel})
              </div>
              <Input
                id="device-analysis-axis-y-min"
                value={axis.yMin}
                onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yMin: nextValue }))}
                onKeyDown={blurInputOnEnter}
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">
                {t("da_chart_axis_max")} ({plotYUnitLabel})
              </div>
              <Input
                id="device-analysis-axis-y-max"
                value={axis.yMax}
                onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yMax: nextValue }))}
                onKeyDown={blurInputOnEnter}
                placeholder={t("da_chart_axis_auto")}
                className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                fieldClassName={compactInputFieldClass}
                inputClassName={analysisCompactInputClass}
              />
            </div>
            <div className={settingRowClassName}>
              <div className="text-xs text-text-secondary">{t("da_chart_axis_ticks")}</div>
              <DropdownField
                size="sm"
                value={axis.yTicks}
                onChange={handleYAxisTickModeChange}
                options={
                  effectiveYScale === "linear"
                    ? [
                        { value: "auto", label: t("da_chart_axis_auto") },
                        { value: "nice", label: t("da_chart_axis_nice") },
                        { value: "step", label: t("da_chart_axis_step") },
                      ]
                    : [
                        { value: "auto", label: t("da_chart_axis_auto") },
                        { value: "decades", label: t("da_chart_axis_decades") },
                      ]
                }
                className={compactInputWidth}
              />
            </div>
            {effectiveYScale === "linear" ? (
              axis.yTicks === "step" ? (
                <div className={settingRowClassName}>
                  <div className="text-xs text-text-secondary">
                    {t("da_chart_axis_step")} ({plotYUnitLabel})
                  </div>
                  <Input
                    id="device-analysis-axis-y-step"
                    value={axis.yTicks === "step" ? axis.yStep : ""}
                    onChange={(nextValue) =>
                      setAxis((prev: any) => ({ ...prev, yStep: nextValue }))
                    }
                    onKeyDown={blurInputOnEnter}
                    placeholder={t("da_chart_axis_auto")}
                    className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                    fieldClassName={compactInputFieldClass}
                    inputClassName={analysisCompactInputClass}
                    title={t("da_chart_axis_major_tick_increment_title")}
                  />
                </div>
              ) : (
                <div className={settingRowClassName}>
                  <div className="text-xs text-text-secondary">{t("da_chart_axis_count")}</div>
                  <Input
                    id="device-analysis-axis-y-tick-count"
                    value={axis.yTicks === "nice" ? axis.yTickCount : ""}
                    onChange={(nextValue) =>
                      setAxis((prev: any) => ({ ...prev, yTickCount: nextValue }))
                    }
                    onKeyDown={blurInputOnEnter}
                    disabled={axis.yTicks !== "nice"}
                    placeholder="6"
                    className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                    fieldClassName={compactInputFieldClass}
                    inputClassName={analysisCompactInputClass}
                    title={t("da_chart_axis_nice_tick_count_title")}
                  />
                </div>
              )
            ) : (
              <div className={settingRowClassName}>
                <div className="text-xs text-text-secondary">{t("da_chart_axis_decade_step")}</div>
                <Input
                  id="device-analysis-axis-y-decade-step"
                  value={axis.yTicks === "decades" ? axis.yDecadeStep : ""}
                  onChange={(nextValue) =>
                    setAxis((prev: any) => ({ ...prev, yDecadeStep: nextValue }))
                  }
                  onKeyDown={blurInputOnEnter}
                  disabled={axis.yTicks !== "decades"}
                  placeholder="1"
                  className={`${analysisCompactInputWrapperClass} ${compactInputWidth}`}
                  fieldClassName={compactInputFieldClass}
                  inputClassName={analysisCompactInputClass}
                  title={t("da_chart_axis_major_tick_increment_decades_title")}
                />
              </div>
            )}
            {yScaleWarning ? (
              <div className="border-t border-border/50 px-3 py-2 text-[11px] text-yellow-500">
                {yScaleWarning}
              </div>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}
