import { RenderOptions, toCanvas, toSVG } from "bwip-js/browser";

export type FileExtension = "png" | "svg" | "jpeg" | "webp";

export const MIME: Record<FileExtension, string> = {
    png: "image/png",
    svg: "image/svg+xml",
    jpeg: "image/jpeg",
    webp: "image/webp"
};

export interface RenderedSvg {
    svg: string;
    width: number;
    height: number;
}

const escapeXml = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Turns a bwip-js error ("bwipp.ean13badLength#6878: EAN-13 must be 12 or 13 digits") into its message. */
export function errorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    const match = /^bwipp?\.[\w-]+(?:#\d+)?:\s*(.*)$/s.exec(raw);
    return (match ? match[1] : raw).trim() || "The value cannot be encoded.";
}

/**
 * bwip-js writes derived values (scaleX/Y, paddingleft/right/...) into the options object it is given and
 * applies them again on the next call, so every call gets its own shallow copy.
 */
const fresh = (options: RenderOptions): RenderOptions => ({ ...options });

/**
 * Renders the barcode as SVG. bwip-js emits a viewBox only, so the natural size is read from it and
 * written back as width/height for a predictable layout.
 */
export function renderSvg(options: RenderOptions): RenderedSvg {
    const svg = toSVG(fresh(options));
    const match = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
    const width = match ? Math.ceil(Number(match[1])) : 0;
    const height = match ? Math.ceil(Number(match[2])) : 0;
    return { svg, width, height };
}

/** The SVG with explicit dimensions and an XML header, ready for download. */
export function svgDocument(rendered: RenderedSvg, title?: string): string {
    const withSize = rendered.svg.replace(/<svg\b/, `<svg width="${rendered.width}" height="${rendered.height}"`);
    const titled = title ? withSize.replace(/>\n?/, `><title>${escapeXml(title)}</title>\n`) : withSize;
    return `<?xml version="1.0" standalone="no"?>\r\n${titled}`;
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob | null> =>
    new Promise(resolve => canvas.toBlob(blob => resolve(blob), type, 0.92));

/** Exports the barcode in the requested format. JPEG has no alpha channel, so it is flattened onto white. */
export async function exportImage(
    options: RenderOptions,
    extension: FileExtension,
    title?: string
): Promise<Blob | null> {
    if (extension === "svg") {
        return new Blob([svgDocument(renderSvg(options), title)], { type: MIME.svg });
    }
    const canvas = document.createElement("canvas");
    const effective = fresh(options);
    if (extension === "jpeg" && !effective.backgroundcolor) {
        effective.backgroundcolor = "#ffffff"; // JPEG has no alpha channel
    }
    toCanvas(canvas, effective);
    return canvasToBlob(canvas, MIME[extension]);
}

/** Base64 payload of a blob, without the data URI prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result ?? "");
            resolve(result.substring(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copies a PNG blob to the clipboard. Resolves to false when the browser does not allow it. */
export async function copyImage(blob: Blob): Promise<boolean> {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!clipboard?.write || !ClipboardItemCtor) {
        return false;
    }
    try {
        await clipboard.write([new ClipboardItemCtor({ [blob.type]: blob })]);
        return true;
    } catch {
        return false;
    }
}

/** Prints an HTML document through a hidden iframe so no popup blocker gets in the way. */
export function printHtml(html: string, revoke: string[] = []): void {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = (): void => {
        if (cleaned) {
            return;
        }
        cleaned = true;
        setTimeout(() => {
            iframe.remove();
            revoke.forEach(url => URL.revokeObjectURL(url));
        }, 1000);
    };

    const doc = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!doc || !frameWindow) {
        cleanup();
        return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const images = Array.from(doc.images);
    const print = (): void => {
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        frameWindow.focus();
        frameWindow.print();
        // Browsers that never fire afterprint still get cleaned up.
        setTimeout(cleanup, 60_000);
    };
    Promise.all(
        images.map(
            image =>
                new Promise<void>(resolve => {
                    if (image.complete) {
                        resolve();
                    } else {
                        image.onload = () => resolve();
                        image.onerror = () => resolve();
                    }
                })
        )
    ).then(print);
}

/** Prints only the image. */
export function printImage(blob: Blob, title: string): void {
    const url = URL.createObjectURL(blob);
    printHtml(
        `<!doctype html><html><head><title>${escapeXml(title)}</title>` +
            `<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}` +
            `img{max-width:100%;max-height:100%}@page{margin:10mm}</style></head>` +
            `<body><img src="${url}" alt="${escapeXml(title)}"></body></html>`,
        [url]
    );
}
