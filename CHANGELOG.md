# Changelog

All notable changes to the Styled Barcode widget are documented here.

## [1.0.0] - 2026-09-20

First public release, built on bwip-js 4.11.4.

### Added

- 71 symbologies grouped by family in the property dropdown, plus a Custom option that accepts any BWIPP
  encoder name: retail (EAN-13 with add-on, EAN-8, UPC-A, UPC-E, ISBN, ISSN, ISMN, EAN-14, SSCC-18),
  general linear (Code 128, GS1-128, Code 39 and Extended, Code 93 and Extended, Interleaved 2 of 5,
  ITF-14, Code 25, Codabar, Code 11, MSI Plessey, Plessey UK, Telepen), pharmaceutical (Pharmacode,
  Two-track Pharmacode, Code 32, PZN), all seven GS1 DataBar variants, matrix (Data Matrix and
  Rectangular, GS1 Data Matrix, QR Code, Micro QR, rMQR, GS1 QR, Swiss QR, Aztec and Compact, MaxiCode,
  DotCode, Han Xin, Code One, Ultracode), stacked (PDF417, Compact PDF417, MicroPDF417, Codablock F,
  Code 16K, Code 49), postal (POSTNET, PLANET, Intelligent Mail, Royal Mail, Mailmark, Australia Post,
  KIX, Japan Post, Identcode, Leitcode) and HIBC.
- GS1 element string builder with fields for GTIN (01), SSCC (00), content GTIN (02), count (37), batch
  or lot (10), serial (21), production date (11), best before (15), expiry (17), net weight (310n) and
  price (392n), plus free-form additional element strings; variable-length AIs are placed last and FNC1
  separators are inserted where the standard requires them.
- Optional GTIN and SSCC check digit calculation, so a 13-digit GTIN or 17-digit SSCC becomes valid
  without a microflow.
- GS1 Digital Link URL builder from the same fields, with a configurable resolver domain, for the Digital
  Link QR Code and Digital Link Data Matrix symbologies.
- Design: scale, bar height and minimum width in millimetres, natural or fit-container sizing, rotation
  by 90, 180 or 270 degrees, padding, bar/background/text colours, transparent background and a border.
- Human readable text: show or hide, custom replacement text, OCR-B or OCR-A, font size, horizontal
  alignment, position above or below the bars, vertical offset and letter spacing.
- Encoding options: add check digit, show the check digit in the text, quiet zone marks, parse escapes,
  parse function codes, ink spread compensation and free-form BWIPP options.
- Validation: encoder errors are shown in place with the reason, a Boolean valid attribute and a maximum
  length guard with translatable messages; an encoded value attribute stores the exact string encoded.
- Toolbar: download PNG, SVG, JPEG and WEBP, copy to clipboard, print, Save now; Atlas button styles,
  configurable position and translatable labels.
- Save to Mendix: base64 of the rendered image written to a String attribute after every render, with
  format, optional data URI prefix, save delay and an On image saved action.
- List mode: one barcode per object with symbology, label, file name and extra options per object,
  render-when-visible for long lists, download all as ZIP, print label sheet and download label sheet as
  PDF with configurable columns, label size in millimetres, gap, captions and title.
- Events: On click, and On render with the encoded value and the validity as variables.
- Accessibility: aria label, live-region notices and keyboard activation; render errors never throw into
  the Mendix client.
- Studio Pro preview that renders the configured symbology and value at design time.
