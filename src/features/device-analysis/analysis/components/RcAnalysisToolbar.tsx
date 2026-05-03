import Button from "../../../../components/ui/Button";
import {
  OriginCurveExportMenu,
  type OriginCurveExportSeriesOption,
  type OriginExportContentTranslateFn,
  type ReplaceMatchingOriginSeriesAcrossFilesFn,
} from "./OriginExportToolbar";
import type { DeviceAnalysisOriginCurveExportMode } from "../useOriginCanvasExport";

type RcAnalysisToolbarProps = {
  curveOptions: OriginCurveExportSeriesOption[];
  isPending: boolean;
  onAnalyze: () => void | Promise<void>;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  resolvedCurveExportMode: DeviceAnalysisOriginCurveExportMode;
  rowCount: number;
  scopedFileIds: string[];
  selectedCurveOptionKeySet: Set<string>;
  setResolvedCurveExportMode: (next: DeviceAnalysisOriginCurveExportMode) => void;
  t: OriginExportContentTranslateFn;
};

const RcAnalysisToolbar = ({
  curveOptions,
  isPending,
  onAnalyze,
  onSelectedCurveOptionKeysChange,
  replaceMatchingOriginSeriesAcrossFiles,
  resolvedCurveExportMode,
  rowCount,
  scopedFileIds,
  selectedCurveOptionKeySet,
  setResolvedCurveExportMode,
  t,
}: RcAnalysisToolbarProps) => (
  <div
    role="toolbar"
    aria-label="Contact resistance"
    className="rounded-xl border border-border bg-bg-page/40 px-4 py-3"
  >
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
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
