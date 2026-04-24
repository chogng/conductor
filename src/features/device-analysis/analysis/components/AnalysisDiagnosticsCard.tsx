import React from "react";
import { formatNumber } from "../lib/analysisMath";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import Input from "../../../../components/ui/Input";
import DropdownField from "../../../../components/ui/DropdownField";
import type { TranslateFn } from "../../../../context/language";

type AnalysisDiagnosticsCardProps = {
  showDiagnosticsPanel: boolean;
  diagnosticsHeading: string;
  diagnosticsDescription: string;
  diagnosticsContextBadges?: Array<{
    color?: string | null;
    text: string;
  }>;
  effectivePlotType: string;
  plotYUnitLabel: string;
  showIvDiagnosticsPanel: boolean;
  showCurveProbePanel: boolean;
  ionIoffMethod: string;
  showCurrentDiagnosticsControls: boolean;
  ionIoffManualTargets: any;
  setIonIoffManualTargets: (value: any) => void;
  xDomain: any;
  plotXFactor: number;
  curveProbeXInput: string;
  setCurveProbeXInput: (value: string) => void;
  curveProbeMode: "linear" | "log";
  setCurveProbeMode: (value: "linear" | "log") => void;
  curveProbeHeading: string;
  curveProbeRows: any[];
  focusedSeriesLabel: string | null;
  xTooltipDigits: number;
  resolvedXUnitLabel: string;
  showAreaDiagnosticsControls: boolean;
  areaInput: string;
  setAreaInput: (value: string) => void;
  areaDiagnosticsSummary: { areaValue: number | null; jon: number | null; joff: number | null };
  transferMetricsApplicable: boolean;
  showAxisControls: boolean;
  axis: any;
  setAxis: (value: any) => void;
  effectiveYScale: string;
  yScaleWarning: string | null;
  xTooltipDigitsAuto: number;
  onPersistIonIoffTargets: (role: "ion" | "ioff") => void;
  onAxisYScaleChange: (next: any) => void;
  analysisCompactInputWrapperClass: string;
  analysisCompactInputClass: string;
  analysisCompactPageFieldClass: string;
  analysisCompactSurfaceFieldClass: string;
  t: TranslateFn;
};

export default function AnalysisDiagnosticsCard({
  showDiagnosticsPanel,
  diagnosticsHeading,
  diagnosticsDescription,
  diagnosticsContextBadges = [],
  effectivePlotType,
  plotYUnitLabel,
  showIvDiagnosticsPanel,
  showCurveProbePanel,
  ionIoffMethod,
  showCurrentDiagnosticsControls,
  ionIoffManualTargets,
  setIonIoffManualTargets,
  xDomain,
  plotXFactor,
  curveProbeXInput,
  setCurveProbeXInput,
  curveProbeMode,
  setCurveProbeMode,
  curveProbeHeading,
  curveProbeRows,
  focusedSeriesLabel,
  xTooltipDigits,
  resolvedXUnitLabel,
  showAreaDiagnosticsControls,
  areaInput,
  setAreaInput,
  areaDiagnosticsSummary,
  transferMetricsApplicable,
  showAxisControls,
  axis,
  setAxis,
  effectiveYScale,
  yScaleWarning,
  xTooltipDigitsAuto,
  onPersistIonIoffTargets,
  onAxisYScaleChange,
  analysisCompactInputWrapperClass,
  analysisCompactInputClass,
  analysisCompactPageFieldClass,
  analysisCompactSurfaceFieldClass,
  t,
}: AnalysisDiagnosticsCardProps) {
  const formatProbeModeLabel = (kindRaw: unknown): string => {
    const kind = String(kindRaw ?? "");
    if (kind === "exact") return "命中";
    if (kind === "interpolated") return "插值";
    if (kind === "outOfRange") return "超出";
    return "无法计算";
  };

  if (!showDiagnosticsPanel) {
    return null;
  }

  const renderDiagnosticsContextBadges = () => {
    if (!diagnosticsContextBadges.length) return null;
    return (
      <div className="flex max-w-full items-center justify-end gap-2 flex-wrap">
        {diagnosticsContextBadges.map((badge, index) => (
          <div
            key={`${badge.text}-${index}`}
            className="max-w-full rounded-md border border-border/70 bg-bg-page/70 px-3 py-1.5 text-xs text-text-secondary"
            title={badge.text}
          >
            <span className="flex items-center gap-2.5">
              {badge.color ? (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: badge.color }}
                />
              ) : null}
              <span className="block truncate">{badge.text}</span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card variant="panel" className="flex min-w-0 flex-col">
      {!showCurveProbePanel || showAreaDiagnosticsControls || showAxisControls ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-text-primary">{diagnosticsHeading}</div>
            <div className="text-[11px] text-text-secondary">{diagnosticsDescription}</div>
          </div>
          {renderDiagnosticsContextBadges()}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {showCurveProbePanel ? (
            <div className="flex flex-col gap-2 text-xs text-text-secondary">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                <span className="whitespace-nowrap">x:</span>
                <Input
                  id="device-analysis-curve-probe-x-input"
                  value={curveProbeXInput}
                  onChange={setCurveProbeXInput}
                  placeholder={`e.g. ${formatNumber((Number(xDomain?.[1]) || 1) * plotXFactor, { digits: 3 })}`}
                  className={analysisCompactInputWrapperClass}
                  fieldClassName={`${analysisCompactPageFieldClass} !w-[110px]`}
                  inputClassName={analysisCompactInputClass}
                />
                <span className="whitespace-nowrap">{resolvedXUnitLabel}</span>
                <DropdownField
                  id="device-analysis-curve-probe-mode-select"
                  size="sm"
                  value={curveProbeMode}
                  onChange={(next: any) => setCurveProbeMode(next === "log" ? "log" : "linear")}
                  options={[
                    { value: "linear", label: "线性" },
                    { value: "log", label: "对数" },
                  ]}
                  className="w-[96px]"
                />
                </div>
                {renderDiagnosticsContextBadges()}
              </div>
              {!curveProbeXInput.trim() ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-bg-page/60 px-3 py-2">
                  输入x后进行诊断
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/60 bg-bg-page/60">
                  <table className="w-full min-w-[520px] table-fixed border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-secondary">
                        <th className="p-2 text-left font-semibold">曲线</th>
                        <th className="p-2 text-left font-semibold">对应 y</th>
                        <th className="p-2 text-left font-semibold">备注</th>
                        <th className="p-2 text-left font-semibold">参考点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curveProbeRows.map((row) => {
                        const sample = row?.sample ?? null;
                        const kind = String(sample?.kind ?? "empty");
                        const yValue = Number(sample?.y);
                        const left = sample?.left ?? null;
                        const right = sample?.right ?? null;
                        const bracketText =
                          Number.isFinite(left?.x) && Number.isFinite(right?.x)
                            ? `[${formatNumber(left.x * plotXFactor, { digits: xTooltipDigits })}, ${formatNumber(right.x * plotXFactor, { digits: xTooltipDigits })}] ${resolvedXUnitLabel}`
                            : "n/a";
                        return (
                          <tr key={row.id} className="border-b border-border/50 last:border-b-0">
                            <td className="p-2 text-text-primary">
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: row.color }} />
                                <span>{row.name}</span>
                              </span>
                            </td>
                            <td className="p-2 text-text-primary">
                              {Number.isFinite(yValue)
                                ? `${formatNumber(yValue, { digits: 6 })} ${plotYUnitLabel}`
                                : "n/a"}
                            </td>
                            <td className="p-2">{formatProbeModeLabel(kind)}</td>
                            <td className="p-2">{bracketText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
        ) : null}

        {showAreaDiagnosticsControls ? (
          <div className="rounded-lg border border-border/60 bg-bg-surface px-3 py-2">
            <div className="mb-2 text-[11px] font-semibold text-text-primary">J Controls</div>
            <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
              <span className="whitespace-nowrap">Area (for J = |I|/Area):</span>
              <Input
                id="device-analysis-area-input"
                value={areaInput}
                onChange={setAreaInput}
                placeholder="e.g. 1e-4"
                className={analysisCompactInputWrapperClass}
                fieldClassName={`${analysisCompactPageFieldClass} !w-[100px]`}
                inputClassName={analysisCompactInputClass}
              />
            </div>
            <div className="mt-2 flex flex-col gap-2 text-xs text-text-secondary">
              {areaDiagnosticsSummary.areaValue !== null ? (
                <div className="rounded-lg border border-border/60 bg-bg-page/60 px-3 py-2 text-text-primary">
                  Using area: {formatNumber(areaDiagnosticsSummary.areaValue, { digits: 4 })} cm^2
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-500/5 px-3 py-2 text-amber-600">
                  Enter a positive area to enable current-density conversion.
                </div>
              )}
              {areaDiagnosticsSummary.areaValue !== null && transferMetricsApplicable ? (
                <div className="rounded-lg border border-border/60 bg-bg-page/60 px-3 py-2 text-text-primary">
                  Jon: {areaDiagnosticsSummary.jon !== null ? formatNumber(areaDiagnosticsSummary.jon, { digits: 3 }) : "n/a"} {plotYUnitLabel}/cm^2
                  {" | "}
                  Joff: {areaDiagnosticsSummary.joff !== null ? formatNumber(areaDiagnosticsSummary.joff, { digits: 3 }) : "n/a"} {plotYUnitLabel}/cm^2
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {showAxisControls ? (
          <div className="rounded-lg border border-border/60 bg-bg-surface px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-text-primary">Axis Settings</div>
              <Button
                variant="text"
                size="sm"
                onClick={() =>
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
                    yTicks: "nice",
                    yTickCount: 6,
                    yStep: "",
                    yDecadeStep: 1,
                  }))
                }
                className="h-6 px-2 text-xs text-text-secondary hover:text-text-primary"
              >
                Reset
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-text-secondary">X Axis</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    id="device-analysis-axis-x-min"
                    value={axis.xMin}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xMin: nextValue }))}
                    placeholder="min (auto)"
                    className={analysisCompactInputWrapperClass}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                  />
                  <Input
                    id="device-analysis-axis-x-max"
                    value={axis.xMax}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xMax: nextValue }))}
                    placeholder="max (auto)"
                    className={analysisCompactInputWrapperClass}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <DropdownField
                    size="sm"
                    value={axis.xTicks}
                    onChange={(next: any) => setAxis((prev: any) => ({ ...prev, xTicks: next }))}
                    options={[
                      { value: "auto", label: "ticks: auto" },
                      { value: "nice", label: "ticks: nice" },
                      { value: "step", label: "ticks: step" },
                    ]}
                    className="w-full"
                  />
                  <Input
                    id="device-analysis-axis-x-tick-count"
                    value={axis.xTickCount}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xTickCount: nextValue }))}
                    disabled={axis.xTicks !== "nice"}
                    placeholder="count"
                    className={analysisCompactInputWrapperClass}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                    title="Nice tick count"
                  />
                  <Input
                    id="device-analysis-axis-x-step"
                    value={axis.xStep}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xStep: nextValue }))}
                    disabled={axis.xTicks !== "step"}
                    placeholder="step"
                    className={analysisCompactInputWrapperClass}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                    title="Step tick increment"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <div className="text-[11px] text-text-secondary">{t("da_chart_axis_x_tooltip_digits")}</div>
                  <Input
                    id="device-analysis-axis-x-tooltip-digits"
                    value={axis.xTooltipDigits}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, xTooltipDigits: nextValue }))}
                    inputMode="numeric"
                    placeholder={t("da_chart_axis_x_tooltip_digits_placeholder", { auto: xTooltipDigitsAuto })}
                    className={`${analysisCompactInputWrapperClass} col-span-2`}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                    title={t("da_chart_axis_x_tooltip_digits_title")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-text-secondary">Y Axis</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    id="device-analysis-axis-y-min"
                    value={axis.yMin}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yMin: nextValue }))}
                    placeholder={`min (auto) (${plotYUnitLabel})`}
                    className={analysisCompactInputWrapperClass}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                  />
                  <Input
                    id="device-analysis-axis-y-max"
                    value={axis.yMax}
                    onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yMax: nextValue }))}
                    placeholder={`max (auto) (${plotYUnitLabel})`}
                    className={analysisCompactInputWrapperClass}
                    fieldClassName={analysisCompactSurfaceFieldClass}
                    inputClassName={analysisCompactInputClass}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <DropdownField
                    size="sm"
                    value={axis.yScale}
                    onChange={onAxisYScaleChange}
                    options={[
                      { value: "linear", label: "scale: linear" },
                      { value: "log", label: "scale: log" },
                      { value: "logAbs", label: "scale: log(|y|)" },
                    ]}
                    className="w-full"
                    title="Scale"
                  />
                  <DropdownField
                    size="sm"
                    value={axis.yTicks}
                    onChange={(next: any) => setAxis((prev: any) => ({ ...prev, yTicks: next }))}
                    options={
                      effectiveYScale === "linear"
                        ? [
                            { value: "auto", label: "ticks: auto" },
                            { value: "nice", label: "ticks: nice" },
                            { value: "step", label: "ticks: step" },
                          ]
                        : [
                            { value: "auto", label: "ticks: auto" },
                            { value: "decades", label: "ticks: decades" },
                          ]
                    }
                    className="w-full"
                  />
                  {effectiveYScale === "linear" ? (
                    axis.yTicks === "step" ? (
                      <Input
                        id="device-analysis-axis-y-step"
                        value={axis.yStep}
                        onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yStep: nextValue }))}
                        placeholder={`step (${plotYUnitLabel})`}
                        className={analysisCompactInputWrapperClass}
                        fieldClassName={analysisCompactSurfaceFieldClass}
                        inputClassName={analysisCompactInputClass}
                        title="Major tick increment"
                      />
                    ) : (
                      <Input
                        id="device-analysis-axis-y-tick-count"
                        value={axis.yTickCount}
                        onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yTickCount: nextValue }))}
                        disabled={axis.yTicks !== "nice"}
                        placeholder="count"
                        className={analysisCompactInputWrapperClass}
                        fieldClassName={analysisCompactSurfaceFieldClass}
                        inputClassName={analysisCompactInputClass}
                        title="Nice tick count"
                      />
                    )
                  ) : (
                    <Input
                      id="device-analysis-axis-y-decade-step"
                      value={axis.yDecadeStep}
                      onChange={(nextValue) => setAxis((prev: any) => ({ ...prev, yDecadeStep: nextValue }))}
                      disabled={axis.yTicks !== "decades"}
                      placeholder="decade step"
                      className={analysisCompactInputWrapperClass}
                      fieldClassName={analysisCompactSurfaceFieldClass}
                      inputClassName={analysisCompactInputClass}
                      title="Major tick increment (decades)"
                    />
                  )}
                </div>

                {yScaleWarning ? <div className="text-[11px] text-yellow-500">{yScaleWarning}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
