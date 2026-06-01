export type FileSource = {
  readonly file: File;
  readonly relativePath?: string | null;
};

export const getFileRelativePath = (file: File): string | null => {
  const path = file.webkitRelativePath?.trim();
  return path || null;
};

export const createFileSource = (file: File): FileSource => ({
  file,
  relativePath: getFileRelativePath(file),
});
