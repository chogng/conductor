export type CogIconRenderer = () => string;

const ROOT_SVG_TAG_PATTERN = /<svg\b([^>]*)>/i;
const ROOT_WIDTH_PATTERN = /\swidth="[^"]*"/i;
const ROOT_HEIGHT_PATTERN = /\sheight="[^"]*"/i;
const HEX_BLACK_PATTERN = /#000000\b|#000\b/gi;
const BLACK_KEYWORD_PATTERN = /\bblack\b/gi;

export const normalizeCogIconSvgMarkup = (icon: CogIconRenderer): string => {
  const rawMarkup = icon().trim();
  const currentColorMarkup = rawMarkup
    .replace(HEX_BLACK_PATTERN, "currentColor")
    .replace(BLACK_KEYWORD_PATTERN, "currentColor");

  return currentColorMarkup.replace(
    ROOT_SVG_TAG_PATTERN,
    (_match, attributes: string) => {
      const normalizedAttributes = attributes
        .replace(ROOT_WIDTH_PATTERN, ' width="100%"')
        .replace(ROOT_HEIGHT_PATTERN, ' height="100%"');

      return `<svg${normalizedAttributes} focusable="false" aria-hidden="true">`;
    },
  );
};
