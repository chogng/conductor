import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { generateUuid } from "src/cs/base/common/uuid";
import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import {
  FileChangeType,
  LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT,
  type IFileChange,
  type IWatchOptions,
} from "src/cs/platform/files/common/files";

type RawFileChange = {
  readonly resource?: unknown;
  readonly type?: unknown;
};

export class WatcherClient extends Disposable {
  private readonly sessionId = generateUuid();
  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;

  constructor(private readonly channel: IChannel) {
    super();

    this._register(this.channel.listen<unknown>(
      LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT,
      [this.sessionId],
    )((payload) => {
      const changes = this.reviveChanges(payload);
      if (changes.length === 0) {
        return;
      }

      this.onDidFilesChangeEmitter.fire(changes);
    }));
  }

  public watch(resource: URI, options?: IWatchOptions): IDisposable {
    const watchId = generateUuid();
    void this.channel.call("watch", [this.sessionId, watchId, resource, options ?? {}]);

    return toDisposable(() => {
      void this.channel.call("unwatch", [this.sessionId, watchId]);
    });
  }

  private reviveChanges(payload: unknown): readonly IFileChange[] {
    if (!Array.isArray(payload)) {
      return [];
    }

    const changes: IFileChange[] = [];
    for (const item of payload) {
      const change = this.asRawFileChange(item);
      if (!change || !this.isFileChangeType(change.type)) {
        continue;
      }

      const resource = this.reviveResource(change.resource);
      if (!resource) {
        continue;
      }

      changes.push({
        resource,
        type: change.type,
      });
    }

    return changes;
  }

  private asRawFileChange(value: unknown): RawFileChange | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    return value as RawFileChange;
  }

  private reviveResource(value: unknown): URI | undefined {
    if (value instanceof URI) {
      return value;
    }

    if (!value || typeof value !== "object") {
      return undefined;
    }

    const resource = value as { readonly scheme?: unknown; readonly path?: unknown };
    if (typeof resource.scheme !== "string" || typeof resource.path !== "string") {
      return undefined;
    }

    if (!resource.scheme || !resource.path) {
      return undefined;
    }

    return URI.revive({
      path: resource.path,
      scheme: resource.scheme,
    });
  }

  private isFileChangeType(value: unknown): value is FileChangeType {
    return value === FileChangeType.UPDATED
      || value === FileChangeType.ADDED
      || value === FileChangeType.DELETED;
  }
}
