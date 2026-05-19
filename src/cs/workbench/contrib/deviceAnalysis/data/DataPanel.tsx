import { lxDownloadTray, lxTrash } from "cogicon";
import {
  useEffect,
  useRef,
  type MutableRefObject,
  useState,
} from "react";
import Card from "cs/base/browser/ui/Card/Card";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import WorkbenchSidebar, { type WorkbenchSidebarProps } from "src/cs/workbench/browser/parts/sidebar/WorkbenchSidebar";
import type { WorkbenchSidebarHeaderAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import CsvImporter from "./CsvImporter";
import type {
  CsvImporterProps,
  CsvImporterRef,
} from "./CsvImporter";
import TemplateManager, {
  type TemplateManagerProps,
} from "./template/TemplateManager";

type DataPanelProps = {
  analysisSettings?: TemplateManagerProps["analysisSettings"];
  ensurePreviewCells?: TemplateManagerProps["ensurePreviewCells"];
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
  onStartResizing?: WorkbenchSidebarProps["onStartResizing"];
  onTemplateApplied?: TemplateManagerProps["onTemplateApplied"];
  onTemplateAppliedIncremental?: TemplateManagerProps["onTemplateAppliedIncremental"];
  onUpdateSettings?: TemplateManagerProps["onUpdateSettings"];
  previewFile?: TemplateManagerProps["previewFile"];
  previewStatus?: TemplateManagerProps["previewStatus"];
  rawData?: CsvImporterProps["files"];
  selectedPreviewFileId?: CsvImporterProps["selectedFileId"];
  subscribePreviewRowsVersion?: TemplateManagerProps["subscribePreviewRowsVersion"];
  t: TranslateFn;
};

const DataPanel = ({
  analysisSettings,
  ensurePreviewCells,
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
  onUpdateSettings,
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

  const headerActions: WorkbenchSidebarHeaderAction[] = [
    {
      id: "analysis-import-csv-btn",
      title: t("da_import_csv"),
      kind: "primary",
      icon: <CogIcon icon={lxDownloadTray} size={16} />,
    },
    {
      id: "analysis-clear-session-btn",
      title: t("da_reset_session"),
      kind: "icon",
      icon: <CogIcon icon={lxTrash} size={16} />,
      isDanger: true,
      isDisabled: !hasSessionData,
    },
  ];

  const handleSidebarAction: WorkbenchSidebarProps["onAction"] = (action) => {
    if (action.id === "analysis-import-csv-btn") {
      if (onImportTrigger) {
        onImportTrigger();
        return;
      }

      importerRef.current?.openFileDialog?.();
      return;
    }

    if (action.id === "analysis-clear-session-btn") {
      onClearSession?.();
    }
  };

  return (
    <div className="grid min-h-full h-full grid-cols-[var(--sidebar-width)_minmax(0,1fr)] gap-1">
      <WorkbenchSidebar
        ariaLabel={t("da_import_section")}
        badge={{
          text: String(rawData.length),
          tone: rawData.length > 0 ? "accent" : "default",
        }}
        description={t("da_loaded_csv_files", { count: rawData.length })}
        headerActions={headerActions}
        isResizing={isResizing}
        onAction={handleSidebarAction}
        onStartResizing={onStartResizing}
        title={t("da_import_section")}
      >
        <section
          className="flex-1 flex flex-col min-h-0"
        >
          <Card
            id="analysis-import-card"
            cta="Device analysis"
            ctaPosition="data-import"
            ctaCopy="csv importer"
            className="p-4 flex flex-col flex-1 min-h-0"
          >
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
      </WorkbenchSidebar>

      <section
        id="analysis-template-panel"
        aria-label={t("da_data_extraction_template")}
        className="flex h-full min-h-0 flex-col"
      >
        <TemplateManager
          previewFile={previewFile}
          previewStatus={previewStatus}
          rawData={rawData}
          getPreviewRow={getPreviewRow}
          ensurePreviewCells={ensurePreviewCells}
          ensurePreviewRows={ensurePreviewRows}
          onTemplateApplied={onTemplateApplied}
          onTemplateAppliedIncremental={onTemplateAppliedIncremental}
          subscribePreviewRowsVersion={subscribePreviewRowsVersion}
          getPreviewRowsVersion={getPreviewRowsVersion}
          analysisSettings={analysisSettings}
          onUpdateSettings={onUpdateSettings}
        />
      </section>
    </div>
  );
};

export default DataPanel;
