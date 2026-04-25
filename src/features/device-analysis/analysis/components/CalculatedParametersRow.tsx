import { memo } from "react";
import AnimatedNumberText from "./AnimatedNumberText";

type SsConfidence = "high" | "low" | "fail" | string;

type CalculatedParameterRowData = {
  currentCandidateWindows?: unknown[];
  currentMethod?: string | null;
  name: string;
  ion: number | null;
  ionWindow?: unknown;
  xAtIon: number | null;
  ioff: number | null;
  ioffWindow?: unknown;
  xAtIoff: number | null;
  ionIoff: number | null;
  gmMaxAbs: number | null;
  xAtGmMaxAbs: number | null;
  ss: number | null;
  ssConfidence: SsConfidence;
  xAtSs: number | null;
  jon: number | null;
};

type CalculatedParametersRowProps = {
  row?: CalculatedParameterRowData | null;
  isPending?: boolean;
  buildCurrentTooltip?: (
    role: "ion" | "ioff" | "ratio",
    row: CalculatedParameterRowData,
  ) => string;
  buildSsTooltip?: (row: CalculatedParameterRowData) => string;
  showTransferMetrics?: boolean;
};

type NumericMetricCellProps = {
  className: string;
  digits?: number;
  isPending: boolean;
  title?: string;
  value: number | null | undefined;
};

type LabelCellProps = {
  className: string;
  value: string;
};

type SsMetricCellProps = {
  confidence: SsConfidence;
  isPending: boolean;
  title?: string;
  value: number | null | undefined;
};

const LabelCell = memo(function LabelCell({
  className,
  value,
}: LabelCellProps) {
  return <td className={className}>{value}</td>;
});

const NumericMetricCell = memo(function NumericMetricCell({
  className,
  digits,
  isPending,
  title = "",
  value,
}: NumericMetricCellProps) {
  return (
    <td className={className} title={title}>
      {isPending ? "..." : <AnimatedNumberText value={value} digits={digits} />}
    </td>
  );
});

const SsMetricCell = memo(function SsMetricCell({
  confidence,
  isPending,
  title = "",
  value,
}: SsMetricCellProps) {
  const content = isPending ? (
    "..."
  ) : value !== null ? (
    <AnimatedNumberText value={value} digits={2} />
  ) : confidence === "fail" ? (
    "Fail"
  ) : (
    "-"
  );

  return (
    <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-rose-500/5">
      <span
        className={`inline-flex h-6 min-w-[4.75rem] items-center justify-center px-2 rounded-md text-[14px] font-medium leading-none border ${
          isPending
            ? "bg-bg-page text-text-secondary border-border"
            : confidence === "high"
              ? "bg-green-500/10 text-green-500 border-green-500/20"
              : confidence === "low"
                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                : confidence === "fail"
                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                  : "bg-bg-page text-text-primary border-border"
        }`}
        title={title}
      >
        {content}
      </span>
    </td>
  );
});

const tooltipOrEmpty = (
  builder: CalculatedParametersRowProps["buildSsTooltip"],
  isPending: boolean,
  row: CalculatedParameterRowData,
) => (isPending || !builder ? "" : builder(row));

const currentTooltip = (
  builder: CalculatedParametersRowProps["buildCurrentTooltip"],
  isPending: boolean,
  row: CalculatedParameterRowData,
  role: "ion" | "ioff" | "ratio",
) => (isPending || !builder ? "" : builder(role, row));

const CalculatedParametersRow = memo(function CalculatedParametersRow({
  buildCurrentTooltip,
  row,
  isPending = false,
  buildSsTooltip,
  showTransferMetrics = true,
}: CalculatedParametersRowProps) {
  if (!row) return null;

  const ionTooltip = currentTooltip(buildCurrentTooltip, isPending, row, "ion");
  const ioffTooltip = currentTooltip(buildCurrentTooltip, isPending, row, "ioff");
  const ratioTooltip = currentTooltip(buildCurrentTooltip, isPending, row, "ratio");
  const ssTooltip = tooltipOrEmpty(buildSsTooltip, isPending, row);

  return (
    <tr className="hover:bg-bg-page/30">
      <LabelCell
        className="p-2 text-[14px] text-text-primary font-medium whitespace-nowrap text-center"
        value={row.name}
      />
      {showTransferMetrics ? (
        <>
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-emerald-500/5"
            isPending={isPending}
            title={ionTooltip}
            value={row.ion}
          />
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-emerald-500/5"
            isPending={isPending}
            title={ionTooltip}
            value={row.xAtIon}
          />
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-cyan-500/5"
            isPending={isPending}
            title={ioffTooltip}
            value={row.ioff}
          />
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-cyan-500/5"
            isPending={isPending}
            title={ioffTooltip}
            value={row.xAtIoff}
          />
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border"
            digits={3}
            isPending={isPending}
            title={ratioTooltip}
            value={row.ionIoff}
          />
        </>
      ) : null}
      <NumericMetricCell
        className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-amber-500/5"
        isPending={isPending}
        value={row.gmMaxAbs}
      />
      <NumericMetricCell
        className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-amber-500/5"
        isPending={isPending}
        value={row.xAtGmMaxAbs}
      />
      {showTransferMetrics ? (
        <>
          <SsMetricCell
            confidence={row.ssConfidence}
            isPending={isPending}
            title={ssTooltip}
            value={row.ss}
          />
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-rose-500/5"
            isPending={isPending}
            value={row.xAtSs}
          />
          <NumericMetricCell
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border"
            isPending={isPending}
            value={row.jon}
          />
        </>
      ) : null}
    </tr>
  );
}, areRowsEqual);

function areRowsEqual(
  previousProps: Readonly<CalculatedParametersRowProps>,
  nextProps: Readonly<CalculatedParametersRowProps>,
) {
  if (previousProps.isPending !== nextProps.isPending) return false;
  if (previousProps.showTransferMetrics !== nextProps.showTransferMetrics) {
    return false;
  }

  const previousRow = previousProps.row;
  const nextRow = nextProps.row;
  if (previousRow === nextRow) {
    return (
      previousProps.buildCurrentTooltip === nextProps.buildCurrentTooltip &&
      previousProps.buildSsTooltip === nextProps.buildSsTooltip
    );
  }
  if (!previousRow || !nextRow) return previousRow === nextRow;

  if (previousRow.name !== nextRow.name) return false;
  if (previousRow.ion !== nextRow.ion) return false;
  if (previousRow.xAtIon !== nextRow.xAtIon) return false;
  if (previousRow.ioff !== nextRow.ioff) return false;
  if (previousRow.xAtIoff !== nextRow.xAtIoff) return false;
  if (previousRow.ionIoff !== nextRow.ionIoff) return false;
  if (previousRow.gmMaxAbs !== nextRow.gmMaxAbs) return false;
  if (previousRow.xAtGmMaxAbs !== nextRow.xAtGmMaxAbs) return false;
  if (previousRow.ss !== nextRow.ss) return false;
  if (previousRow.ssConfidence !== nextRow.ssConfidence) return false;
  if (previousRow.xAtSs !== nextRow.xAtSs) return false;
  if (previousRow.jon !== nextRow.jon) return false;

  const previousIonTooltip = currentTooltip(
    previousProps.buildCurrentTooltip,
    Boolean(previousProps.isPending),
    previousRow,
    "ion",
  );
  const nextIonTooltip = currentTooltip(
    nextProps.buildCurrentTooltip,
    Boolean(nextProps.isPending),
    nextRow,
    "ion",
  );
  if (previousIonTooltip !== nextIonTooltip) return false;

  const previousIoffTooltip = currentTooltip(
    previousProps.buildCurrentTooltip,
    Boolean(previousProps.isPending),
    previousRow,
    "ioff",
  );
  const nextIoffTooltip = currentTooltip(
    nextProps.buildCurrentTooltip,
    Boolean(nextProps.isPending),
    nextRow,
    "ioff",
  );
  if (previousIoffTooltip !== nextIoffTooltip) return false;

  const previousRatioTooltip = currentTooltip(
    previousProps.buildCurrentTooltip,
    Boolean(previousProps.isPending),
    previousRow,
    "ratio",
  );
  const nextRatioTooltip = currentTooltip(
    nextProps.buildCurrentTooltip,
    Boolean(nextProps.isPending),
    nextRow,
    "ratio",
  );
  if (previousRatioTooltip !== nextRatioTooltip) return false;

  const previousSsTooltip = tooltipOrEmpty(
    previousProps.buildSsTooltip,
    Boolean(previousProps.isPending),
    previousRow,
  );
  const nextSsTooltip = tooltipOrEmpty(
    nextProps.buildSsTooltip,
    Boolean(nextProps.isPending),
    nextRow,
  );
  return previousSsTooltip === nextSsTooltip;
}

CalculatedParametersRow.displayName = "CalculatedParametersRow";

export default CalculatedParametersRow;
