import { jsx, jsxs } from "react/jsx-runtime";
import { lxArrowLeft } from "cogicon";
import { useEffect, useState, type ChangeEvent, type FocusEvent, type HTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { getButtonClassName, getButtonContentClassName } from "cs/base/browser/ui/button/button";
import { getCardClassName, getCardDataAttributes, type CardVariant } from "cs/base/browser/ui/card/card";
import { getCogIconClassName, getCogIconMarkup, getCogIconStyle, type CogIconRenderer, type CogIconStyle } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import DropdownField from "src/cs/workbench/browser/components/DropdownField";
import { getInputDataAttributes, getInputFieldClassName, getInputFieldState, getInputNativeClassName, getInputWrapperClassName, mergeSpaceSeparatedIds, slugifyInputId, type InputSize, type LabelPlacement } from "cs/base/browser/ui/input/input";
import ScrollArea from "src/cs/workbench/browser/components/ScrollArea";
import { getSwitchClassName, getSwitchDataAttributes, getSwitchStyle, type SwitchSize } from "cs/base/browser/ui/switch/switch";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { DEFAULT_ORIGIN_PLOT_OPTIONS, normalizeOriginPlotOptions, type OriginPlotOptions, } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
type LocalCogIconProps = {
    className?: string;
    icon: CogIconRenderer;
    size?: number | string;
    style?: CogIconStyle;
    [key: string]: unknown;
};
const renderLocalCogIcon = ({ className, icon, size = 16, style, ...props }: LocalCogIconProps) => jsx("span", {
    ...props,
    className: getCogIconClassName(className),
    style: getCogIconStyle({ size, style }),
    dangerouslySetInnerHTML: {
        __html: getCogIconMarkup(icon)
    }
});
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
type LocalCardProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    children?: ReactNode;
    cta?: string;
    ctaCopy?: string;
    ctaPosition?: string;
    variant?: CardVariant;
};
const renderLocalCard = ({ children, className = "", cta, ctaCopy, ctaPosition, variant = "default", ...props }: LocalCardProps) => jsx("div", {
    ...props,
    ...getCardDataAttributes({ cta, ctaCopy, ctaPosition }),
    className: getCardClassName({ className, variant }),
    children
});
const renderLocalSwitch = ({
    checked = false,
    className = "",
    disabled = false,
    id,
    onCheckedChange,
    size = "md",
    ...props
}: {
    readonly checked?: boolean;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly id?: string;
    readonly onCheckedChange?: (checked: boolean) => void;
    readonly size?: SwitchSize;
    readonly [key: string]: unknown;
}) => jsx("button", {
    ...props,
    ...getSwitchDataAttributes({ checked, size }),
    id,
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled,
    className: getSwitchClassName({ className }),
    style: getSwitchStyle({ size }),
    onClick: () => {
        if (!disabled) {
            onCheckedChange?.(!checked);
        }
    },
    children: jsx("span", {
        className: "ui-switch__thumb",
        "aria-hidden": "true"
    })
});
type LocalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange"> & {
    error?: ReactNode;
    fieldClassName?: string;
    hideSpinner?: boolean;
    hint?: ReactNode;
    idBase?: string;
    inputClassName?: string;
    label?: ReactNode;
    labelPlacement?: LabelPlacement;
    allowAutoComplete?: boolean;
    onChange?: (nextValue: string) => void;
    ref?: Ref<HTMLInputElement>;
    rightSlot?: ReactNode;
    size?: InputSize;
    value?: string | number;
};
const renderLocalInput = ({ allowAutoComplete = false, autoComplete, className = "", disabled = false, error, fieldClassName = "", hideSpinner = false, hint, id, idBase, inputClassName = "", label, labelPlacement = "stack", onChange, ref, rightSlot, size = "md", value, ...props }: LocalInputProps) => {
    const inputId = id ?? (idBase ? slugifyInputId(idBase) : undefined);
    const errorId = inputId ? `${inputId}-error` : undefined;
    const hintId = inputId ? `${inputId}-hint` : undefined;
    const describedBy = mergeSpaceSeparatedIds(props["aria-describedby"], error ? errorId : hint ? hintId : undefined);
    const labelNode = label ? jsx("label", {
        htmlFor: inputId,
        className: "input_label",
        children: label
    }) : null;
    const fieldNode = jsx("div", {
        className: getInputFieldClassName({ fieldClassName, size }),
        "data-icon": "without",
        "data-state": getInputFieldState({ disabled, error: Boolean(error) }),
        ...getInputDataAttributes({}),
        children: [
            jsx("input", {
                ...props,
                ref,
                id: inputId,
                value: value ?? "",
                onChange: (event: ChangeEvent<HTMLInputElement>) => onChange?.(event.currentTarget.value),
                disabled,
                "aria-invalid": Boolean(error),
                "aria-describedby": describedBy,
                autoComplete: allowAutoComplete ? autoComplete : "off",
                className: getInputNativeClassName({ hideSpinner, inputClassName })
            }),
            rightSlot ? jsx("div", { className: "input_right", children: rightSlot }) : null
        ]
    });
    return jsx("div", {
        className: getInputWrapperClassName(className),
        "data-style": "input",
        children: [
            label && labelPlacement === "inline" ? jsx("div", { className: "flex items-center gap-2", children: [labelNode, fieldNode] }) : [labelNode, fieldNode],
            error ? jsx("div", { id: errorId, className: "input_error", children: error }) : null,
            !error && hint ? jsx("div", { id: hintId, className: "input_hint", children: hint }) : null
        ]
    });
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
export default function AxisSettingsPane({ axis, effectiveYScale, plotYUnitLabel, setAxis, yScaleWarning, xTooltipDigitsAuto, originOpenPlotOptions, onOriginOpenPlotOptionsChange, onClose, analysisCompactInputWrapperClass, analysisCompactInputClass, t, }: AxisSettingsPaneProps) {
    const compactInputWidth = "w-[132px]";
    const compactInputFieldClass = "!h-8 !gap-0 border border-border px-2 py-1";
    const sectionClassName = "overflow-hidden rounded-md border border-border/60 bg-bg-surface";
    const sectionHeaderClassName = "border-b border-border/50 px-3 py-2 text-xs font-semibold text-text-secondary";
    const settingRowClassName = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0";
    const normalizedOriginPlotOptions = normalizeOriginPlotOptions(originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    const minorTicksEnabled = axis?.showMinorTicks !== false;
    const [lineWidthDraft, setLineWidthDraft] = useState(String(normalizedOriginPlotOptions.lineWidth));
    const originPlotTypeOptions = [
        { value: "200", label: t("da_settings_origin_plot_type_200") },
        { value: "201", label: t("da_settings_origin_plot_type_201") },
        { value: "202", label: t("da_settings_origin_plot_type_202") },
    ];
    useEffect(() => {
        setLineWidthDraft(String(normalizedOriginPlotOptions.lineWidth));
    }, [normalizedOriginPlotOptions.lineWidth]);
    const blurInputOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter")
            return;
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
        const normalized = normalizeOriginPlotOptions({ lineWidth: nextDraft }, normalizedOriginPlotOptions);
        if (normalized.lineWidth === normalizedOriginPlotOptions.lineWidth) {
            setLineWidthDraft(String(normalized.lineWidth));
            return;
        }
        setLineWidthDraft(String(normalized.lineWidth));
        onOriginOpenPlotOptionsChange?.({ lineWidth: normalized.lineWidth });
    };
    const handleLineWidthKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter")
            return;
        event.preventDefault();
        commitLineWidthDraft(event.currentTarget.value);
        event.currentTarget.blur();
    };
    return (renderLocalCard( {
        variant: "panel",
        className: "h-full min-h-0 flex flex-col !pr-0",
        children: [
            jsx("div", {
                className: "mb-3 pr-4",
                children: jsxs("div", {
                    className: "flex items-center justify-between gap-2",
                    children: [
                        jsx("button", {
                            type: "button",
                            onClick: onClose,
                            className: getButtonClassName({
                                className: "h-8 w-8 rounded-full text-text-secondary hover:text-text-primary",
                                size: "icon",
                                variant: "icon",
                            }),
                            title: t("da_chart_plot_settings_title"),
                            "aria-label": t("da_chart_plot_settings_title"),
                            children: jsx("span", {
                                className: getButtonContentClassName(),
                                children: renderLocalCogIcon({
                                    icon: lxArrowLeft,
                                    size: 16
                                })
                            })
                        }),
                        jsx("div", {
                            className: "min-w-0 flex-1",
                            children: jsx("div", {
                                className: "truncate text-xs font-semibold text-text-primary",
                                children: t("da_chart_plot_settings_title")
                            })
                        }),
                        jsx("button", {
                            type: "button",
                            onClick: () => resetAxisSettings(setAxis),
                            className: getButtonClassName({
                                className: "h-7 px-2 text-xs text-text-secondary hover:text-text-primary",
                                size: "sm",
                                variant: "text",
                            }),
                            children: jsx("span", {
                                className: getButtonContentClassName(),
                                children: t("da_chart_axis_reset")
                            })
                        })
                    ]
                })
            }),
            jsx(ScrollArea, {
                className: "flex-1 min-h-0",
                viewportClassName: "pr-4",
                axis: "y",
                children: jsxs("div", {
                    className: "flex flex-col gap-3",
                    children: [
                        jsxs("div", {
                            className: sectionClassName,
                            children: [
                                jsx("div", {
                                    className: sectionHeaderClassName,
                                    children: t("da_chart_curve_settings_title")
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_curve_type_label")
                                        }),
                                        jsx(DropdownField, {
                                            id: "analysis-plot-type-select",
                                            menuId: "analysis-plot-type-menu",
                                            size: "sm",
                                            value: String(normalizedOriginPlotOptions.type),
                                            onChange: (next: any) => {
                                                const normalized = normalizeOriginPlotOptions({ type: next }, normalizedOriginPlotOptions);
                                                onOriginOpenPlotOptionsChange?.({ type: normalized.type });
                                            },
                                            options: originPlotTypeOptions,
                                            className: compactInputWidth
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_settings_origin_plot_line_width_label")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-plot-line-width-input",
                                            value: lineWidthDraft,
                                            onChange: setLineWidthDraft,
                                            onBlur: (event: FocusEvent<HTMLInputElement>) => commitLineWidthDraft(event.currentTarget.value),
                                            onKeyDown: handleLineWidthKeyDown,
                                            inputMode: "decimal",
                                            placeholder: String(DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_settings_origin_plot_line_width_hint")
                                        })
                                    ]
                                })
                            ]
                        }),
                        jsxs("div", {
                            className: sectionClassName,
                            children: [
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_grid_lines")
                                        }),
                                        renderLocalSwitch({
                                            id: "analysis-axis-show-grid",
                                            size: "sm",
                                            checked: axis?.showGrid !== false,
                                            onCheckedChange: (checked: boolean) => setAxis((prev: any) => ({ ...prev, showGrid: checked })),
                                            "aria-label": t("da_chart_axis_show_grid_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_major_ticks")
                                        }),
                                        renderLocalSwitch({
                                            id: "analysis-axis-show-major-ticks",
                                            size: "sm",
                                            checked: axis?.showMajorTicks !== false,
                                            onCheckedChange: (checked: boolean) => setAxis((prev: any) => ({ ...prev, showMajorTicks: checked })),
                                            "aria-label": t("da_chart_axis_show_major_ticks_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_minor_ticks")
                                        }),
                                        renderLocalSwitch({
                                            id: "analysis-axis-show-minor-ticks",
                                            size: "sm",
                                            checked: minorTicksEnabled,
                                            onCheckedChange: (checked: boolean) => setAxis((prev: any) => ({ ...prev, showMinorTicks: checked })),
                                            "aria-label": t("da_chart_axis_show_minor_ticks_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_minor_tick_count")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-minor-tick-count",
                                            value: axis.minorTickCount,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, minorTickCount: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "numeric",
                                            disabled: !minorTicksEnabled,
                                            placeholder: "1",
                                            className: `${analysisCompactInputWrapperClass} w-[86px]`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_minor_tick_count_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_tick_label_font_size")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-tick-label-font-size",
                                            value: axis.tickLabelFontSize,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, tickLabelFontSize: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "numeric",
                                            placeholder: "18",
                                            className: `${analysisCompactInputWrapperClass} w-[86px]`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_tick_label_font_size_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_title_font_size")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-title-font-size",
                                            value: axis.axisTitleFontSize,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, axisTitleFontSize: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "numeric",
                                            placeholder: "22",
                                            className: `${analysisCompactInputWrapperClass} w-[86px]`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_title_font_size_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_legend_font_size")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-legend-font-size",
                                            value: axis.legendFontSize,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, legendFontSize: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "numeric",
                                            placeholder: "18",
                                            className: `${analysisCompactInputWrapperClass} w-[86px]`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_legend_font_size_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_origin_tick_label_offset")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-origin-tick-label-offset",
                                            value: axis.originTickLabelOffset,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, originTickLabelOffset: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "decimal",
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} w-[86px]`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_origin_tick_label_offset_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_origin_title_gap")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-origin-title-gap",
                                            value: axis.originAxisTitleGap,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, originAxisTitleGap: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "decimal",
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} w-[86px]`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_origin_title_gap_title")
                                        })
                                    ]
                                })
                            ]
                        }),
                        jsxs("div", {
                            className: sectionClassName,
                            children: [
                                jsx("div", {
                                    className: sectionHeaderClassName,
                                    children: t("da_chart_axis_x_title")
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_min")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-x-min",
                                            value: axis.xMin,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, xMin: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_max")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-x-max",
                                            value: axis.xMax,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, xMax: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_ticks")
                                        }),
                                        jsx(DropdownField, {
                                            size: "sm",
                                            value: axis.xTicks,
                                            onChange: handleXAxisTickModeChange,
                                            options: [
                                                { value: "auto", label: t("da_chart_axis_auto") },
                                                { value: "nice", label: t("da_chart_axis_nice") },
                                                { value: "step", label: t("da_chart_axis_step") },
                                            ],
                                            className: compactInputWidth
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_count")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-x-tick-count",
                                            value: axis.xTicks === "nice" ? axis.xTickCount : "",
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, xTickCount: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            disabled: axis.xTicks !== "nice",
                                            placeholder: "6",
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_nice_tick_count_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_step")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-x-step",
                                            value: axis.xTicks === "step" ? axis.xStep : "",
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, xStep: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            disabled: axis.xTicks !== "step",
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_step_tick_increment_title")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_x_tooltip_digits")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-x-tooltip-digits",
                                            value: axis.xTooltipDigits,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, xTooltipDigits: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            inputMode: "numeric",
                                            placeholder: t("da_chart_axis_x_tooltip_digits_placeholder", {
                                                auto: xTooltipDigitsAuto,
                                            }),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_x_tooltip_digits_title")
                                        })
                                    ]
                                })
                            ]
                        }),
                        jsxs("div", {
                            className: sectionClassName,
                            children: [
                                jsx("div", {
                                    className: sectionHeaderClassName,
                                    children: t("da_chart_axis_y_title")
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsxs("div", {
                                            className: "text-xs text-text-secondary",
                                            children: [
                                                t("da_chart_axis_min"),
                                                "(",
                                                plotYUnitLabel,
                                                ")"
                                            ]
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-y-min",
                                            value: axis.yMin,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, yMin: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsxs("div", {
                                            className: "text-xs text-text-secondary",
                                            children: [
                                                t("da_chart_axis_max"),
                                                "(",
                                                plotYUnitLabel,
                                                ")"
                                            ]
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-y-max",
                                            value: axis.yMax,
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, yMax: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_ticks")
                                        }),
                                        jsx(DropdownField, {
                                            size: "sm",
                                            value: axis.yTicks,
                                            onChange: handleYAxisTickModeChange,
                                            options: effectiveYScale === "linear"
                                                ? [
                                                    { value: "auto", label: t("da_chart_axis_auto") },
                                                    { value: "nice", label: t("da_chart_axis_nice") },
                                                    { value: "step", label: t("da_chart_axis_step") },
                                                ]
                                                : [
                                                    { value: "auto", label: t("da_chart_axis_auto") },
                                                    { value: "decades", label: t("da_chart_axis_decades") },
                                                ],
                                            className: compactInputWidth
                                        })
                                    ]
                                }),
                                effectiveYScale === "linear" ? (axis.yTicks === "step" ? (jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsxs("div", {
                                            className: "text-xs text-text-secondary",
                                            children: [
                                                t("da_chart_axis_step"),
                                                "(",
                                                plotYUnitLabel,
                                                ")"
                                            ]
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-y-step",
                                            value: axis.yTicks === "step" ? axis.yStep : "",
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, yStep: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            placeholder: t("da_chart_axis_auto"),
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_major_tick_increment_title")
                                        })
                                    ]
                                })) : (jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_count")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-y-tick-count",
                                            value: axis.yTicks === "nice" ? axis.yTickCount : "",
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, yTickCount: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            disabled: axis.yTicks !== "nice",
                                            placeholder: "6",
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_nice_tick_count_title")
                                        })
                                    ]
                                }))) : (jsxs("div", {
                                    className: settingRowClassName,
                                    children: [
                                        jsx("div", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_chart_axis_decade_step")
                                        }),
                                        renderLocalInput( {
                                            id: "analysis-axis-y-decade-step",
                                            value: axis.yTicks === "decades" ? axis.yDecadeStep : "",
                                            onChange: (nextValue: string) => setAxis((prev: any) => ({ ...prev, yDecadeStep: nextValue })),
                                            onKeyDown: blurInputOnEnter,
                                            disabled: axis.yTicks !== "decades",
                                            placeholder: "1",
                                            className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
                                            fieldClassName: compactInputFieldClass,
                                            inputClassName: analysisCompactInputClass,
                                            title: t("da_chart_axis_major_tick_increment_decades_title")
                                        })
                                    ]
                                })),
                                yScaleWarning ? (jsx("div", {
                                    className: "border-t border-border/50 px-3 py-2 text-[11px] text-yellow-500",
                                    children: yScaleWarning
                                })) : null
                            ]
                        })
                    ]
                })
            })
        ]
    }));
}





