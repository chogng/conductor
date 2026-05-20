import { lxDownloadTray, lxTrash } from "cogicon";
import { jsx } from "react/jsx-runtime";
import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import Card from "cs/base/browser/ui/Card/Card";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import SidebarPart, {
  type SidebarPartProps,
  type WorkbenchSidebarHeaderAction,
} from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import CsvImporter, {
  type CsvImporterProps,
  type CsvImporterRef,
} from "src/cs/workbench/contrib/dataImport/CsvImporter";

export type ImportSidebarProps = {
  readonly hasSessionData: boolean;
  readonly importerRef: MutableRefObject<CsvImporterRef | null>;
  readonly onClearSession?: () => void;
  readonly onDataImported?: CsvImporterProps["onDataImported"];
  readonly onDataRemoved?: CsvImporterProps["onDataRemoved"];
  readonly onFileSelected?: CsvImporterProps["onFileSelected"];
  readonly onImportTrigger?: () => void;
  readonly rawData?: CsvImporterProps["files"];
  readonly selectedPreviewFileId?: CsvImporterProps["selectedFileId"];
  readonly t: TranslateFn;
};

const ImportSidebar = ({
  hasSessionData,
  importerRef,
  onClearSession,
  onDataImported,
  onDataRemoved,
  onFileSelected,
  onImportTrigger,
  rawData = [],
  selectedPreviewFileId,
  t,
}: ImportSidebarProps) => {
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
      icon: jsx(CogIcon, {
        icon: lxDownloadTray,
        size: 16,
      }),
    },
    {
      id: "analysis-clear-session-btn",
      title: t("da_reset_session"),
      kind: "icon",
      icon: jsx(CogIcon, {
        icon: lxTrash,
        size: 16,
      }),
      isDanger: true,
      isDisabled: !hasSessionData,
    },
  ];

  const handleSidebarAction: SidebarPartProps["onAction"] = (action) => {
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

  return jsx(SidebarPart, {
    ariaLabel: t("da_import_section"),
    headerActions,
    onAction: handleSidebarAction,
    children: jsx("section", {
      className: "flex-1 flex flex-col min-h-0",
      children: jsx(Card, {
        id: "analysis-import-card",
        cta: "Device analysis",
        ctaPosition: "data-import",
        ctaCopy: "csv importer",
        variant: "flat",
        className: "p-4 flex flex-col flex-1 min-h-0",
        children: jsx(CsvImporter, {
          ref: importerRef,
          files: rawData,
          onDataImported,
          onDataRemoved,
          onFileSelected,
          selectedFileId: selectedPreviewFileId,
        }),
      }),
    }),
  });
};

export default ImportSidebar;
