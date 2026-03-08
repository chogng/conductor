import { memo } from "react";
import { formatNumber } from "../../lib/analysisMath";

type SsConfidence = "high" | "low" | "fail" | string;

type CalculatedParameterRowData = {
  name: string;
  ion: number | null;
  xAtIon: number | null;
  ioff: number | null;
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
  buildSsTooltip?: (row: CalculatedParameterRowData) => string;
};

const CalculatedParametersRow = memo(function CalculatedParametersRow({
  row,
  buildSsTooltip,
}: CalculatedParametersRowProps) {
  if (!row) return null;

  return (
    <tr className="hover:bg-bg-page/30">
      <td className="p-2 text-text-primary font-medium whitespace-nowrap">
        {row.name}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.ion)}
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtIon)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.ioff)}
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtIoff)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.ionIoff, { digits: 3 })}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.gmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtGmMaxAbs)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
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
      <td className="p-2 font-mono text-xs text-text-secondary whitespace-nowrap">
        {formatNumber(row.xAtSs)}
      </td>
      <td className="p-2 font-mono text-xs text-text-primary whitespace-nowrap">
        {formatNumber(row.jon)}
      </td>
    </tr>
  );
});

CalculatedParametersRow.displayName = "CalculatedParametersRow";

export default CalculatedParametersRow;
