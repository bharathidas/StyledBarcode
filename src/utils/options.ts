import { RenderOptions } from "bwip-js/browser";

import { StyledBarcodePreviewProps } from "../../typings/StyledBarcodeProps";
import { isEanUpc, isMatrix, supportsCheck } from "./symbology";

/** Everything that shapes the rendered image, shared by the widget and the Studio Pro preview. */
export interface StyleSettings {
    scale: number;
    height: number;
    width: number;
    rotate: "N" | "R" | "L" | "I";
    padding: number;
    barColor: string;
    backgroundColor: string | undefined;
    textColor: string | undefined;
    includeText: boolean;
    altText: string;
    textFont: "OCR-B" | "OCR-A";
    textSize: number;
    textAlign: RenderOptions["textxalign"];
    textPosition: RenderOptions["textyalign"];
    textOffset: number;
    textGaps: number;
    showBorder: boolean;
    borderWidth: number;
    borderColor: string | undefined;
    includeCheck: boolean;
    includeCheckInText: boolean;
    guardWhitespace: boolean;
    parse: boolean;
    parseFnc: boolean;
    inkSpread: number;
    extraOptions: string;
}

type StyleProps = Pick<
    StyledBarcodePreviewProps,
    | "scale"
    | "height"
    | "width"
    | "rotate"
    | "padding"
    | "barColor"
    | "backgroundTransparent"
    | "backgroundColor"
    | "textColor"
    | "includeText"
    | "textFont"
    | "textSize"
    | "textAlign"
    | "textPosition"
    | "textOffset"
    | "textGaps"
    | "showBorder"
    | "borderWidth"
    | "borderColor"
    | "includeCheck"
    | "includeCheckInText"
    | "guardWhitespace"
    | "parse"
    | "parseFnc"
>;

const num = (value: number | null | undefined, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const color = (value: string | null | undefined): string | undefined => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed : undefined;
};

/** Maps the widget properties (container or preview) to style settings. */
export function toStyleSettings(
    p: StyleProps,
    dynamic: { altText: string; inkSpread: number; extraOptions: string }
): StyleSettings {
    return {
        scale: Math.min(20, Math.max(1, num(p.scale, 3))),
        height: Math.max(1, num(p.height, 12)),
        width: Math.max(0, num(p.width, 0)),
        rotate: p.rotate ?? "N",
        padding: Math.max(0, num(p.padding, 8)),
        barColor: color(p.barColor) ?? "#000000",
        backgroundColor: p.backgroundTransparent ? undefined : color(p.backgroundColor) ?? "#ffffff",
        textColor: color(p.textColor),
        includeText: p.includeText,
        altText: dynamic.altText,
        textFont: p.textFont === "OCRA" ? "OCR-A" : "OCR-B",
        textSize: Math.max(4, num(p.textSize, 10)),
        textAlign: p.textAlign ?? "center",
        textPosition: p.textPosition ?? "below",
        textOffset: num(p.textOffset, 0),
        textGaps: Math.max(0, num(p.textGaps, 0)),
        showBorder: p.showBorder,
        borderWidth: Math.max(0, num(p.borderWidth, 2)),
        borderColor: color(p.borderColor),
        includeCheck: p.includeCheck,
        includeCheckInText: p.includeCheckInText,
        guardWhitespace: p.guardWhitespace,
        parse: p.parse,
        parseFnc: p.parseFnc,
        inkSpread: num(dynamic.inkSpread, 0),
        extraOptions: dynamic.extraOptions
    };
}

/**
 * Parses BWIPP option syntax ("eclevel=H columns=4 dotty") into an options object.
 * Numbers become numbers, bare words become true, quoted values keep their spaces.
 */
export function parseExtraOptions(text: string): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    const re = /([a-zA-Z][\w-]*)(?:=("[^"]*"|'[^']*'|\S+))?/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const key = match[1];
        let value: string | undefined = match[2];
        if (value === undefined) {
            out[key] = true;
            continue;
        }
        if (/^(".*"|'.*')$/.test(value)) {
            value = value.slice(1, -1);
        }
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            out[key] = Number(value);
        } else if (value === "true" || value === "false") {
            out[key] = value === "true";
        } else {
            out[key] = value;
        }
    }
    return out;
}

/** bwip-js render options for a value. Options that the encoder does not understand are left out. */
export function buildOptions(bcid: string, text: string, s: StyleSettings): RenderOptions {
    const matrix = isMatrix(bcid);
    const options: RenderOptions = {
        bcid,
        text,
        scale: s.scale,
        rotate: s.rotate,
        padding: s.padding,
        barcolor: s.barColor
    };
    if (s.backgroundColor) {
        options.backgroundcolor = s.backgroundColor;
    }
    if (!matrix) {
        options.height = s.height;
        if (s.width > 0) {
            options.width = s.width;
        }
        options.includetext = s.includeText;
        if (s.includeText) {
            options.textfont = s.textFont;
            options.textsize = s.textSize;
            options.textxalign = s.textAlign;
            options.textyalign = s.textPosition;
            if (s.textOffset) {
                // BWIPP moves the text towards the bars for positive values; the property is "away from the bars".
                options.textyoffset = -s.textOffset;
            }
            if (s.textGaps) {
                options.textgaps = s.textGaps;
            }
            if (s.textColor) {
                options.textcolor = s.textColor;
            }
            if (s.altText) {
                options.alttext = s.altText;
            }
        }
        if (isEanUpc(bcid)) {
            options.guardwhitespace = s.guardWhitespace;
        }
        if (supportsCheck(bcid)) {
            options.includecheck = s.includeCheck;
            options.includecheckintext = s.includeCheck && s.includeCheckInText;
        }
    }
    if (s.showBorder) {
        options.showborder = true;
        options.borderwidth = s.borderWidth;
        if (s.borderColor) {
            options.bordercolor = s.borderColor;
        }
    }
    if (s.parse) {
        options.parse = true;
    }
    if (s.parseFnc) {
        options.parsefnc = true;
    }
    if (s.inkSpread) {
        options.inkspread = s.inkSpread;
    }
    // Free-form BWIPP options win over the typed ones, so power users can override anything.
    return { ...options, ...parseExtraOptions(s.extraOptions) } as RenderOptions;
}
