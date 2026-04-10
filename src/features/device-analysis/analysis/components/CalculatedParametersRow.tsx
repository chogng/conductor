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
  buildCurrentTooltip?: (
    role: "ion" | "ioff" | "ratio",
    row: CalculatedParameterRowData,
  ) => string;
  buildSsTooltip?: (row: CalculatedParameterRowData) => string;
};

const CalculatedParametersRow = memo(function CalculatedParametersRow({
  buildCurrentTooltip,
  row,
  buildSsTooltip,
}: CalculatedParametersRowProps) {
  if (!row) return null;

  return (
    <tr className="hover:bg-bg-page/30">
      <td className="p-2 text-[14px] text-text-primary font-medium whitespace-nowrap text-center">
        {row.name}
      </td>
      <td
        className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-emerald-500/5"
        title={buildCurrentTooltip ? buildCurrentTooltip("ion", row) : ""}
      >
        {formatNumber(row.ion)}
      </td>
      <td
        className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-emerald-500/5"
        title={buildCurrentTooltip ? buildCurrentTooltip("ion", row) : ""}
      >
        {formatNumber(row.xAtIon)}
      </td>
      <td
        className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-cyan-500/5"
        title={buildCurrentTooltip ? buildCurrentTooltip("ioff", row) : ""}
      >
        {formatNumber(row.ioff)}
      </td>
      <td
        className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-cyan-500/5"
        title={buildCurrentTooltip ? buildCurrentTooltip("ioff", row) : ""}
      >
        {formatNumber(row.xAtIoff)}
      </td>
      <td
        className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border"
        title={buildCurrentTooltip ? buildCurrentTooltip("ratio", row) : ""}
      >
        {formatNumber(row.ionIoff, { digits: 3 })}
      </td>
      <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-amber-500/5">
        {formatNumber(row.gmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-amber-500/5">
        {formatNumber(row.xAtGmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-rose-500/5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[14px] font-medium border ${
            row.ssConfidence === "high"
              ? "bg-green-500/10 text-green-500 border-green-500/20"
              : row.ssConfidence === "low"
                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                : row.ssConfidence === "fail"
                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                  : "bg-bg-page text-text-primary border-border"
          }`}
          title={buildSsTooltip ? buildSsTooltip(row) : ""}
        >
          {row.ss !== null
            ? formatNumber(row.ss, { digits: 2 })
            : row.ssConfidence === "fail"
              ? "Fail"
              : "-"}
        </span>
      </td>
      <td className="p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-rose-500/5">
        {formatNumber(row.xAtSs)}
      </td>
      <td className="p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border">
        {formatNumber(row.jon)}
      </td>
    </tr>
  );
});

CalculatedParametersRow.displayName = "CalculatedParametersRow";

export default CalculatedParametersRow;
