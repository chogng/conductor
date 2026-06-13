import { isNative } from "src/cs/base/common/platform";

type ElectronWebUtils = {
  conductor?: {
    webUtils?: {
      getPathForFile(file: File): string;
    };
  };
};

export function getPathForFile(file: File): string | undefined {
  if (
    isNative &&
    typeof (globalThis as ElectronWebUtils).conductor?.webUtils?.getPathForFile === "function"
  ) {
    return (globalThis as ElectronWebUtils).conductor?.webUtils?.getPathForFile(file);
  }

  return undefined;
}

export function containsDragType(event: DragEvent, ...dragTypesToFind: string[]): boolean {
  if (!event.dataTransfer) {
    return false;
  }

  const lowercaseDragTypes = Array.from(
    event.dataTransfer.types,
    (dragType) => dragType.toLowerCase(),
  );

  for (const dragType of dragTypesToFind) {
    if (lowercaseDragTypes.includes(dragType.toLowerCase())) {
      return true;
    }
  }

  return false;
}
