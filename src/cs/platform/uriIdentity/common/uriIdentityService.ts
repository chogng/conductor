/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isLinux } from "src/cs/base/common/platform";
import { ExtUri, type IExtUri } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IUriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentity";

const FILE_SCHEME = "file";
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

  public readonly extUri: IExtUri = new ExtUri(uri =>
    uri.scheme === FILE_SCHEME ? !isLinux : false
  );

  private readonly canonicalUris = new Map<string, CanonicalUriEntry>();

  public asCanonicalUri(uri: URI): URI {
    const normalizedUri = uri.scheme === FILE_SCHEME
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
    this.canonicalUris.clear();
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
