/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ExtUri, type IExtUri } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import {
  FileSystemProviderCapabilities,
  IFileService,
  type IFileSystemProviderCapabilitiesChangeEvent,
  type IFileSystemProviderRegistrationEvent,
} from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IUriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentity";

const CANONICAL_URI_LIMIT = 2 ** 16;

class CanonicalUriEntry {
  private static clock = 0;
  public time = CanonicalUriEntry.clock++;

  public constructor(public readonly uri: URI) {}

  public touch(): this {
    this.time = CanonicalUriEntry.clock++;
    return this;
  }
}

export class UriIdentityService implements IUriIdentityService {
  public declare readonly _serviceBrand: undefined;

  public readonly extUri: IExtUri;
  private readonly disposables = new DisposableStore();
  private readonly canonicalUris = new Map<string, CanonicalUriEntry>();
  private readonly schemeIgnoresPathCasing = new Map<string, boolean>();

  public constructor(
    @IFileService private readonly fileService: IFileService,
  ) {
    this.extUri = new ExtUri(uri => this.ignorePathCasing(uri));
    this.disposables.add(Event.any<
      IFileSystemProviderCapabilitiesChangeEvent | IFileSystemProviderRegistrationEvent
    >(
      this.fileService.onDidChangeFileSystemProviderCapabilities,
      this.fileService.onDidChangeFileSystemProviderRegistrations,
    )(event => this.onDidChangeFileSystemProvider(event.scheme)));
  }

  public asCanonicalUri(uri: URI): URI {
    const normalizedUri = this.fileService.hasProvider(uri)
      ? this.extUri.normalizePath(uri)
      : uri;
    const uriKey = this.extUri.getComparisonKey(normalizedUri, true);
    const entry = this.canonicalUris.get(uriKey);
    if (entry) {
      return entry.touch().uri.with({ fragment: normalizedUri.fragment });
    }

    this.canonicalUris.set(uriKey, new CanonicalUriEntry(normalizedUri));
    this.trimCanonicalUris();
    return normalizedUri;
  }

  public dispose(): void {
    this.disposables.dispose();
    this.canonicalUris.clear();
    this.schemeIgnoresPathCasing.clear();
  }

  private ignorePathCasing(uri: URI): boolean {
    let ignorePathCasing = this.schemeIgnoresPathCasing.get(uri.scheme);
    if (ignorePathCasing === undefined) {
      ignorePathCasing = this.fileService.hasProvider(uri) &&
        !this.fileService.hasCapability(uri, FileSystemProviderCapabilities.PathCaseSensitive);
      this.schemeIgnoresPathCasing.set(uri.scheme, ignorePathCasing);
    }
    return ignorePathCasing;
  }

  private onDidChangeFileSystemProvider(scheme: string): void {
    const oldIgnorePathCasing = this.schemeIgnoresPathCasing.get(scheme);
    if (oldIgnorePathCasing === undefined) {
      return;
    }

    this.schemeIgnoresPathCasing.delete(scheme);
    const nextIgnorePathCasing = this.ignorePathCasing(URI.from({ path: "", scheme }));
    if (oldIgnorePathCasing === nextIgnorePathCasing) {
      return;
    }

    for (const [key, entry] of this.canonicalUris) {
      if (entry.uri.scheme === scheme) {
        this.canonicalUris.delete(key);
      }
    }
  }

  private trimCanonicalUris(): void {
    if (this.canonicalUris.size < CANONICAL_URI_LIMIT) {
      return;
    }

    const entries = [...this.canonicalUris.entries()]
      .sort((first, second) => first[1].time - second[1].time);
    for (let index = 0; index < Math.floor(entries.length / 2); index += 1) {
      this.canonicalUris.delete(entries[index][0]);
    }
  }
}

registerSingleton(IUriIdentityService, UriIdentityService, InstantiationType.Delayed);
