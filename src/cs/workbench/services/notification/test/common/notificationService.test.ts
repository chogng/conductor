import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { NotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type {
  NotificationStatusMessageEvent,
  NotificationToastEvent,
} from "src/cs/workbench/common/notifications";

let store: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>;

suite("workbench/services/notification/common/NotificationService", () => {
  store = ensureNoDisposablesAreLeakedInTestSuite();

  test("publishes status messages without creating toast notifications", () => {
    const service = store.add(new NotificationService());
    const statusEvents: NotificationStatusMessageEvent[] = [];
    const toastEvents: NotificationToastEvent[] = [];
    store.add(service.onDidChangeStatusMessage(event => statusEvents.push(event)));
    store.add(service.onDidChangeToast(event => toastEvents.push(event)));

    const handle = service.status("Loading data");

    assert.equal(service.statusMessage?.message, "Loading data");
    assert.deepEqual(statusEvents.map(event => `${event.kind}:${event.item.message}`), [
      "add:Loading data",
    ]);
    assert.deepEqual(toastEvents, []);

    handle.close();

    assert.equal(service.statusMessage, undefined);
    assert.deepEqual(statusEvents.map(event => `${event.kind}:${event.item.message}`), [
      "add:Loading data",
      "remove:Loading data",
    ]);
  });

  test("closing an older status handle keeps the current status message", () => {
    const service = store.add(new NotificationService());
    const first = service.status("First");
    const second = service.status("Second");

    first.close();

    assert.equal(service.statusMessage?.message, "Second");

    second.close();

    assert.equal(service.statusMessage, undefined);
  });
});
