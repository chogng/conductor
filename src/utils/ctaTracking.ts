import { normalizeCtaName, normalizeCtaToken } from "./cta";

type CtaEventPayload = {
  ts: number;
  cta: string;
  position?: string;
  copy?: string;
  tag: string;
  id?: string;
  path: string;
  href?: string;
};

declare global {
  interface Window {
    __CONDUCTOR_CTA_TRACKING_INIT__?: boolean;
    __CONDUCTOR_CTA_EVENTS__?: CtaEventPayload[];
  }
}

const resolveEventTargetElement = (event: Event): Element | null => {
  const target = event.target;
  if (target instanceof Element) return target;
  return null;
};

export const initCtaTracking = () => {
  if (window.__CONDUCTOR_CTA_TRACKING_INIT__) return;
  window.__CONDUCTOR_CTA_TRACKING_INIT__ = true;

  const events: CtaEventPayload[] = [];
  window.__CONDUCTOR_CTA_EVENTS__ = events;

  const handler = (event: Event) => {
    const target = resolveEventTargetElement(event);
    if (!target) return;

    const el = target.closest?.("[data-cta]");
    if (!el) return;

    const cta = normalizeCtaName(el.getAttribute("data-cta"));
    if (!cta) return;

    const payload: CtaEventPayload = {
      ts: Date.now(),
      cta,
      position: normalizeCtaToken(el.getAttribute("data-cta-position")),
      copy: normalizeCtaToken(el.getAttribute("data-cta-copy")),
      tag: String(el.tagName || "").toLowerCase(),
      id: normalizeCtaName(el.getAttribute("id")),
      path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      href: normalizeCtaName(el.getAttribute("href")),
    };

    events.push(payload);
    if (events.length > 200) events.splice(0, events.length - 200);

    window.dispatchEvent(new CustomEvent("conductor:cta", { detail: payload }));

    if (import.meta.env.DEV) {
      console.debug("[CTA]", payload);
    }
  };

  window.addEventListener("click", handler, true);
};
