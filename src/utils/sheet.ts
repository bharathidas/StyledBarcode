import { zipSync } from "fflate";
import { printHtml } from "./render";

export interface SheetItem {
    /** File name without extension. */
    name: string;
    /** Caption printed under the code. */
    label: string;
    /** JPEG bytes of the (framed) code. */
    jpeg: Uint8Array;
    width: number;
    height: number;
}

export interface SheetOptions {
    columns: number;
    labelWidthMm: number;
    labelHeightMm: number;
    gapMm: number;
    showLabel: boolean;
    title: string;
}

const MM = 72 / 25.4;
const A4 = { width: 595.28, height: 841.89 };
const MARGIN_MM = 10;

/** Zips PNG files into one blob. */
export function zipFiles(files: Array<{ name: string; data: Uint8Array }>): Blob {
    const entries: Record<string, Uint8Array> = {};
    const seen = new Set<string>();
    for (const file of files) {
        let name = safeFileName(file.name) || "barcode";
        let counter = 2;
        while (seen.has(name)) {
            name = `${safeFileName(file.name) || "barcode"}-${counter++}`;
        }
        seen.add(name);
        entries[`${name}.png`] = file.data;
    }
    const zipped = zipSync(entries, { level: 0 }); // PNG is already compressed
    return new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
}

export function safeFileName(name: string): string {
    return name
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
}

const pdfText = (value: string): string =>
    "(" +
    Array.from(value)
        .map(ch => {
            const code = ch.charCodeAt(0);
            if (ch === "(" || ch === ")" || ch === "\\") {
                return "\\" + ch;
            }
            if (code < 32 || code > 255) {
                return "?";
            }
            return code > 126 ? "\\" + code.toString(8).padStart(3, "0") : ch;
        })
        .join("") +
    ")";

/**
 * Minimal PDF writer: A4 pages, a grid of JPEG images (DCTDecode) with an optional caption.
 * No dependencies; enough for label sheets.
 */
export function buildPdf(items: SheetItem[], options: SheetOptions): Blob {
    const columns = Math.max(1, Math.round(options.columns));
    const cellW = Math.max(10, options.labelWidthMm) * MM;
    const cellH = Math.max(10, options.labelHeightMm) * MM;
    const gap = Math.max(0, options.gapMm) * MM;
    const margin = MARGIN_MM * MM;
    const titleHeight = options.title ? 24 : 0;
    const usableH = A4.height - 2 * margin - titleHeight;
    const rows = Math.max(1, Math.floor((usableH + gap) / (cellH + gap)));
    const perPage = columns * rows;
    const fontSize = 8;
    const captionHeight = options.showLabel ? fontSize * 1.6 : 0;
    const imageSide = Math.max(8, Math.min(cellW, cellH - captionHeight) - 4);

    const objects: string[] = []; // 1-based object bodies
    const add = (body: string): number => objects.push(body);
    const fontRef = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const pageRefs: number[] = [];
    const pagesRefPlaceholder = add(""); // filled later
    const encoder = new TextEncoder();
    const imageBodies = new Map<number, SheetItem>();

    for (let page = 0; page * perPage < items.length; page++) {
        const pageItems = items.slice(page * perPage, (page + 1) * perPage);
        const imageRefs: number[] = [];
        let content = "";
        if (options.title) {
            content += `BT /F1 12 Tf ${margin} ${A4.height - margin - 12} Td ${pdfText(options.title)} Tj ET\n`;
        }
        pageItems.forEach((item, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const x = margin + col * (cellW + gap);
            const yTop = A4.height - margin - titleHeight - row * (cellH + gap);
            const scale = imageSide / Math.max(item.width, item.height);
            const w = item.width * scale;
            const h = item.height * scale;
            const ix = x + (cellW - w) / 2;
            const iy = yTop - 2 - h;
            const ref = add(""); // image object, body attached below
            imageRefs.push(ref);
            imageBodies.set(ref, item);
            content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im${ref} Do Q\n`;
            if (options.showLabel && item.label) {
                const text = item.label.slice(0, 40);
                const textWidth = text.length * fontSize * 0.5;
                const tx = x + Math.max(0, (cellW - textWidth) / 2);
                content += `BT /F1 ${fontSize} Tf ${tx.toFixed(2)} ${(iy - fontSize - 2).toFixed(2)} Td ${pdfText(
                    text
                )} Tj ET\n`;
            }
        });
        const contentRef = add(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
        const xobjects = imageRefs.map(ref => `/Im${ref} ${ref} 0 R`).join(" ");
        const pageRef = add(
            `<< /Type /Page /Parent ${pagesRefPlaceholder} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
                `/Resources << /Font << /F1 ${fontRef} 0 R >> /XObject << ${xobjects} >> >> /Contents ${contentRef} 0 R >>`
        );
        pageRefs.push(pageRef);
    }
    objects[pagesRefPlaceholder - 1] = `<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(" ")}] /Count ${
        pageRefs.length
    } >>`;
    const catalogRef = add(`<< /Type /Catalog /Pages ${pagesRefPlaceholder} 0 R >>`);

    // Serialize with binary image streams.
    const chunks: Uint8Array[] = [];
    let offset = 0;
    const push = (data: Uint8Array | string): void => {
        const bytes = typeof data === "string" ? encoder.encode(data) : data;
        chunks.push(bytes);
        offset += bytes.length;
    };
    push("%PDF-1.4\n%âãÏÓ\n");
    const offsets: number[] = [];
    objects.forEach((body, index) => {
        const ref = index + 1;
        offsets[ref] = offset;
        const image = imageBodies.get(ref);
        if (image) {
            push(
                `${ref} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
                    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`
            );
            push(image.jpeg);
            push("\nendstream\nendobj\n");
        } else {
            push(`${ref} 0 obj\n${body}\nendobj\n`);
        }
    });
    const xrefOffset = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let ref = 1; ref <= objects.length; ref++) {
        xref += `${String(offsets[ref]).padStart(10, "0")} 00000 n \n`;
    }
    push(
        xref + `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    );
    return new Blob(chunks as unknown as BlobPart[], { type: "application/pdf" });
}

const escapeHtml = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Prints all codes as a label sheet through the browser's print dialog (save as PDF works too). */
export function printSheet(items: Array<{ url: string; label: string }>, options: SheetOptions): void {
    const w = Math.max(10, options.labelWidthMm);
    const h = Math.max(10, options.labelHeightMm);
    const gap = Math.max(0, options.gapMm);
    const html =
        `<!doctype html><html><head><title>${escapeHtml(options.title || "Barcodes")}</title><style>` +
        `@page{size:A4;margin:${MARGIN_MM}mm}html,body{margin:0;font-family:Helvetica,Arial,sans-serif}` +
        `h1{font-size:12pt;margin:0 0 4mm}` +
        `.grid{display:grid;grid-template-columns:repeat(${Math.max(1, options.columns)},${w}mm);gap:${gap}mm}` +
        `.label{width:${w}mm;height:${h}mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid}` +
        `.label img{max-width:100%;max-height:${options.showLabel ? "calc(100% - 5mm)" : "100%"};object-fit:contain}` +
        `.caption{font-size:8pt;line-height:4mm;height:4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}` +
        `</style></head><body>` +
        (options.title ? `<h1>${escapeHtml(options.title)}</h1>` : "") +
        `<div class="grid">` +
        items
            .map(
                item =>
                    `<div class="label"><img src="${item.url}" alt="${escapeHtml(item.label)}">` +
                    (options.showLabel && item.label ? `<div class="caption">${escapeHtml(item.label)}</div>` : "") +
                    `</div>`
            )
            .join("") +
        `</div></body></html>`;
    printHtml(
        html,
        items.map(item => item.url)
    );
}
