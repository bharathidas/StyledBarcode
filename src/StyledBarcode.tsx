import { ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { ActionValue, DynamicValue, EditableValue } from "mendix";
import { Big } from "big.js";

import { StyledBarcodeContainerProps } from "../typings/StyledBarcodeProps";
import { BarcodeView, RenderResult, ToolbarButton, ToolbarSpec } from "./components/BarcodeView";
import { buildDigitalLink, buildElementString, Gs1Fields } from "./utils/gs1";
import { buildOptions, StyleSettings, toStyleSettings } from "./utils/options";
import { downloadBlob, exportImage } from "./utils/render";
import { buildPdf, printSheet, safeFileName, SheetItem, SheetOptions, zipFiles } from "./utils/sheet";
import { isKnownBcid } from "./utils/samples";
import { toBcid } from "./utils/symbology";
import { useLatest } from "./utils/useLatest";

import "./ui/StyledBarcode.css";

const text = (value: DynamicValue<string> | undefined): string => value?.value ?? "";
const decimal = (value: DynamicValue<Big> | undefined): string => (value?.value ? value.value.toString() : "");
const date = (value: DynamicValue<Date> | undefined): Date | undefined =>
    value?.value instanceof Date ? value.value : undefined;

function execute(action: ActionValue | undefined): void {
    if (action?.canExecute && !action.isExecuting) {
        action.execute();
    }
}

/** Writes to an attribute only when it is writable and the value actually changes, so nothing loops. */
function write<T extends string | boolean>(attribute: EditableValue<T> | undefined, value: T): boolean {
    if (!attribute || attribute.readOnly || attribute.value === value) {
        return false;
    }
    attribute.setValue(value);
    return true;
}

interface ListRow {
    id: string;
    bcid: string;
    data: string;
    label: string;
    fileName: string;
    /** Per-object BWIPP options; empty falls back to the widget-wide ones. */
    extraOptions: string;
}

export function StyledBarcode(props: StyledBarcodeContainerProps): ReactElement {
    const {
        displayMode,
        symbology,
        payloadType,
        dataSource,
        listValue,
        listSymbology,
        listExtraOptions,
        listLabel,
        listFileName,
        listGap,
        listEmptyText,
        listLazyRender,
        validAttribute,
        encodedAttribute,
        base64Attribute,
        base64Format,
        base64DataUri,
        saveDebounce,
        onImageSaved,
        onClick,
        onRender,
        ariaLabel,
        maxPayloadLength,
        payloadTooLongText,
        invalidText,
        sizeMode,
        class: className,
        style,
        tabIndex
    } = props;

    const settings: StyleSettings = toStyleSettings(props, {
        altText: text(props.altText),
        inkSpread: props.inkSpread ? Number(props.inkSpread.toString()) : 0,
        extraOptions: text(props.extraOptions)
    });
    const settingsKey = JSON.stringify(settings);
    const bcid = toBcid(symbology, text(props.customSymbology));

    const toolbarBase: ToolbarSpec = {
        png: props.showDownloadPng,
        svg: props.showDownloadSvg,
        jpeg: props.showDownloadJpeg,
        webp: props.showDownloadWebp,
        copy: props.showCopy,
        print: props.showPrint,
        save: props.showSave && displayMode === "single" && Boolean(base64Attribute),
        fileName: text(props.fileName),
        buttonClass: `btn-${props.buttonStyle}`,
        position: props.toolbarPosition,
        labelDownload: text(props.labelDownload),
        labelCopy: text(props.labelCopy),
        labelCopied: text(props.labelCopied),
        labelPrint: text(props.labelPrint),
        labelSave: text(props.labelSave),
        labelSaved: text(props.labelSaved)
    };

    // Latest Mendix values for the async callbacks, without restarting effects on every render.
    const base64AttributeRef = useLatest(base64Attribute);
    const onImageSavedRef = useLatest(onImageSaved);
    const validAttributeRef = useLatest(validAttribute);
    const encodedAttributeRef = useLatest(encodedAttribute);
    const onClickRef = useLatest(onClick);
    const onRenderRef = useLatest(onRender);

    const saveBase64 = useCallback(
        (value: string): void => {
            if (write(base64AttributeRef.current, value)) {
                execute(onImageSavedRef.current);
            }
        },
        [base64AttributeRef, onImageSavedRef]
    );
    const handleClick = useCallback((): void => execute(onClickRef.current), [onClickRef]);
    const handleRender = useCallback(
        (result: RenderResult): void => {
            write(validAttributeRef.current, result.valid);
            const action = onRenderRef.current;
            if (action?.canExecute && !action.isExecuting) {
                action.execute({ encodedValue: result.value, isValid: result.valid, errorMessage: result.error });
            }
        },
        [validAttributeRef, onRenderRef]
    );

    const commonView = {
        invalidText: text(invalidText),
        ariaLabel: text(ariaLabel),
        sizeMode,
        onClick: onClick ? handleClick : undefined,
        onRender: onRender || validAttribute ? handleRender : undefined
    };
    const limit = Math.max(1, maxPayloadLength || 4000);
    const tooLong = text(payloadTooLongText) || "The content is too long for a barcode.";
    const unknown = (name: string): string => `Unknown symbology '${name}'.`;
    const guard = (data: string, rowBcid: string): { data: string; notice?: string } => {
        if (!rowBcid || !isKnownBcid(rowBcid)) {
            return { data: "", notice: unknown(rowBcid) };
        }
        return data.length > limit ? { data: "", notice: tooLong } : { data };
    };

    // ---------------------------------------------------------------- single mode
    let data = text(props.value).trim();
    if (payloadType !== "text") {
        const fields: Gs1Fields = {
            gtin: text(props.gs1Gtin),
            checkDigit: props.gs1CheckDigit,
            sscc: text(props.gs1Sscc),
            content: text(props.gs1Content),
            count: decimal(props.gs1Count),
            lot: text(props.gs1Lot),
            serial: text(props.gs1Serial),
            productionDate: date(props.gs1ProductionDate),
            bestBefore: date(props.gs1BestBefore),
            expiry: date(props.gs1Expiry),
            weight: decimal(props.gs1Weight),
            price: decimal(props.gs1Price),
            extra: text(props.gs1Extra),
            domain: text(props.gs1Domain)
        };
        data = payloadType === "gs1" ? buildElementString(fields) : buildDigitalLink(fields);
    }
    const guarded = guard(data, bcid);
    const encoded = guarded.data;
    // write() skips identical values, so the round trip through Mendix cannot loop.
    useEffect(() => {
        write(encodedAttributeRef.current, encoded);
    }, [encoded, encodedAttributeRef]);

    const options = useMemo(
        () => buildOptions(bcid || "code128", encoded, settings),
        // settingsKey captures the content of settings, which is rebuilt on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bcid, encoded, settingsKey]
    );

    // ---------------------------------------------------------------- list mode
    const items = useMemo(() => (displayMode === "list" ? dataSource?.items ?? [] : []), [displayMode, dataSource]);
    const listRows: ListRow[] = items.map(item => ({
        id: item.id,
        bcid: listSymbology?.get(item).value?.trim() || bcid,
        data: (listValue?.get(item).value ?? "").trim(),
        label: listLabel?.get(item).value ?? "",
        fileName: listFileName?.get(item).value?.trim() || "",
        extraOptions: listExtraOptions?.get(item).value?.trim() || ""
    }));
    const rowSettings = (row: ListRow): StyleSettings =>
        row.extraOptions ? { ...settings, extraOptions: row.extraOptions } : settings;
    const [listBusy, setListBusy] = useState(false);

    const sheetOptions = (): SheetOptions => ({
        columns: Math.max(1, props.sheetColumns),
        labelWidthMm: props.sheetLabelWidth,
        labelHeightMm: props.sheetLabelHeight,
        gapMm: props.sheetGap,
        showLabel: props.sheetShowLabel,
        title: text(props.sheetTitle)
    });
    const baseName = (): string =>
        safeFileName(text(props.sheetTitle) || text(props.fileName) || "barcodes") || "barcodes";
    const rowName = (row: ListRow, index: number): string =>
        row.fileName || `${text(props.fileName) || "barcode"}-${index + 1}`;

    const renderRows = async (
        extension: "png" | "jpeg"
    ): Promise<Array<{ row: ListRow; index: number; blob: Blob; width: number; height: number }>> => {
        const out: Array<{ row: ListRow; index: number; blob: Blob; width: number; height: number }> = [];
        let index = 0;
        for (const row of listRows) {
            const guarded = guard(row.data, row.bcid);
            const rowIndex = index++;
            if (!guarded.data) {
                continue;
            }
            try {
                const options = buildOptions(row.bcid, guarded.data, rowSettings(row));
                const blob = await exportImage(options, extension);
                if (!blob) {
                    continue;
                }
                const bitmap = await createImageBitmap(blob);
                out.push({ row, index: rowIndex, blob, width: bitmap.width, height: bitmap.height });
                bitmap.close();
            } catch {
                // Invalid rows are skipped in bulk exports; they show their message on screen.
            }
        }
        return out;
    };
    const runList = async (task: () => Promise<void>): Promise<void> => {
        if (listBusy) {
            return;
        }
        setListBusy(true);
        try {
            await task();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Styled Barcode:", error);
        } finally {
            setListBusy(false);
        }
    };

    const listButtons: ToolbarButton[] = [];
    if (props.showDownloadZip) {
        listButtons.push({
            key: "zip",
            label: text(props.labelZip),
            onClick: () =>
                runList(async () => {
                    const rendered = await renderRows("png");
                    const files = await Promise.all(
                        rendered.map(async r => ({
                            name: rowName(r.row, r.index),
                            data: new Uint8Array(await r.blob.arrayBuffer())
                        }))
                    );
                    if (files.length) {
                        downloadBlob(zipFiles(files), `${baseName()}.zip`);
                    }
                })
        });
    }
    if (props.showPrintSheet) {
        listButtons.push({
            key: "printSheet",
            label: text(props.labelPrintSheet),
            onClick: () =>
                runList(async () => {
                    const rendered = await renderRows("png");
                    if (rendered.length) {
                        printSheet(
                            rendered.map(r => ({ url: URL.createObjectURL(r.blob), label: r.row.label })),
                            sheetOptions()
                        );
                    }
                })
        });
    }
    if (props.showDownloadPdf) {
        listButtons.push({
            key: "pdf",
            label: text(props.labelPdf),
            onClick: () =>
                runList(async () => {
                    const rendered = await renderRows("jpeg");
                    const sheetItems: SheetItem[] = await Promise.all(
                        rendered.map(async r => ({
                            name: rowName(r.row, r.index),
                            label: r.row.label,
                            jpeg: new Uint8Array(await r.blob.arrayBuffer()),
                            width: r.width,
                            height: r.height
                        }))
                    );
                    if (sheetItems.length) {
                        downloadBlob(buildPdf(sheetItems, sheetOptions()), `${baseName()}.pdf`);
                    }
                })
        });
    }

    if (displayMode === "list") {
        const loading = dataSource?.status === "loading" && items.length === 0;
        return (
            <div
                className={classNames("mxt-bc-list", className, {
                    "mxt-bc-list--loading": loading,
                    "mxt-bc-list--busy": listBusy
                })}
                style={{ ...style, gap: Math.max(0, listGap) }}
                tabIndex={tabIndex}
            >
                {listButtons.length > 0 && items.length > 0 && (
                    <div className="mxt-bc-list__toolbar">
                        {listButtons.map(b => (
                            <button
                                key={b.key}
                                type="button"
                                className={classNames("btn", toolbarBase.buttonClass, "mxt-bc__button")}
                                disabled={listBusy}
                                onClick={() => {
                                    b.onClick();
                                }}
                            >
                                {b.label}
                            </button>
                        ))}
                    </div>
                )}
                {listRows.map((row, index) => {
                    const guarded = guard(row.data, row.bcid);
                    return (
                        <BarcodeView
                            key={row.id}
                            {...commonView}
                            onRender={undefined}
                            options={buildOptions(row.bcid || "code128", guarded.data, rowSettings(row))}
                            notice={guarded.notice}
                            caption={row.label}
                            toolbar={{ ...toolbarBase, save: false, fileName: rowName(row, index) }}
                            lazy={listLazyRender}
                        />
                    );
                })}
                {!loading && items.length === 0 && text(listEmptyText) && (
                    <div className="mxt-bc-list__empty">{text(listEmptyText)}</div>
                )}
            </div>
        );
    }

    return (
        <BarcodeView
            {...commonView}
            options={options}
            notice={guarded.notice}
            caption={text(props.caption)}
            toolbar={toolbarBase}
            base64={
                base64Attribute
                    ? {
                          format: base64Format,
                          dataUri: base64DataUri,
                          debounce: Math.max(0, saveDebounce),
                          onSaved: saveBase64
                      }
                    : undefined
            }
            className={className}
            style={style}
            tabIndex={tabIndex}
        />
    );
}
