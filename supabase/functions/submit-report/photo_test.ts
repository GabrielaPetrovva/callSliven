import nodeAssert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { PhotoError, processPhoto } from "./photo.ts";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => nodeAssert.deepStrictEqual(a, b, msg);

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) { o.set(x, i); i += x.length; }
  return o;
};
const has = (b: Uint8Array, s: string) => new TextDecoder("latin1").decode(b).includes(s);
const rejects = (b: Uint8Array) => {
  try { processPhoto(b); } catch (e) { return e instanceof PhotoError && e.code === "invalid_photo"; }
  return false;
};

// --- JPEG ---
function seg(marker: number, data: Uint8Array) {
  return cat(new Uint8Array([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data);
}
function exif(orientation: number) {
  // little-endian, IFD0 със Make и GPS-подобен низ
  return cat(
    enc("Exif\0\0"),
    new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]),
    enc("GPS-SECRET-42.68N"),
  );
}
function jpeg(opts: { orientation?: number; w?: number; h?: number; trailer?: string; truncate?: boolean } = {}) {
  const { orientation = 6, w = 640, h = 480 } = opts;
  const sof = seg(0xc0, new Uint8Array([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]));
  const sos = seg(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
  const scan = new Uint8Array([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]); // със стафинг и рестарт
  const parts = [
    new Uint8Array([0xff, 0xd8]),
    seg(0xe0, enc("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00")),
    seg(0xe1, exif(orientation)),
    seg(0xe1, enc("http://ns.adobe.com/xap/1.0/\0<xmp>SECRET-XMP</xmp>")),
    seg(0xed, enc("Photoshop 3.0\0SECRET-IPTC")),
    seg(0xfe, enc("SECRET-COMMENT")),
    seg(0xdb, new Uint8Array(65)),
    sof, sos, scan,
  ];
  if (!opts.truncate) parts.push(new Uint8Array([0xff, 0xd9]));
  if (opts.trailer) parts.push(enc(opts.trailer));
  return cat(...parts);
}

Deno.test("JPEG: GPS, XMP, IPTC, коментар и край след EOI се махат; ориентацията остава", () => {
  const out = processPhoto(jpeg({ orientation: 6, trailer: "<?php SECRET-PHP ?>" }));
  assertEquals(out.contentType, "image/jpeg");
  assertEquals([out.width, out.height], [640, 480]);
  for (const s of ["SECRET", "GPS", "adobe", "Photoshop", "php"]) assert(!has(out.bytes, s), s);
  assert(has(out.bytes, "JFIF"));
  // един-единствен EXIF сегмент, само с ориентация 6
  const idx = new TextDecoder("latin1").decode(out.bytes).indexOf("Exif");
  assert(idx > 0);
  assertEquals(out.bytes[idx - 4 + 3], 0x22); // дължина 34
  assertEquals(out.bytes[idx + 6 + 8 + 2 + 9], 6); // стойност на ориентацията
  assertEquals([out.bytes[0], out.bytes[1], out.bytes.at(-2), out.bytes.at(-1)], [0xff, 0xd8, 0xff, 0xd9]);
  // стафингът в данните е запазен
  assert(has(out.bytes, "\x12\x34\xff\x00\x56\xff\xd0\x78"));
});

Deno.test("JPEG без ориентация не получава EXIF", () => {
  const out = processPhoto(jpeg({ orientation: 1 }));
  assert(!has(out.bytes, "Exif"));
});

Deno.test("JPEG: счупени, отрязани, твърде малки и твърде големи се отхвърлят", () => {
  assert(rejects(jpeg({ truncate: true })));
  assert(rejects(jpeg({ w: 4, h: 4 })));
  assert(rejects(jpeg({ w: 20000, h: 20000 })));
  assert(rejects(enc("това е текст, не е снимка")));
  assert(rejects(new Uint8Array(0)));
  assert(rejects(cat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(20)))); // без SOF/SOS
});

// --- PNG ---
function crc(b: Uint8Array) {
  let c = 0xffffffff;
  for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array, badCrc = false) {
  const body = cat(enc(type), data);
  const o = new Uint8Array(12 + data.length);
  const dv = new DataView(o.buffer);
  dv.setUint32(0, data.length);
  o.set(body, 4);
  dv.setUint32(8 + data.length, badCrc ? 0 : crc(body));
  return o;
}
function png(opts: { w?: number; h?: number; badCrc?: boolean } = {}) {
  const { w = 64, h = 64 } = opts;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2;
  return cat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", enc("Author\0SECRET-AUTHOR")),
    chunk("eXIf", enc("SECRET-EXIF-GPS")),
    chunk("gAMA", new Uint8Array([0, 1, 0x86, 0xa0])),
    chunk("IDAT", deflateSync(new Uint8Array(10)), opts.badCrc),
    chunk("tIME", new Uint8Array(7)),
    chunk("IEND", new Uint8Array(0)),
    enc("SECRET-TRAILER"),
  );
}

Deno.test("PNG: текстови и EXIF блокове и край след IEND се махат", () => {
  const out = processPhoto(png());
  assertEquals(out.contentType, "image/png");
  assertEquals([out.width, out.height], [64, 64]);
  for (const s of ["SECRET", "tEXt", "eXIf", "tIME"]) assert(!has(out.bytes, s), s);
  for (const s of ["IHDR", "gAMA", "IDAT", "IEND"]) assert(has(out.bytes, s), s);
});

Deno.test("PNG: лош CRC, твърде малък или голям размер се отхвърлят", () => {
  assert(rejects(png({ badCrc: true })));
  assert(rejects(png({ w: 8, h: 8 })));
  assert(rejects(png({ w: 30000, h: 30000 })));
});

// --- WebP ---
function le32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }
function wchunk(type: string, data: Uint8Array) {
  return cat(enc(type), le32(data.length), data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0));
}
function webp(opts: { anim?: boolean } = {}) {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x08 | 0x04 | (opts.anim ? 0x02 : 0);          // EXIF + XMP (+ анимация)
  vp8x[4] = 99; vp8x[7] = 99;                               // 100x100
  const vp8l = new Uint8Array(10);
  vp8l[0] = 0x2f;
  const body = cat(
    enc("WEBP"),
    wchunk("VP8X", vp8x),
    wchunk("VP8L", vp8l),
    wchunk("EXIF", enc("SECRET-EXIF-GPS")),
    wchunk("XMP ", enc("SECRET-XMP")),
  );
  return cat(enc("RIFF"), le32(body.length), body);
}

Deno.test("WebP: EXIF и XMP се махат, флаговете и размерът на RIFF се оправят", () => {
  const out = processPhoto(webp());
  assertEquals(out.contentType, "image/webp");
  assertEquals([out.width, out.height], [100, 100]);
  for (const s of ["SECRET", "EXIF", "XMP "]) assert(!has(out.bytes, s), s);
  const dv = new DataView(out.bytes.buffer, out.bytes.byteOffset);
  assertEquals(dv.getUint32(4, true), out.bytes.length - 8);
  const x = new TextDecoder("latin1").decode(out.bytes).indexOf("VP8X");
  assertEquals(out.bytes[x + 8] & 0x0c, 0);
});

Deno.test("WebP: анимираните се отхвърлят", () => {
  assert(rejects(webp({ anim: true })));
});
