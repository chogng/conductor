import { addDisposableListener, DomEmitter, EventType, type DOMEventMap } from "src/cs/base/browser/dom";
import { combinedDisposable, type IDisposable, toDisposable } from "src/cs/base/common/lifecycle";

export { addDisposableListener, combinedDisposable, DomEmitter, EventType, type DOMEventMap, type IDisposable, toDisposable };

export type DomEventTarget = Window | Document | HTMLElement;
