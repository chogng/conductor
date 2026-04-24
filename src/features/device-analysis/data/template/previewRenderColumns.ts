export const resolvePreviewRenderColumnCount = ({
  dataColumnCount,
  minColumnWidthPx,
  previewViewportWidth,
  rowIndexWidthPx,
}: {
  dataColumnCount: number;
  minColumnWidthPx: number;
  previewViewportWidth: number;
  rowIndexWidthPx: number;
}): number => {
  const realColumnCount = Math.max(0, Math.floor(Number(dataColumnCount) || 0));
  const dataViewportWidth = Math.max(
    0,
    Math.floor(Number(previewViewportWidth) || 0) -
      Math.max(0, Math.floor(Number(rowIndexWidthPx) || 0)),
  );
  const placeholderColumnCount = Math.ceil(
    dataViewportWidth / Math.max(1, Math.floor(Number(minColumnWidthPx) || 1)),
  );

  return Math.max(realColumnCount, placeholderColumnCount);
};
