import { memo } from "react";
import { formatNumber } from "../lib/analysisMath";

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

const CalculatedParametersRow = memo(function CalculatedParametersRow({
  buildCurrentTooltip,
  row,
  isPending = false,
  buildSsTooltip,
  showTransferMetrics = true,
}: CalculatedParametersRowProps) {
  if (!row) return null;
  const renderValue = (value: unknown, options?: { digits?: number }) =>
    isPending ? "..." : formatNumber(value, options);
  const tooltipOrEmpty = (builder?: (row: CalculatedParameterRowData) => string) =>
    isPending || !builder ? "" : builder(row);
  const currentTooltip = (role: "ion" | "ioff" | "ratio") =>
    isPending || !buildCurrentTooltip ? "" : buildCurrentTooltip(role, row);

  return (
    <tr className="hover:bg-bg-page/30">
      <td className="p-2 text-[14px] text-text-primary font-medium whitespace-nowrap text-center">
        {row.name}
      </td>
      {showTransferMetrics ? (
        <>
          <td
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-emerald-500/5"
            title={currentTooltip("ion")}
          >
            {renderValue(row.ion)}
          </td>
          <td
            className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-emerald-500/5"
            title={currentTooltip("ion")}
          >
            {renderValue(row.xAtIon)}
          </td>
          <td
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-cyan-500/5"
            title={currentTooltip("ioff")}
          >
            {renderValue(row.ioff)}
          </td>
          <td
            className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-cyan-500/5"
            title={currentTooltip("ioff")}
          >
            {renderValue(row.xAtIoff)}
          </td>
          <td
            className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border"
            title={currentTooltip("ratio")}
          >
            {renderValue(row.ionIoff, { digits: 3 })}
          </td>
        </>
      ) : null}
      <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-amber-500/5">
        {renderValue(row.gmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-amber-500/5">
        {renderValue(row.xAtGmMaxAbs)}
      </td>
      {showTransferMetrics ? (
        <>
          <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-rose-500/5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[14px] font-medium border ${
                isPending
                  ? "bg-bg-page text-text-secondary border-border"
                  : row.ssConfidence === "high"
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : row.ssConfidence === "low"
                    ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                    : row.ssConfidence === "fail"
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : "bg-bg-page text-text-primary border-border"
              }`}
              title={tooltipOrEmpty(buildSsTooltip)}
            >
              {isPending
                ? "..."
                : row.ss !== null
                ? formatNumber(row.ss, { digits: 2 })
                : row.ssConfidence === "fail"
                  ? "Fail"
                  : "-"}
            </span>
          </td>
          <td className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-rose-500/5">
            {renderValue(row.xAtSs)}
          </td>
          <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border">
            {renderValue(row.jon)}
          </td>
        </>
      ) : null}
    </tr>
  );
});

CalculatedParametersRow.displayName = "CalculatedParametersRow";

export default CalculatedParametersRow;
