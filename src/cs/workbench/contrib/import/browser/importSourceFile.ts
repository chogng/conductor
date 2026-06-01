export type ImportSourceFile = {
  readonly file: File;
  readonly relativePath?: string | null;
};

export const getFileRelativePath = (file: File): string | null => {
  const path = file.webkitRelativePath?.trim();
  return path || null;
};

export const createImportSourceFile = (file: File): ImportSourceFile => ({
  file,
  relativePath: getFileRelativePath(file),
});
