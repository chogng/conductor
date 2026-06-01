import type { RawDataEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import {
  buildFileIdentityKey,
  buildItemKey,
  createImportFileId,
} from "src/cs/workbench/contrib/import/preview/csvImportUtils";
import { importService } from "src/cs/workbench/services/import/browser/importService";

const DEMO_FILE_PATHS = [
  "/demo/demo-01.csv",
  "/demo/demo-02.csv",
  "/demo/demo-03.csv",
  "/demo/demo-04.csv",
  "/demo/demo-05.csv",
  "/demo/demo-06.csv",
] as const;

type DesktopDemoFileEntry = {
  fileName?: string;
  lastModified?: number;
  path?: string;
  size?: number;
  text?: string;
};

type DemoFileSource = {
  fileName: string;
  lastModified: number;
  sourcePath: string | null;
  text: string;
};

export type ImportedDemoRawDataEntry = RawDataEntry & {
  file: File;
  fileId: string;
  fileName: string;
  itemKey: string;
  lastModified: number;
  size: number;
  sourceKey: string;
  sourcePath: string | null;
};

const normalizeDesktopDemoFile = (
  entry: DesktopDemoFileEntry,
  index: number,
): DemoFileSource => ({
  fileName: entry.fileName || `demo-${index + 1}.csv`,
  lastModified: Number.isFinite(Number(entry.lastModified))
    ? Number(entry.lastModified)
    : Date.UTC(2026, 0, index + 1),
  sourcePath: typeof entry.path === "string" ? entry.path : null,
  text: entry.text || "",
});

const readDesktopDemoFiles = async (): Promise<DemoFileSource[]> => {
  if (!importService.canGetDemoFiles()) {
    return [];
  }

  const desktopDemoFiles = await importService.getDemoFiles();
  const desktopEntries = Array.isArray(desktopDemoFiles?.files)
    ? desktopDemoFiles.files.filter(
        (entry): entry is DesktopDemoFileEntry =>
          typeof entry?.fileName === "string" && typeof entry?.text === "string",
      )
    : [];

  return desktopEntries.map(normalizeDesktopDemoFile);
};

const readBundledDemoFiles = async (): Promise<DemoFileSource[]> =>
  Promise.all(
    DEMO_FILE_PATHS.map(async (pathValue, index) => {
      const response = await fetch(pathValue);
      if (!response.ok) {
        throw new Error(`Failed to load demo file: ${pathValue}`);
      }

      const text = await response.text();
      const fileName = pathValue.split("/").pop() || `demo-${index + 1}.csv`;
      return {
        fileName,
        lastModified: Date.UTC(2026, 0, index + 1),
        sourcePath: null,
        text,
      };
    }),
  );

const createDemoRawDataEntry = (
  source: DemoFileSource,
): ImportedDemoRawDataEntry | null => {
  const file = new File([source.text], source.fileName, {
    type: "text/csv;charset=utf-8",
    lastModified: source.lastModified,
  });
  const sourceKey = buildFileIdentityKey(file);
  if (!sourceKey) return null;

  return {
    file,
    fileId: createImportFileId(),
    fileName: source.fileName,
    itemKey: buildItemKey(file),
    sourcePath: source.sourcePath,
    sourceKey,
    size: file.size,
    lastModified: file.lastModified,
  };
};

export const importDemoRawDataEntries = async (): Promise<
  ImportedDemoRawDataEntry[]
> => {
  const desktopSources = await readDesktopDemoFiles();
  const demoSources =
    desktopSources.length > 0 ? desktopSources : await readBundledDemoFiles();

  return demoSources
    .map(createDemoRawDataEntry)
    .filter((entry): entry is ImportedDemoRawDataEntry => Boolean(entry));
};
