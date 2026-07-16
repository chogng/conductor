/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from "src/cs/platform/ipc/electron-browser/services";
import { IUpdateService } from "src/cs/platform/update/common/update";
import {
  UPDATE_CHANNEL_NAME,
  UpdateChannelClient,
} from "src/cs/platform/update/common/updateIpc";

registerMainProcessRemoteService(IUpdateService, UPDATE_CHANNEL_NAME, {
  channelClientCtor: UpdateChannelClient,
});
