import { Import, RefreshCw } from "lucide-react";
import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  useState,
} from "react";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import type { TranslateFn } from "../../../context/language";
import CsvImporter from "./CsvImporter";
import type {
  CsvImporterProps,
  CsvImporterRef,
} from "./CsvImporter";
import TemplateManager, {
  type TemplateManagerProps,
} from "./template/TemplateManager";

type DataPanelProps = {
  deviceAnalysisSettings?: TemplateManagerProps["deviceAnalysisSettings"];
  ensurePreviewRows?: TemplateManagerProps["ensurePreviewRows"];
  getPreviewRow?: TemplateManagerProps["getPreviewRow"];
  getPreviewRowsVersion?: TemplateManagerProps["getPreviewRowsVersion"];
  hasSessionData: boolean;
  importerRef: MutableRefObject<CsvImporterRef | null>;
  isResizing: boolean;
  onClearSession?: () => void;
  onDataImported?: CsvImporterProps["onDataImported"];
  onDataRemoved?: CsvImporterProps["onDataRemoved"];
  onImportTrigger?: () => void;
  onFileSelected?: CsvImporterProps["onFileSelected"];
  onStartResizing?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onTemplateApplied?: TemplateManagerProps["onTemplateApplied"];
  onTemplateAppliedIncremental?: TemplateManagerProps["onTemplateAppliedIncremental"];
  onUpdateDeviceAnalysisSettings?: TemplateManagerProps["onUpdateDeviceAnalysisSettings"];
  previewFile?: TemplateManagerProps["previewFile"];
  previewStatus?: TemplateManagerProps["previewStatus"];
  rawData?: CsvImporterProps["files"];
  selectedPreviewFileId?: CsvImporterProps["selectedFileId"];
  subscribePreviewRowsVersion?: TemplateManagerProps["subscribePreviewRowsVersion"];
  t: TranslateFn;
};

const DeviceAnalysisDataPanel = ({
  deviceAnalysisSettings,
  ensurePreviewRows,
  getPreviewRow,
  getPreviewRowsVersion,
  hasSessionData,
  importerRef,
  isResizing,
  onClearSession,
  onDataImported,
  onDataRemoved,
  onImportTrigger,
  onFileSelected,
  onStartResizing,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  onUpdateDeviceAnalysisSettings,
  previewFile,
  previewStatus,
  rawData = [],
  selectedPreviewFileId,
  subscribePreviewRowsVersion,
  t,
}: DataPanelProps) => {
  const [pendingImporterOpen, setPendingImporterOpen] = useState(false);
  const fallbackImporterHandleRef = useRef<CsvImporterRef>({
    openFileDialog: () => {
      setPendingImporterOpen(true);
    },
    get hasFiles() {
      return false;
    },
  });

  useEffect(() => {
    Object.defineProperty(fallbackImporterHandleRef.current, "hasFiles", {
      configurable: true,
      enumerable: true,
      get: () => rawData.length > 0,
    });

    if (importerRef.current === null) {
      importerRef.current = fallbackImporterHandleRef.current;
    }

    return () => {
      if (importerRef.current === fallbackImporterHandleRef.current) {
        importerRef.current = null;
      }
    };
  }, [importerRef, rawData.length]);

  useEffect(() => {
    if (!pendingImporterOpen) return;
    if (importerRef.current === fallbackImporterHandleRef.current) return;
    if (!importerRef.current?.openFileDialog) return;

    setPendingImporterOpen(false);
    importerRef.current.openFileDialog();
  }, [importerRef, pendingImporterOpen]);

  return (
    <div className="min-h-full grid grid-cols-1 min-[1200px]:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] gap-1 min-[1200px]:gap-1 min-[1200px]:h-full">
      <aside className="min-[1200px]:min-h-0 flex flex-col h-full relative group/sidebar">
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
                  onClick={() => {
                    if (onImportTrigger) {
                      onImportTrigger();
                      return;
                    }

                    importerRef.current?.openFileDialog?.();
                  }}
                >
                  <Import size={16} />
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

        <div
          className="hidden min-[1200px]:block absolute -right-[7px] top-0 bottom-0 w-[10px] cursor-col-resize z-50 group/sash"
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
        id="device-analysis-template-panel"
        aria-label={t("da_data_extraction_template")}
        className="min-[1200px]:min-h-0 flex flex-col h-full"
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
