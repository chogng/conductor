/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { clearNode } from "src/cs/base/browser/dom";

const MAX_MESSAGE_LENGTH = 20_000;

let ariaContainer: HTMLElement | undefined;
let alertContainer: HTMLElement | undefined;
let alternateAlertContainer: HTMLElement | undefined;
let statusContainer: HTMLElement | undefined;
let alternateStatusContainer: HTMLElement | undefined;

export function setARIAContainer(parent: HTMLElement): void {
  ariaContainer?.remove();

  ariaContainer = document.createElement("div");
  ariaContainer.className = "ui-aria-container";
  ariaContainer.style.position = "absolute";
  ariaContainer.style.width = "1px";
  ariaContainer.style.height = "1px";
  ariaContainer.style.overflow = "hidden";
  ariaContainer.style.clip = "rect(1px, 1px, 1px, 1px)";

  alertContainer = createLiveRegion("alert", "assertive");
  alternateAlertContainer = createLiveRegion("alert", "assertive");
  statusContainer = createLiveRegion("status", "polite");
  alternateStatusContainer = createLiveRegion("status", "polite");

  parent.appendChild(ariaContainer);
}

export function alert(message: string): void {
  const pair = getLiveRegionPair("alert");
  if (!pair) {
    return;
  }

  insertIntoAlternatingRegion(pair.primary, pair.alternate, message);
}

export function status(message: string): void {
  const pair = getLiveRegionPair("status");
  if (!pair) {
    return;
  }

  insertIntoAlternatingRegion(pair.primary, pair.alternate, message);
}

function createLiveRegion(role: "alert" | "status", live: "assertive" | "polite"): HTMLElement {
  if (!ariaContainer) {
    throw new Error("ARIA container must be created before live regions.");
  }

  const element = document.createElement("div");
  element.className = `ui-${role}`;
  element.setAttribute("role", role);
  element.setAttribute("aria-live", live);
  element.setAttribute("aria-atomic", "true");
  ariaContainer.appendChild(element);
  return element;
}

function getLiveRegionPair(type: "alert" | "status"): {
  readonly alternate: HTMLElement;
  readonly primary: HTMLElement;
} | undefined {
  if (!ariaContainer && typeof document !== "undefined" && document.body) {
    setARIAContainer(document.body);
  }

  if (type === "alert" && alertContainer && alternateAlertContainer) {
    return {
      alternate: alternateAlertContainer,
      primary: alertContainer,
    };
  }

  if (type === "status" && statusContainer && alternateStatusContainer) {
    return {
      alternate: alternateStatusContainer,
      primary: statusContainer,
    };
  }

  return undefined;
}

function insertIntoAlternatingRegion(primary: HTMLElement, alternate: HTMLElement, message: string): void {
  if (primary.textContent !== message) {
    clearNode(alternate);
    insertMessage(primary, message);
  } else {
    clearNode(primary);
    insertMessage(alternate, message);
  }
}

function insertMessage(target: HTMLElement, message: string): void {
  clearNode(target);
  target.textContent = message.length > MAX_MESSAGE_LENGTH
    ? message.slice(0, MAX_MESSAGE_LENGTH)
    : message;
  target.style.visibility = "hidden";
  target.style.visibility = "visible";
}

export type AriaRole =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "button"
  | "cell"
  | "checkbox"
  | "columnheader"
  | "combobox"
  | "complementary"
  | "contentinfo"
  | "definition"
  | "dialog"
  | "directory"
  | "document"
  | "feed"
  | "figure"
  | "form"
  | "grid"
  | "gridcell"
  | "group"
  | "heading"
  | "img"
  | "link"
  | "list"
  | "listbox"
  | "listitem"
  | "log"
  | "main"
  | "marquee"
  | "math"
  | "menu"
  | "menubar"
  | "menuitem"
  | "menuitemcheckbox"
  | "menuitemradio"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "region"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "search"
  | "searchbox"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "textbox"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem"
  | (string & {});
