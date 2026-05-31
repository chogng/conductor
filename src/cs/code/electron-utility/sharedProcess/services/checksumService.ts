import fs from "node:fs";
import { createHash } from "node:crypto";

export type ChecksumAlgorithm = "sha256" | "sha512";

export interface FileChecksum {
  readonly algorithm: ChecksumAlgorithm;
  readonly value: string;
}

export const computeFileChecksum = async (
  filePath: string,
  algorithm: ChecksumAlgorithm = "sha256",
): Promise<FileChecksum> =>
  new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      resolve({ algorithm, value: hash.digest("hex") });
    });
  });

export const verifyFileChecksum = async (
  filePath: string,
  expected: FileChecksum,
) => {
  const actual = await computeFileChecksum(filePath, expected.algorithm);
  return actual.value.toLowerCase() === expected.value.toLowerCase();
};
