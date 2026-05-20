import { jsx, jsxs } from "react/jsx-runtime";
import { lxDownloadTray } from "cogicon";
import Avatar from "cs/base/browser/ui/Avatar/Avatar";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";

export type ImportEmptyViewProps = {
  readonly t: TranslateFn;
};

const ImportEmptyViewIcon = ({ className }: { className?: string }) =>
  jsx(CogIcon, {
    icon: lxDownloadTray,
    size: "100%",
    className,
  });

const ImportEmptyView = ({ t }: ImportEmptyViewProps) =>
  jsxs(
    "div",
    {
      id: "analysis-csv-empty",
      "data-slot": "empty",
      className: "import-viewer-empty",
      children: [
        jsx(Avatar, {
          icon: ImportEmptyViewIcon,
          size: "md",
          variant: "empty",
        }),
        jsxs("p", {
          className: "import-viewer-empty-subtitle",
          children: [
            t("da_csv_empty_subtitle_prefix"),
            " ",
            jsx("span", {
              className: "import-viewer-empty-browse",
              children: t("da_csv_empty_browse"),
            }),
          ],
        }),
      ],
    },
    "empty",
  );

export default ImportEmptyView;
