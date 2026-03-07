import { AlertCircle, RefreshCw, Upload } from "lucide-react";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import ScrollArea from "../../../components/ui/ScrollArea";
import CsvImporter from "./CsvImporter";
import TemplateManager from "./TemplateManager";

const DeviceAnalysisDataPanel = ({
  deviceAnalysisSettings,
  ensurePreviewRows,
  extractionErrors,
  getExtractionErrorMessage,
  getPreviewRow,
  getPreviewRowsVersion,
  hasSessionData,
  importerRef,
  isResizing,
  onClearExtractionErrors,
  onClearSession,
  onDataImported,
  onDataRemoved,
  onFileSelected,
  onStartResizing,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  onUpdateDeviceAnalysisSettings,
  previewFile,
  previewStatus,
  rawData,
  selectedPreviewFileId,
  subscribePreviewRowsVersion,
  t,
}) => {
  return (
    <div className="min-h-full grid grid-cols-1 xl:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] gap-1 xl:gap-1 xl:h-full">
      <aside className="xl:min-h-0 flex flex-col h-full relative group/sidebar">
        <section
          aria-label={t("da_import_section")}
          className="flex-1 flex flex-col min-h-0"
        >
          <Card
            id="device-analysis-import-card"
            cta="Device analysis"
            ctaPosition="data-import"
            ctaCopy="csv importer"
            className="p-4 flex flex-col flex-1 min-h-0"
          >
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center justify-between gap-1 w-full">
                <Button
                  id="device-analysis-import-csv-btn"
                  type="button"
                  variant="primary"
                  size="md"
                  dataIcon="with"
                  cta="Device analysis"
                  ctaPosition="data-import"
                  ctaCopy="import csv"
                  aria-label={t("da_import_csv")}
                  onClick={() => importerRef.current?.openFileDialog()}
                >
                  <Upload size={16} />
                  {t("da_import_csv")}
                </Button>

                <Button
                  id="device-analysis-clear-session-btn"
                  type="button"
                  variant="danger"
                  size="control"
                  dataIcon="with"
                  cta="Device analysis"
                  ctaPosition="data-import"
                  ctaCopy="reset session"
                  aria-label={t("da_reset_session")}
                  title={t("da_reset_session")}
                  onClick={onClearSession}
                  disabled={!hasSessionData}
                >
                  <RefreshCw
                    size={16}
                    className="transition-transform duration-500 hover:rotate-180"
                  />
                </Button>
              </div>

              <div className="px-1">
                <span className="meta_text whitespace-nowrap">
                  {t("da_loaded_csv_files", { count: rawData.length })}
                </span>
              </div>
            </div>

            <CsvImporter
              ref={importerRef}
              files={rawData}
              onDataImported={onDataImported}
              onDataRemoved={onDataRemoved}
              onFileSelected={onFileSelected}
              selectedFileId={selectedPreviewFileId}
            />
          </Card>
        </section>

        {extractionErrors.length > 0 ? (
          <section
            aria-label={t("da_extraction_errors")}
            className="absolute bottom-4 left-4 right-4 z-50 pointer-events-none"
          >
            <div
              id="device-analysis-extraction-errors"
              className="pointer-events-auto bg-bg-surface/80 backdrop-blur-xl border border-red-500/30 rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-4 duration-300"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-red-500">
                  <AlertCircle size={18} />
                  <h3 className="text-sm font-semibold">
                    {t("da_extraction_errors")} ({extractionErrors.length})
                  </h3>
                </div>
                <button
                  id="device-analysis-extraction-errors-clear-btn"
                  type="button"
                  onClick={onClearExtractionErrors}
                  className="text-xs px-2 py-1 rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  {t("common_clear")}
                </button>
              </div>

              <ScrollArea
                className="mt-3 max-h-48"
                viewportClassName="pr-2"
                axis="y"
              >
                <ul className="space-y-2 text-sm text-text-secondary">
                  {extractionErrors.map((errorItem, index) => (
                    <li
                      key={`${errorItem.fileName}-${index}`}
                      className="flex flex-col gap-1"
                    >
                      <span className="font-semibold text-text-primary text-xs">
                        {errorItem.fileName}
                      </span>{" "}
                      <div className="bg-red-500/5 rounded-lg p-2 border border-red-500/10">
                        <span className="whitespace-pre-wrap leading-relaxed opacity-90">
                          {getExtractionErrorMessage(errorItem)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </section>
        ) : null}

        <div
          className="hidden xl:block absolute -right-[7px] top-0 bottom-0 w-[10px] cursor-col-resize z-50 group/sash"
          onMouseDown={onStartResizing}
        >
          <div
            className={`absolute left-1/2 top-4 bottom-4 w-[2px] -translate-x-1/2 rounded-full transition-all duration-500 bg-accent/0 group-hover/sash:bg-accent/30 group-hover/sash:delay-300 group-hover/sash:shadow-[0_0_12px_rgba(var(--color-accent-rgb),0.5)] ${
              isResizing
                ? "bg-accent/60 shadow-[0_0_16px_rgba(var(--color-accent-rgb),0.6)]"
                : ""
            }`}
          />

          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[4px] h-[24px] rounded-full bg-accent opacity-0 transition-all duration-300 scale-y-50 group-hover/sash:opacity-100 group-hover/sash:scale-y-100 group-hover/sash:delay-500 ${
              isResizing ? "opacity-100 scale-y-125" : ""
            }`}
          />
        </div>
      </aside>

      <section
        aria-label={t("da_data_extraction_template")}
        className="xl:min-h-0 flex flex-col h-full"
      >
        <TemplateManager
          previewFile={previewFile}
          previewStatus={previewStatus}
          getPreviewRow={getPreviewRow}
          ensurePreviewRows={ensurePreviewRows}
          onTemplateApplied={onTemplateApplied}
          onTemplateAppliedIncremental={onTemplateAppliedIncremental}
          subscribePreviewRowsVersion={subscribePreviewRowsVersion}
          getPreviewRowsVersion={getPreviewRowsVersion}
          deviceAnalysisSettings={deviceAnalysisSettings}
          onUpdateDeviceAnalysisSettings={onUpdateDeviceAnalysisSettings}
        />
      </section>
    </div>
  );
};

export default DeviceAnalysisDataPanel;
