import { URI } from "src/cs/base/common/uri";

export type CssFragment = string & { readonly __cssFragment: unique symbol };

function asFragment(raw: string): CssFragment {
    return raw as CssFragment;
}

export function asCssValueWithDefault(cssPropertyValue: string | undefined, dflt: string): string {
    if (cssPropertyValue === undefined) {
        return dflt;
    }

    const variableMatch = cssPropertyValue.match(/^\s*var\((.+)\)$/);
    if (!variableMatch) {
        return cssPropertyValue;
    }

    const varArguments = variableMatch[1].split(",", 2);
    if (varArguments.length === 2) {
        dflt = asCssValueWithDefault(varArguments[1].trim(), dflt);
    }

    return `var(${varArguments[0]}, ${dflt})`;
}

export function sizeValue(value: string): CssFragment {
    const out = value.replaceAll(/[^\w.%+-]/gi, "");
    if (out !== value) {
        console.warn(`CSS size ${value} modified to ${out} to be safe for CSS`);
    }

    return asFragment(out);
}

export function hexColorValue(value: string): CssFragment {
    const out = value.replaceAll(/[^0-9a-fA-F#]/g, "");
    if (out !== value) {
        console.warn(`CSS hex color ${value} modified to ${out} to be safe for CSS`);
    }

    return asFragment(out);
}

export function identValue(value: string): CssFragment {
    const out = value.replaceAll(/[^_\-a-z0-9]/gi, "");
    if (out !== value) {
        console.warn(`CSS ident value ${value} modified to ${out} to be safe for CSS`);
    }

    return asFragment(out);
}

export function stringValue(value: string): CssFragment {
    return asFragment(`'${value.replaceAll(/'/g, "\\000027")}'`);
}

export function asCSSUrl(uri: URI | null | undefined): CssFragment {
    if (!uri) {
        return asFragment("url('')");
    }

    return inline`url('${asFragment(CSS.escape(uri.toString()))}')`;
}

export function className(value: string, escapingExpected = false): CssFragment {
    const out = CSS.escape(value);
    if (!escapingExpected && out !== value) {
        console.warn(`CSS class name ${value} modified to ${out} to be safe for CSS`);
    }

    return asFragment(out);
}

/**
 * Template string tag that constructs a CSS fragment.
 *
 * All expressions in the template must be CSS-safe values.
 */
export function inline(strings: TemplateStringsArray, ...values: CssFragment[]): CssFragment {
    return asFragment(strings.reduce((result, str, i) => {
        const value = values[i] ?? "";
        return result + str + value;
    }, ""));
}

export class Builder {
    private readonly parts: CssFragment[] = [];

    public push(...parts: CssFragment[]): void {
        this.parts.push(...parts);
    }

    public join(joiner = "\n"): CssFragment {
        return asFragment(this.parts.join(joiner));
    }
}
