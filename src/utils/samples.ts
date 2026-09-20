import { symbolList } from "bwip-js/browser";

/*
 * Kept apart from symbology.ts: that module is bundled into the Studio Pro editor config, which
 * must stay small, while this one pulls in the whole bwip-js library.
 */
const samples = new Map<string, string>();
for (const symbol of symbolList) {
    samples.set(symbol.bcid, symbol.text);
}

/** Example value that encodes correctly, used by the Studio Pro preview. */
export function sampleText(bcid: string): string {
    return samples.get(bcid) ?? "Count01234567!";
}

/** True when bwip-js has an encoder with this name. */
export function isKnownBcid(bcid: string): boolean {
    return samples.has(bcid);
}
