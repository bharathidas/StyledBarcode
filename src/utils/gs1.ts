export interface Gs1Fields {
    gtin: string;
    checkDigit: "keep" | "append";
    sscc: string;
    content: string;
    count: string;
    lot: string;
    serial: string;
    productionDate?: Date;
    bestBefore?: Date;
    expiry?: Date;
    /** Net weight in kg as a decimal string, e.g. "12.345". */
    weight: string;
    /** Price as a decimal string, e.g. "9.99". */
    price: string;
    /** Extra element strings in bracket notation, appended as is. */
    extra: string;
    /** Resolver domain for Digital Links. */
    domain: string;
}

const digitsOnly = (value: string): string => value.replace(/\D+/g, "");

/** GS1 mod-10 check digit over the given digits. */
export function gs1CheckDigit(digits: string): string {
    let sum = 0;
    let weight = 3;
    for (let i = digits.length - 1; i >= 0; i--) {
        sum += Number(digits[i]) * weight;
        weight = weight === 3 ? 1 : 3;
    }
    return String((10 - (sum % 10)) % 10);
}

/** Cleans a GTIN, optionally appends the check digit and left-pads to the target length. */
export function normaliseKey(value: string, mode: "keep" | "append", length: number): string {
    let digits = digitsOnly(value);
    if (!digits) {
        return "";
    }
    if (mode === "append") {
        digits += gs1CheckDigit(digits);
    }
    return digits.length < length ? digits.padStart(length, "0") : digits;
}

/** YYMMDD in the local time zone. */
export function gs1Date(date: Date): string {
    const yy = String(date.getFullYear() % 100).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
}

/**
 * Encodes a decimal as a GS1 measure: the AI's last digit is the number of decimals and the value is
 * six digits. "12.345" with prefix 310 becomes ["3103", "012345"].
 */
export function gs1Measure(prefix: string, value: string): [string, string] | undefined {
    const match = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(value);
    if (!match) {
        return undefined;
    }
    let fraction = (match[2] ?? "").replace(/0+$/, "");
    if (fraction.length > 3) {
        fraction = fraction.slice(0, 3);
    }
    const digits = `${match[1]}${fraction}`.replace(/^0+(?=\d)/, "");
    if (digits.length > 6) {
        return undefined;
    }
    return [`${prefix}${fraction.length}`, digits.padStart(6, "0")];
}

/** Splits "(01)0952...(10)LOT" into [ai, value] pairs. Text without brackets is ignored. */
export function parseElementString(text: string): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const re = /\((\d{2,4})\)([^(]*)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        out.push([match[1], match[2].trim()]);
    }
    return out;
}

/** Element strings in the order GS1 recommends: identification keys first, then attributes. */
export function gs1Elements(fields: Gs1Fields): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const push = (ai: string, value: string): void => {
        if (value) {
            out.push([ai, value]);
        }
    };
    push("00", normaliseKey(fields.sscc, fields.checkDigit, 18));
    push("01", normaliseKey(fields.gtin, fields.checkDigit, 14));
    push("02", normaliseKey(fields.content, fields.checkDigit, 14));
    if (fields.productionDate) {
        push("11", gs1Date(fields.productionDate));
    }
    if (fields.bestBefore) {
        push("15", gs1Date(fields.bestBefore));
    }
    if (fields.expiry) {
        push("17", gs1Date(fields.expiry));
    }
    push("10", fields.lot.trim());
    push("21", fields.serial.trim());
    if (fields.count.trim()) {
        push("37", digitsOnly(fields.count));
    }
    const weight = fields.weight ? gs1Measure("310", fields.weight) : undefined;
    if (weight) {
        push(weight[0], weight[1]);
    }
    const price = fields.price ? gs1Measure("392", fields.price) : undefined;
    if (price) {
        push(price[0], price[1]);
    }
    for (const [ai, value] of parseElementString(fields.extra)) {
        push(ai, value);
    }
    return out;
}

/** "(01)09521234543213(17)261231(10)LOT1" */
export function buildElementString(fields: Gs1Fields): string {
    return gs1Elements(fields)
        .map(([ai, value]) => `(${ai})${value}`)
        .join("");
}

/** Primary keys and their qualifiers go into the path of a Digital Link; everything else is a query parameter. */
const PATH_KEYS = [
    "00",
    "01",
    "8006",
    "8010",
    "8017",
    "8018",
    "253",
    "255",
    "401",
    "402",
    "414",
    "417",
    "8003",
    "8004"
];
const QUALIFIERS: Record<string, string[]> = {
    "01": ["22", "10", "21"],
    "8006": ["22", "10", "21"],
    "414": ["254", "7040"],
    "417": ["7040"],
    "8010": ["8011"],
    "8017": ["8019"],
    "8018": ["8019"]
};

/** "https://id.gs1.org/01/09521234543213/10/LOT1?17=261231" */
export function buildDigitalLink(fields: Gs1Fields): string {
    const elements = gs1Elements(fields);
    const domain = (fields.domain.trim() || "https://id.gs1.org").replace(/\/+$/, "");
    const primary = elements.find(([ai]) => PATH_KEYS.includes(ai));
    if (!primary) {
        return "";
    }
    const used = new Set<string>([primary[0]]);
    let path = `/${primary[0]}/${encodeURIComponent(primary[1])}`;
    for (const qualifier of QUALIFIERS[primary[0]] ?? []) {
        const element = elements.find(([ai]) => ai === qualifier);
        if (!element) {
            continue; // qualifiers keep this order but any of them may be omitted
        }
        used.add(qualifier);
        path += `/${qualifier}/${encodeURIComponent(element[1])}`;
    }
    const query = elements
        .filter(([ai]) => !used.has(ai))
        .map(([ai, value]) => `${ai}=${encodeURIComponent(value)}`)
        .join("&");
    return `${domain}${path}${query ? `?${query}` : ""}`;
}
