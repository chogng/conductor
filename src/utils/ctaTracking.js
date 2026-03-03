import { normalizeCtaName, normalizeCtaToken } from "./cta";

const resolveEventTargetElement = (event) => {
  const t = event?.target;
  if (t && t.nodeType === 1) return t;
  return null;
};

export const initCtaTracking = () => {
  if (window.__APPOINTER_CTA_TRACKING_INIT__) return;
  window.__APPOINTER_CTA_TRACKING_INIT__ = true;

  const events = [];
  window.__APPOINTER_CTA_EVENTS__ = events;

  const handler = (event) => {
    const target = resolveEventTargetElement(event);
    if (!target) return;

    const el = target.closest?.("[data-cta]");
    if (!el) return;

    const cta = normalizeCtaName(el.getAttribute("data-cta"));
    if (!cta) return;

    const payload = {
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

    window.dispatchEvent(new CustomEvent("appointer:cta", { detail: payload }));

    if (import.meta.env.DEV) {
      console.debug("[CTA]", payload);
    }
  };

  window.addEventListener("click", handler, true);
};
