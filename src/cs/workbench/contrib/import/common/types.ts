import type { RawDataEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";

export type ImportAxisRole = "vg" | "vd" | null;

export type ImportAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "shape"
  | null;

export type ImportSessionFileEntry = FileEntry;

export type ImportSessionFileInfo = RawDataEntry & {
  fileId: string;
  fileName: string;
  file: File;
  size: number;
  lastModified: number;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: ImportAxisRole;
  xAxisRoleSource?: ImportAxisRoleSource;
};

export type ImportSessionRef = {
  openFileDialog: () => void;
  hasFiles: boolean;
};
