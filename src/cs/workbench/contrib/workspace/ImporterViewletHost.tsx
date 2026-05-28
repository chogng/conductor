import { jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef } from "react";
import {
  ImporterViewletView,
  type ImporterViewletProps,
} from "src/cs/workbench/contrib/import/browser/importerViewlet";

const ImporterViewletHost = (props: ImporterViewletProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<ImporterViewletView | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const view = new ImporterViewletView(host, props);
    viewRef.current = view;

    return () => {
      if (viewRef.current === view) {
        viewRef.current = null;
      }
      view.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    viewRef.current?.setProps(props);
  }, [
    props.hasSessionData,
    props.importerRef,
    props.onClearSession,
    props.onDataImported,
    props.onDataRemoved,
    props.onFileSelected,
    props.onImportTrigger,
    props.rawData,
    props.selectedPreviewFileId,
    props.t,
  ]);

  return jsx("div", {
    ref: hostRef,
    className: "flex flex-col flex-1 min-h-0",
  });
};

export default ImporterViewletHost;
