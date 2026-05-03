import Button from "../../../../components/ui/Button";
import DropdownField from "../../../../components/ui/DropdownField";
import type { OriginCurveExportSeriesOption } from "./OriginExportToolbar";

type RcAnalysisToolbarProps = {
  biasOptions: OriginCurveExportSeriesOption[];
  isPending: boolean;
  onAnalyze: () => void | Promise<void>;
  onBiasChange: (nextKey: string) => void;
  rowCount: number;
  selectedBiasKey: string;
};

const RcAnalysisToolbar = ({
  biasOptions,
  isPending,
  onAnalyze,
  onBiasChange,
  rowCount,
  selectedBiasKey,
}: RcAnalysisToolbarProps) => (
  <div
    role="toolbar"
    aria-label="Contact resistance"
    className="rounded-xl border border-border bg-bg-page/40 px-4 py-3"
  >
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-secondary whitespace-nowrap">
          偏置电压
        </span>
        <DropdownField
          id="device-analysis-rc-bias-select"
          size="sm"
          value={selectedBiasKey}
          onChange={(next: any) => onBiasChange(String(next ?? ""))}
          options={biasOptions.map((option) => ({
            value: option.key,
            label: option.label,
          }))}
          className="w-fit da-neutral-select"
          stableWidth
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          void onAnalyze();
        }}
        disabled={isPending || !rowCount}
      >
        {isPending ? "Running..." : "Run Rc"}
      </Button>
    </div>
  </div>
);

export default RcAnalysisToolbar;
