import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FileChecksum } from "./checksumService.js";
import { verifyFileChecksum } from "./checksumService.js";

export interface DownloadToFileOptions {
  readonly checksum?: FileChecksum;
  readonly userAgent?: string;
}

export interface DownloadToFileResult {
  readonly path: string;
  readonly verified: boolean;
}

const requestUrl = (url: URL, userAgent?: string) =>
  new Promise<http.IncomingMessage>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      url,
      {
        headers: userAgent ? { "user-agent": userAgent } : undefined,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          requestUrl(new URL(response.headers.location, url), userAgent)
            .then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${statusCode}: ${url.toString()}`));
          return;
        }

        resolve(response);
      },
    );

    request.on("error", reject);
  });

export const downloadToFile = async (
  urlValue: string,
  destinationPath: string,
  options: DownloadToFileOptions = {},
): Promise<DownloadToFileResult> => {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported download protocol: ${url.protocol}`);
  }

  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const response = await requestUrl(url, options.userAgent);
  await pipeline(response, fs.createWriteStream(destinationPath));

  const verified = options.checksum
    ? await verifyFileChecksum(destinationPath, options.checksum)
    : false;

  if (options.checksum && !verified) {
    await fs.promises.rm(destinationPath, { force: true });
    throw new Error(`Downloaded file checksum mismatch: ${destinationPath}`);
  }

  return { path: destinationPath, verified };
};
