import { collectDataTransferFiles } from "src/cs/platform/dnd/browser/dnd";
import type { FileSource } from "src/cs/workbench/contrib/files/common/files";

export {
  buildFileIdentityKey,
  buildItemKey,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> => collectDataTransferFiles(dataTransfer);
