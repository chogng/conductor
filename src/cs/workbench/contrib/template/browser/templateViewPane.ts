import { jsx } from "react/jsx-runtime";
import PreviewPart from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import TemplateManager, { type TemplateManagerProps } from "src/cs/workbench/contrib/template/browser/templateView";

export type TemplateViewPaneProps = TemplateManagerProps & {
  readonly t: TranslateFn;
};

const TemplateViewPane = ({
  t,
  ...props
}: TemplateViewPaneProps) =>
  jsx(PreviewPart, {
    id: "analysis-template-workspace",
    ariaLabel: t("da_data_extraction_template"),
    className: "flex h-full min-h-0 flex-col",
    children: jsx(TemplateManager, props),
  });

export default TemplateViewPane;
