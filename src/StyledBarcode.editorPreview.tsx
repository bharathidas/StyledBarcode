import { ReactElement, useEffect, useRef, useState } from "react";

import { StyledBarcodePreviewProps } from "../typings/StyledBarcodeProps";
import { buildOptions, toStyleSettings } from "./utils/options";
import { errorMessage, renderSvg } from "./utils/render";
import { isKnownBcid, sampleText } from "./utils/samples";
import { toBcid } from "./utils/symbology";

const literal = (expression: string | undefined): string | undefined => {
    const match = /^'(.*)'$/s.exec((expression ?? "").trim());
    return match ? match[1].replace(/''/g, "'") : undefined;
};

/** Uses a literal value such as 'ORDER-1' verbatim; anything dynamic gets the library's sample for the symbology. */
function previewData(props: StyledBarcodePreviewProps, bcid: string): string {
    if (props.displayMode === "list") {
        const value = literal(props.listValue);
        return value || sampleText(bcid);
    }
    if (props.payloadType === "text") {
        const value = literal(props.value);
        if (value) {
            return value;
        }
    } else if (props.payloadType === "digitalLink") {
        return "https://id.gs1.org/01/09521234543213/10/LOT1?17=261231";
    } else {
        return "(01)09521234543213(17)261231(10)LOT1";
    }
    return sampleText(bcid);
}

/** Hooks need a component; Mendix requires the export to be named `preview`. */
function StyledBarcodePreview(props: StyledBarcodePreviewProps): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<{ key: string; width: number; height: number; error?: string }>();

    const bcid = toBcid(props.symbology, literal(props.customSymbology) ?? props.customSymbology);
    const known = isKnownBcid(bcid);
    const settings = toStyleSettings(props, {
        altText: literal(props.altText) ?? "",
        inkSpread: props.inkSpread ?? 0,
        extraOptions: literal(props.extraOptions) ?? ""
    });
    const data = previewData(props, bcid);
    const options = buildOptions(known ? bcid : "code128", known ? data : sampleText("code128"), settings);
    const optionsKey = JSON.stringify(options);
    const structure = props.renderMode === "structure";
    const fit = props.sizeMode === "fit";

    useEffect(() => {
        const container = containerRef.current;
        if (!container || structure) {
            return;
        }
        try {
            const rendered = renderSvg(options);
            container.innerHTML = rendered.svg;
            setTimeout(() => setSize({ key: optionsKey, width: rendered.width, height: rendered.height }), 0);
        } catch (error) {
            container.innerHTML = "";
            const message = errorMessage(error);
            setTimeout(() => setSize({ key: optionsKey, width: 0, height: 0, error: message }), 0);
        }
        // optionsKey captures every value in options.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionsKey, structure]);

    const current = size?.key === optionsKey ? size : undefined;
    const invalid = current?.error;

    const buttons: string[] = [];
    const download = props.labelDownload ? `${props.labelDownload} ` : "";
    if (props.showDownloadPng) {
        buttons.push(`${download}PNG`);
    }
    if (props.showDownloadSvg) {
        buttons.push(`${download}SVG`);
    }
    if (props.showDownloadJpeg) {
        buttons.push(`${download}JPEG`);
    }
    if (props.showDownloadWebp) {
        buttons.push(`${download}WEBP`);
    }
    if (props.showCopy) {
        buttons.push(props.labelCopy);
    }
    if (props.showPrint) {
        buttons.push(props.labelPrint);
    }
    if (props.displayMode === "single" && props.showSave && props.base64Attribute) {
        buttons.push(props.labelSave);
    }
    const listButtons: string[] = [];
    if (props.displayMode === "list") {
        if (props.showDownloadZip) {
            listButtons.push(props.labelZip);
        }
        if (props.showPrintSheet) {
            listButtons.push(props.labelPrintSheet);
        }
        if (props.showDownloadPdf) {
            listButtons.push(props.labelPdf);
        }
    }
    const buttonRow = (labels: string[], cls: string): ReactElement | null =>
        labels.length > 0 ? (
            <div className={cls}>
                {labels.map(label => (
                    <button key={label} type="button" className={`btn btn-${props.buttonStyle} mxt-bc__button`}>
                        {label}
                    </button>
                ))}
            </div>
        ) : null;
    const toolbar = buttonRow(buttons, `mxt-bc__toolbar mxt-bc__toolbar--${props.toolbarPosition}`);

    const empty = structure || Boolean(invalid);
    const codeStyle = fit
        ? { width: "100%" }
        : current && !invalid
        ? { width: current.width, height: current.height }
        : {};
    const single = (
        <div className={`mxt-bc ${fit ? "mxt-bc--fit " : ""}${props.className ?? ""}`} style={props.styleObject}>
            {props.toolbarPosition === "top" && toolbar}
            <div className="mxt-bc__stage">
                <div
                    className={`mxt-bc__code${empty ? " mxt-bc__code--empty" : ""}${fit ? " mxt-bc__code--fit" : ""}`}
                    style={codeStyle}
                >
                    <div ref={containerRef} className="mxt-bc__svg" />
                    {structure && <span className="mxt-bc__structure">|||| ||</span>}
                    {!structure && invalid && <span className="mxt-bc__notice mxt-bc__notice--error">{invalid}</span>}
                </div>
            </div>
            {props.displayMode === "single" && props.caption && <div className="mxt-bc__caption">{props.caption}</div>}
            {props.displayMode === "list" && props.listLabel && (
                <div className="mxt-bc__caption">{literal(props.listLabel) ?? props.listLabel}</div>
            )}
            {props.toolbarPosition !== "top" && toolbar}
        </div>
    );

    if (props.displayMode === "list") {
        return (
            <div
                className={`mxt-bc-list ${props.className ?? ""}`}
                style={{ ...props.styleObject, gap: props.listGap ?? 16 }}
            >
                {buttonRow(listButtons, "mxt-bc-list__toolbar")}
                {single}
                <div className="mxt-bc mxt-bc--preview-ghost">
                    <div className="mxt-bc__code mxt-bc__code--empty" style={codeStyle} />
                </div>
            </div>
        );
    }
    return single;
}

export function preview(props: StyledBarcodePreviewProps): ReactElement {
    return <StyledBarcodePreview {...props} />;
}

export function getPreviewCss(): string {
    return require("./ui/StyledBarcode.css");
}
