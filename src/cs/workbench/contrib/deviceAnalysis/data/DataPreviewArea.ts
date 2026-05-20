import { jsx } from "react/jsx-runtime";
import type { ReactNode } from "react";
import SplitView from "src/cs/base/browser/ui/splitview/splitview";

export type DataPreviewAreaProps = {
  readonly tabPanel: ReactNode;
  readonly tablePreview: ReactNode;
};

const DataPreviewArea = ({ tabPanel, tablePreview }: DataPreviewAreaProps) =>
  jsx(SplitView, {
    className: "flex-1 min-h-0",
    gap: 16,
    orientation: "horizontal",
    panes: [
      {
        id: "tab-panel",
        defaultSize: 300,
        minSize: 250,
        maxSize: 460,
        children: tabPanel,
      },
      {
        id: "table-preview",
        minSize: 420,
        children: tablePreview,
      },
    ],
  });

export default DataPreviewArea;
