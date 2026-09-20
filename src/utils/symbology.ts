import { SymbologyEnum } from "../../typings/StyledBarcodeProps";

/** Enumeration keys may only contain letters, digits and underscores; a few BWIPP names do not. */
const BCID: Partial<Record<SymbologyEnum, string>> = {
    gs1_128: "gs1-128",
    codabar: "rationalizedCodabar"
};

/** BWIPP encoder name for a symbology property value. */
export function toBcid(symbology: SymbologyEnum, custom?: string): string {
    if (symbology === "custom") {
        return (custom ?? "").trim();
    }
    return BCID[symbology] ?? symbology;
}

/** Encoders that parse GS1 application identifiers in bracket notation. */
export function isGs1(bcid: string): boolean {
    return (
        bcid.startsWith("gs1") ||
        bcid.startsWith("databar") ||
        bcid === "ean14" ||
        bcid === "sscc18" ||
        bcid === "gs1northamericancoupon"
    );
}

/** Encoders whose result has no human readable text line (matrix, stacked and postal codes). */
export function isMatrix(bcid: string): boolean {
    return /^(qrcode|microqrcode|rectangularmicroqrcode|gs1qrcode|gs1dlqrcode|swissqrcode|datamatrix|datamatrixrectangular|datamatrixrectangularextension|gs1datamatrix|gs1datamatrixrectangular|gs1dldatamatrix|pdf417|pdf417compact|micropdf417|azteccode|azteccodecompact|aztecrune|maxicode|dotcode|gs1dotcode|hanxin|codeone|ultracode|codablockf|code16k|code49|onecode|hibcdatamatrix|hibcdatamatrixrectangular|hibcpdf417|hibcmicropdf417|hibcqrcode|hibccodablockf|hibcazteccode|d3aqr)$/.test(
        bcid
    );
}

/** Encoders that support the optional check character options. */
export function supportsCheck(bcid: string): boolean {
    return /^(code39|code39ext|code93|code93ext|interleaved2of5|code2of5|industrial2of5|iata2of5|matrix2of5|coop2of5|datalogic2of5|code11|msi|plessey|rationalizedCodabar|postnet|planet|japanpost|bc412)$/.test(
        bcid
    );
}

/** EAN and UPC family, the only encoders that draw quiet zone indicators. */
export function isEanUpc(bcid: string): boolean {
    return /^(ean13|ean8|ean5|ean2|upca|upce|isbn|ismn|issn|ean13composite|ean8composite|upcacomposite|upcecomposite)$/.test(
        bcid
    );
}
