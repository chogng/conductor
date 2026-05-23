import { jsx, jsxs } from "react/jsx-runtime";
import type { ReactNode } from "react";
import ScrollArea from "src/cs/base/browser/ui/scrollArea/scrollArea";

export type DeviceAnalysisPageParts = {
  readonly controller?: ReactNode;
  readonly dataSidebar: ReactNode;
  readonly workspace: ReactNode;
  readonly overlay?: ReactNode;
};

export type DeviceAnalysisPanePartProps = {
  readonly children: ReactNode;
  readonly isActive: boolean;
  readonly labelledBy: string;
  readonly paneId: string;
};

export type DeviceAnalysisScrollPanePartProps = DeviceAnalysisPanePartProps & {
  readonly className?: string;
  readonly viewportClassName?: string;
};

export type DeviceAnalysisSidebarPartProps = {
  readonly sidebar: ReactNode;
};

export type DeviceAnalysisOptionalPartProps = {
  readonly content?: ReactNode;
};

type BuildDeviceAnalysisPagePartsProps = {
  readonly AnalysisPanel: ReactNode;
  readonly DataPanel: ReactNode;
  readonly ImportSidebar: ReactNode;
  readonly OnboardingOverlay?: ReactNode;
  readonly OnboardingController?: ReactNode;
};

export const buildDeviceAnalysisPageParts = ({
  AnalysisPanel,
  DataPanel,
  ImportSidebar,
  OnboardingOverlay,
  OnboardingController,
}: BuildDeviceAnalysisPagePartsProps): DeviceAnalysisPageParts => ({
  controller: OnboardingController ?? null,
  dataSidebar: ImportSidebar,
  workspace: jsxs("div", {
    className: "relative h-full min-h-0",
    children: [DataPanel, AnalysisPanel],
  }),
  overlay: OnboardingOverlay ?? null,
});

export const buildDeviceAnalysisPanePart = ({
  children,
  isActive,
  labelledBy,
  paneId,
}: DeviceAnalysisPanePartProps): ReactNode =>
  jsx("section", {
    id: paneId,
    role: "region",
    "aria-labelledby": labelledBy,
    "aria-hidden": !isActive,
    inert: !isActive ? true : undefined,
    className: isActive ? "h-full min-h-0" : "hidden h-full min-h-0",
    children,
  });

export const buildDeviceAnalysisScrollPanePart = ({
  children,
  isActive,
  labelledBy,
  paneId,
  className = "da_page_scroll h-full min-h-0",
  viewportClassName,
}: DeviceAnalysisScrollPanePartProps): ReactNode =>
  buildDeviceAnalysisPanePart({
    isActive,
    labelledBy,
    paneId,
    children: jsx(ScrollArea, {
      className,
      viewportClassName,
      axis: "y",
      children,
    }),
  });

export const buildDeviceAnalysisSidebarPart = ({
  sidebar,
}: DeviceAnalysisSidebarPartProps): ReactNode => sidebar;

export const buildDeviceAnalysisOptionalPart = ({
  content,
}: DeviceAnalysisOptionalPartProps): ReactNode => content ?? null;
