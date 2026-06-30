/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IExtUri } from "src/cs/base/common/resources";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IUriIdentityService = createDecorator<IUriIdentityService>("uriIdentityService");

export interface IUriIdentityService {
  readonly _serviceBrand: undefined;

  readonly extUri: IExtUri;

  asCanonicalUri(uri: URI): URI;
}
