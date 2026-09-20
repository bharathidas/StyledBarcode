import {
    CSSProperties,
    KeyboardEvent,
    MouseEvent,
    ReactElement,
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import classNames from "classnames";
import { RenderOptions } from "bwip-js/browser";

import {
    blobToBase64,
    copyImage,
    downloadBlob,
    errorMessage,
    exportImage,
    FileExtension,
    MIME,
    printImage,
    renderSvg
} from "../utils/render";
import { useLatest } from "../utils/useLatest";

export interface ToolbarButton {
    key: string;
    label: string;
    onClick: () => Promise<void> | void;
}

export interface ToolbarSpec {
    png: boolean;
    svg: boolean;
    jpeg: boolean;
    webp: boolean;
    copy: boolean;
    print: boolean;
    save: boolean;
    fileName: string;
    buttonClass: string;
    position: "top" | "bottom";
    labelDownload: string;
    labelCopy: string;
    labelCopied: string;
    labelPrint: string;
    labelSave: string;
    labelSaved: string;
    extra?: ToolbarButton[];
}

export interface Base64Spec {
    format: FileExtension;
    dataUri: boolean;
    /** Milliseconds to wait after the last change before writing. */
    debounce: number;
    onSaved: (value: string) => void;
}

export interface RenderResult {
    value: string;
    valid: boolean;
    error: string;
}

export interface BarcodeViewProps {
    /** Complete bwip-js options; the text inside is the encoded value. */
    options: RenderOptions;
    caption?: string;
    ariaLabel?: string;
    toolbar?: ToolbarSpec;
    /** Message template for encoder errors; [error] is replaced by the encoder's message. */
    invalidText: string;
    /** Runs after every render attempt. */
    onRender?: (result: RenderResult) => void;
    base64?: Base64Spec;
    onClick?: () => void;
    sizeMode?: "fixed" | "fit";
    /** Render only once the widget scrolls into view. */
    lazy?: boolean;
    /** Message shown instead of a barcode (for example when the payload is too long). */
    notice?: string;
    className?: string;
    style?: CSSProperties;
    tabIndex?: number;
}

const DOWNLOADS: Array<{
    key: keyof Pick<ToolbarSpec, "png" | "svg" | "jpeg" | "webp">;
    extension: FileExtension;
    label: string;
}> = [
    { key: "png", extension: "png", label: "PNG" },
    { key: "svg", extension: "svg", label: "SVG" },
    { key: "jpeg", extension: "jpeg", label: "JPEG" },
    { key: "webp", extension: "webp", label: "WEBP" }
];

/** Tracks whether an element has ever been on screen (sticky), for lazy rendering. */
function useEverVisible(ref: { current: HTMLElement | null }, enabled: boolean): boolean {
    const [visible, setVisible] = useState(!enabled);
    useEffect(() => {
        if (!enabled || visible) {
            return;
        }
        const element = ref.current;
        if (!element || typeof IntersectionObserver === "undefined") {
            setTimeout(() => setVisible(true), 0);
            return;
        }
        const observer = new IntersectionObserver(
            entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [enabled, visible, ref]);
    return visible;
}

interface Rendered {
    key: string;
    width: number;
    height: number;
    error?: string;
}

/** Renders one barcode with its caption, validation message and toolbar. */
export function BarcodeView(props: BarcodeViewProps): ReactElement {
    const {
        options,
        caption,
        ariaLabel,
        toolbar,
        invalidText,
        base64,
        onClick,
        notice,
        sizeMode = "fixed",
        lazy = false
    } = props;

    const rootRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const visible = useEverVisible(rootRef, lazy);
    // Results are keyed by the render they belong to, so a new render hides stale ones without a reset.
    const [rendered, setRendered] = useState<Rendered | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<"copied" | "saved" | undefined>(undefined);

    // Callbacks live in refs so a new function identity never re-renders the barcode.
    const onRenderRef = useLatest(props.onRender);
    const base64Ref = useLatest(base64);

    const data = options.text;
    const optionsKey = JSON.stringify(options);
    const renderKey = `${optionsKey}|${base64?.format}|${base64?.dataUri}`;
    const active = Boolean(data) && visible && !notice;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        if (!active) {
            container.innerHTML = "";
            return;
        }
        let result: ReturnType<typeof renderSvg>;
        try {
            result = renderSvg(options);
        } catch (error) {
            container.innerHTML = "";
            const message = errorMessage(error);
            // State updates are deferred so the effect itself stays free of synchronous setState.
            setTimeout(() => setRendered({ key: renderKey, width: 0, height: 0, error: message }), 0);
            onRenderRef.current?.({ value: data, valid: false, error: message });
            return;
        }
        // The widget owns this div: React never renders children into it.
        container.innerHTML = result.svg;
        setTimeout(() => setRendered({ key: renderKey, width: result.width, height: result.height }), 0);
        onRenderRef.current?.({ value: data, valid: true, error: "" });

        let cancelled = false;
        let saveTimer: ReturnType<typeof setTimeout> | undefined;
        const save = base64Ref.current;
        if (save) {
            (async () => {
                await new Promise<void>(resolve => {
                    saveTimer = setTimeout(resolve, Math.max(0, save.debounce));
                });
                if (cancelled) {
                    return;
                }
                const blob = await exportImage(options, save.format);
                if (cancelled || !blob) {
                    return;
                }
                const encoded = await blobToBase64(blob);
                if (!cancelled) {
                    save.onSaved(save.dataUri ? `data:${MIME[save.format]};base64,${encoded}` : encoded);
                }
            })().catch(error => {
                if (!cancelled) {
                    // eslint-disable-next-line no-console
                    console.error("Styled Barcode:", error);
                }
            });
        }
        return () => {
            cancelled = true;
            if (saveTimer) {
                clearTimeout(saveTimer);
            }
        };
        // renderKey captures every value in options and the export settings.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, renderKey]);

    const current = active && rendered?.key === renderKey ? rendered : undefined;
    const renderError = current?.error;
    const fit = sizeMode === "fit";

    const run = useCallback(
        async (task: () => Promise<void>): Promise<void> => {
            if (busy) {
                return;
            }
            setBusy(true);
            try {
                await task();
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error("Styled Barcode:", error);
            } finally {
                setBusy(false);
            }
        },
        [busy]
    );
    const showFlash = (kind: "copied" | "saved"): void => {
        setFlash(kind);
        setTimeout(() => setFlash(current => (current === kind ? undefined : current)), 1500);
    };

    const fileName = toolbar?.fileName?.trim() || "barcode";
    const download = (extension: FileExtension): Promise<void> =>
        run(async () => {
            const blob = await exportImage(options, extension, fileName);
            if (blob) {
                downloadBlob(blob, `${fileName}.${extension}`);
            }
        });
    const copy = (): Promise<void> =>
        run(async () => {
            const blob = await exportImage(options, "png");
            if (blob && (await copyImage(blob))) {
                showFlash("copied");
            }
        });
    const print = (): Promise<void> =>
        run(async () => {
            const blob = await exportImage(options, "png");
            if (blob) {
                printImage(blob, fileName);
            }
        });
    const saveNow = (): Promise<void> =>
        run(async () => {
            const save = base64Ref.current;
            if (!save) {
                return;
            }
            const blob = await exportImage(options, save.format);
            if (blob) {
                const encoded = await blobToBase64(blob);
                save.onSaved(save.dataUri ? `data:${MIME[save.format]};base64,${encoded}` : encoded);
                showFlash("saved");
            }
        });

    const stop = (event: MouseEvent): void => event.stopPropagation();
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (onClick && (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
            event.preventDefault();
            onClick();
        }
    };

    const disabled = busy || !active || Boolean(renderError);
    const button = (key: string, label: string, handler: () => void, extraClass?: string): ReactElement => (
        <button
            key={key}
            type="button"
            className={classNames("btn", toolbar?.buttonClass, "mxt-bc__button", extraClass)}
            disabled={disabled}
            onClick={handler}
        >
            {label}
        </button>
    );
    const hasButtons =
        toolbar &&
        (toolbar.png ||
            toolbar.svg ||
            toolbar.jpeg ||
            toolbar.webp ||
            toolbar.copy ||
            toolbar.print ||
            toolbar.save ||
            (toolbar.extra?.length ?? 0) > 0);
    const toolbarElement =
        toolbar && hasButtons ? (
            <div className={classNames("mxt-bc__toolbar", `mxt-bc__toolbar--${toolbar.position}`)} onClick={stop}>
                {DOWNLOADS.filter(item => toolbar[item.key]).map(item =>
                    button(
                        item.key,
                        toolbar.labelDownload ? `${toolbar.labelDownload} ${item.label}` : item.label,
                        () => download(item.extension)
                    )
                )}
                {toolbar.copy &&
                    button(
                        "copy",
                        flash === "copied" ? toolbar.labelCopied : toolbar.labelCopy,
                        copy,
                        flash === "copied" ? "mxt-bc__button--done" : undefined
                    )}
                {toolbar.print && button("print", toolbar.labelPrint, print)}
                {toolbar.save &&
                    base64 &&
                    button(
                        "save",
                        flash === "saved" ? toolbar.labelSaved : toolbar.labelSave,
                        saveNow,
                        flash === "saved" ? "mxt-bc__button--done" : undefined
                    )}
                {(toolbar.extra ?? []).map(extra =>
                    button(extra.key, extra.label, () => {
                        extra.onClick();
                    })
                )}
            </div>
        ) : null;

    const codeStyle: CSSProperties = fit
        ? { width: "100%" }
        : current && !renderError
        ? // Natural width, height from the aspect ratio: when a narrow container caps the width
          // (max-width: 100%), the barcode scales down instead of being letterboxed.
          { width: current.width, aspectRatio: `${current.width} / ${current.height}` }
        : {};
    const message = renderError ? (invalidText || "Cannot encode: [error]").replace("[error]", renderError) : notice;

    return (
        <div
            ref={rootRef}
            className={classNames("mxt-bc", props.className, {
                "mxt-bc--clickable": Boolean(onClick),
                "mxt-bc--busy": busy,
                "mxt-bc--fit": fit,
                "mxt-bc--invalid": Boolean(renderError)
            })}
            style={props.style}
            tabIndex={props.tabIndex ?? (onClick ? 0 : undefined)}
            role={onClick ? "button" : undefined}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
        >
            {toolbar?.position === "top" && toolbarElement}
            <div className="mxt-bc__stage">
                <div
                    className={classNames("mxt-bc__code", {
                        "mxt-bc__code--empty": !active || Boolean(renderError),
                        "mxt-bc__code--fit": fit
                    })}
                    style={codeStyle}
                    role="img"
                    aria-label={ariaLabel}
                >
                    <div ref={containerRef} className="mxt-bc__svg" />
                    {message && (
                        <span
                            className={classNames("mxt-bc__notice", { "mxt-bc__notice--error": Boolean(renderError) })}
                            role={renderError ? "alert" : undefined}
                        >
                            {message}
                        </span>
                    )}
                </div>
            </div>
            {caption && <div className="mxt-bc__caption">{caption}</div>}
            {toolbar?.position !== "top" && toolbarElement}
        </div>
    );
}
