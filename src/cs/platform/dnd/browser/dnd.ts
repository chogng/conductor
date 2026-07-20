import { isNative } from "src/cs/base/common/platform";
import {
  WebFileSystemAccess,
  type FileSystemHandle,
} from "src/cs/platform/files/browser/webFileSystemAccess";

type ElectronWebUtils = {
  conductor?: {
    webUtils?: {
      getPathForFile(file: File): string;
    };
  };
};

type DataTransferItemWithFileSystemAccess = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
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

export async function extractFileSystemHandles(
  items: DataTransferItemList | readonly DataTransferItem[],
): Promise<FileSystemHandle[]> {
  const results = await Promise.all(
    Array.from(items, async item => {
      const getAsFileSystemHandle =
        (item as DataTransferItemWithFileSystemAccess).getAsFileSystemHandle;
      if (typeof getAsFileSystemHandle !== "function") {
        return undefined;
      }

      try {
        const handle = await getAsFileSystemHandle.call(item);
        return WebFileSystemAccess.isFileSystemHandle(handle)
          ? handle
          : undefined;
      } catch {
        return undefined;
      }
    }),
  );

  return results.filter(
    (result): result is FileSystemHandle => Boolean(result),
  );
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
