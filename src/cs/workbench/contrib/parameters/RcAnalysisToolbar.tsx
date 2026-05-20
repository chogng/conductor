import Button from "cs/base/browser/ui/Button/Button";
import DropdownField from "cs/base/browser/ui/DropdownField/DropdownField";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import type { OriginCurveExportSeriesOption } from "src/cs/workbench/contrib/chartPreview/components/OriginExportToolbar";

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
}: RcAnalysisToolbarProps) => {
  const { t } = useLanguage();

  return (
    <div
      role="toolbar"
      aria-label={t("da_rc_toolbar_aria_label")}
      className="rounded-xl border border-border bg-bg-page/40 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {t("da_rc_bias_label")}
          </span>
          <DropdownField
            id="analysis-rc-bias-select"
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
          {isPending ? t("da_rc_run_pending") : t("da_rc_run_button")}
        </Button>
      </div>
    </div>
  );
};

export default RcAnalysisToolbar;
