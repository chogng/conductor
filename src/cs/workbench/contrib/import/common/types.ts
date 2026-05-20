export type ImportAxisRole = "vg" | "vd" | null;

export type ImportAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "shape"
  | null;

export type ImporterFileEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  itemKey?: string;
  normalizedCsvPath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
};

export type ImportedFileInfo = {
  fileId: string;
  fileName: string;
  file: File;
  size: number;
  lastModified: number;
  normalizedCsvPath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: ImportAxisRole;
  xAxisRoleSource?: ImportAxisRoleSource;
};

export type ImporterRef = {
  openFileDialog: () => void;
  hasFiles: boolean;
};
