import { hidePropertiesIn, Problem, Properties } from "@mendix/pluggable-widgets-tools";
import { StyledBarcodePreviewProps } from "../typings/StyledBarcodeProps";
import { isEanUpc, isGs1, isMatrix, supportsCheck, toBcid } from "./utils/symbology";

type Keys = Array<keyof StyledBarcodePreviewProps>;

const GS1_KEYS: Keys = [
    "gs1Gtin",
    "gs1CheckDigit",
    "gs1Sscc",
    "gs1Content",
    "gs1Count",
    "gs1Lot",
    "gs1Serial",
    "gs1ProductionDate",
    "gs1BestBefore",
    "gs1Expiry",
    "gs1Weight",
    "gs1Price",
    "gs1Extra",
    "gs1Domain"
];

const LIST_KEYS: Keys = [
    "dataSource",
    "listValue",
    "listSymbology",
    "listExtraOptions",
    "listLabel",
    "listFileName",
    "listGap",
    "listEmptyText",
    "listLazyRender",
    "showDownloadZip",
    "showPrintSheet",
    "showDownloadPdf",
    "labelZip",
    "labelPrintSheet",
    "labelPdf",
    "sheetColumns",
    "sheetLabelWidth",
    "sheetLabelHeight",
    "sheetGap",
    "sheetShowLabel",
    "sheetTitle"
];

const SINGLE_ONLY_KEYS: Keys = [
    "payloadType",
    "value",
    "caption",
    "altText",
    "base64Attribute",
    "base64Format",
    "base64DataUri",
    "saveDebounce",
    "onImageSaved",
    "showSave",
    "labelSave",
    "labelSaved",
    "validAttribute",
    "encodedAttribute",
    "onRender"
];

const TEXT_KEYS: Keys = [
    "altText",
    "textFont",
    "textSize",
    "textAlign",
    "textPosition",
    "textOffset",
    "textGaps",
    "textColor"
];

export function getProperties(values: StyledBarcodePreviewProps, defaultProperties: Properties): Properties {
    const hide = (keys: Keys): void => hidePropertiesIn(defaultProperties, values, keys);
    const bcid = toBcid(values.symbology, values.customSymbology);
    const custom = values.symbology === "custom";

    if (!custom) {
        hide(["customSymbology"]);
    }

    if (values.displayMode === "list") {
        hide(SINGLE_ONLY_KEYS);
        hide(GS1_KEYS);
        if (!(values.showPrintSheet || values.showDownloadPdf)) {
            hide(["sheetColumns", "sheetLabelWidth", "sheetLabelHeight", "sheetGap", "sheetShowLabel", "sheetTitle"]);
        }
        if (!values.showDownloadZip) {
            hide(["labelZip"]);
        }
        if (!values.showPrintSheet) {
            hide(["labelPrintSheet"]);
        }
        if (!values.showDownloadPdf) {
            hide(["labelPdf"]);
        }
    } else {
        hide(LIST_KEYS);
        if (values.payloadType === "text") {
            hide(GS1_KEYS);
        } else {
            hide(["value"]);
            if (values.payloadType !== "digitalLink") {
                hide(["gs1Domain"]);
            }
        }
        if (!values.base64Attribute) {
            hide([
                "base64Format",
                "base64DataUri",
                "saveDebounce",
                "onImageSaved",
                "showSave",
                "labelSave",
                "labelSaved"
            ]);
        } else if (!values.showSave) {
            hide(["labelSave", "labelSaved"]);
        }
    }

    // Matrix codes have no bar height, width, text line or check character options.
    if (!custom && isMatrix(bcid)) {
        hide(["height", "width", "includeText", "includeCheck", "includeCheckInText", "guardWhitespace"]);
        hide(TEXT_KEYS);
    } else {
        if (!values.includeText) {
            hide(TEXT_KEYS);
        }
        if (!custom && !supportsCheck(bcid)) {
            hide(["includeCheck", "includeCheckInText"]);
        } else if (!values.includeCheck) {
            hide(["includeCheckInText"]);
        }
        if (!custom && !isEanUpc(bcid)) {
            hide(["guardWhitespace"]);
        }
    }
    if (values.backgroundTransparent) {
        hide(["backgroundColor"]);
    }
    if (!values.showBorder) {
        hide(["borderWidth", "borderColor"]);
    }

    const downloads =
        values.showDownloadPng || values.showDownloadSvg || values.showDownloadJpeg || values.showDownloadWebp;
    if (!downloads) {
        hide(["labelDownload"]);
    }
    if (!downloads && values.displayMode !== "list") {
        hide(["fileName"]);
    }
    if (!values.showCopy) {
        hide(["labelCopy", "labelCopied"]);
    }
    if (!values.showPrint) {
        hide(["labelPrint"]);
    }
    const anyButton =
        downloads ||
        values.showCopy ||
        values.showPrint ||
        values.showSave ||
        (values.displayMode === "list" && (values.showDownloadZip || values.showPrintSheet || values.showDownloadPdf));
    if (!anyButton) {
        hide(["buttonStyle", "toolbarPosition"]);
    }

    return defaultProperties;
}

export function check(values: StyledBarcodePreviewProps): Problem[] {
    const problems: Problem[] = [];
    const error = (property: keyof StyledBarcodePreviewProps, message: string): void => {
        problems.push({ property, severity: "error", message });
    };
    const warning = (property: keyof StyledBarcodePreviewProps, message: string): void => {
        problems.push({ property, severity: "warning", message });
    };
    const bcid = toBcid(values.symbology, values.customSymbology);
    const custom = values.symbology === "custom";

    if (custom && !values.customSymbology) {
        error("customSymbology", "Enter the BWIPP encoder name, e.g. 'databarexpandedcomposite'.");
    }

    if (values.displayMode === "list") {
        if (!values.dataSource) {
            error("dataSource", "Select a data source, or set 'Render as' to 'Single barcode'.");
        } else if (!values.listValue) {
            error("listValue", "Set the value to encode for each object.");
        }
        if (
            (values.showPrintSheet || values.showDownloadPdf) &&
            ((values.sheetLabelWidth ?? 0) < 10 || (values.sheetLabelHeight ?? 0) < 10)
        ) {
            error("sheetLabelWidth", "Labels on the sheet must be at least 10 by 10 mm.");
        }
        if ((values.sheetColumns ?? 0) < 1) {
            error("sheetColumns", "The sheet needs at least one column.");
        }
    } else if (values.payloadType === "text") {
        if (!values.value) {
            warning("value", "No value is set, so the barcode stays empty.");
        }
    } else {
        if (!values.gs1Gtin && !values.gs1Sscc && !values.gs1Content && !values.gs1Extra) {
            error("gs1Gtin", "A GS1 payload needs at least a GTIN, an SSCC or extra element strings.");
        }
        if (values.gs1Content && !values.gs1Count) {
            warning("gs1Count", "AI (02) must be accompanied by the count (37).");
        }
        if (values.payloadType === "gs1" && !custom && !isGs1(bcid) && bcid !== "code128") {
            warning(
                "symbology",
                "The GS1 element string is meant for GS1 symbologies (GS1-128, GS1 DataBar, GS1 Data Matrix, GS1 QR). Other encoders encode the brackets literally."
            );
        }
        if (values.payloadType === "digitalLink" && !custom && !/^gs1dl|qrcode|datamatrix/.test(bcid)) {
            warning(
                "symbology",
                "A GS1 Digital Link is a URL; use 'GS1 Digital Link QR Code', 'GS1 Digital Link Data Matrix', QR Code or Data Matrix."
            );
        }
    }

    if ((values.scale ?? 0) < 1 || (values.scale ?? 0) > 20) {
        error("scale", "The scale must be between 1 and 20.");
    }
    if ((values.height ?? 0) < 1) {
        error("height", "The bar height must be at least 1 mm.");
    }
    if ((values.width ?? 0) < 0) {
        error("width", "The minimum width cannot be negative. Use 0 for the natural width.");
    }
    if ((values.padding ?? 0) < 0) {
        error("padding", "The padding cannot be negative.");
    }
    if ((values.textSize ?? 0) < 4) {
        error("textSize", "The font size must be at least 4 points.");
    }
    if ((values.maxPayloadLength ?? 0) < 1) {
        error("maxPayloadLength", "The maximum length must be at least 1.");
    }
    if ((values.saveDebounce ?? 0) < 0) {
        error("saveDebounce", "The save delay cannot be negative.");
    }
    const colour = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    for (const key of ["barColor", "backgroundColor", "textColor", "borderColor"] as const) {
        const value = (values[key] ?? "").trim();
        if (value && !colour.test(value)) {
            error(key, "Colours must be hex values such as #1a73e8.");
        }
    }
    if (values.barColor && values.backgroundColor && !values.backgroundTransparent) {
        const bar = values.barColor.trim().toLowerCase();
        const back = values.backgroundColor.trim().toLowerCase();
        if (bar === back) {
            error("barColor", "The bar colour equals the background colour, so the barcode is invisible.");
        }
    }
    if (values.backgroundTransparent && (values.showDownloadJpeg || values.base64Format === "jpeg")) {
        warning("backgroundTransparent", "JPEG has no transparency; transparent areas are exported on white.");
    }
    if (values.includeCheckInText && !values.includeCheck) {
        warning("includeCheckInText", "The check digit is only shown in the text when 'Add check digit' is on.");
    }
    if (values.rotate !== "N" && values.sizeMode === "fit") {
        warning("sizeMode", "Rotated barcodes in 'Fit container' mode become very tall on wide pages.");
    }

    return problems;
}
