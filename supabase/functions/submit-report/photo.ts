// photo.ts — проверка на снимка и махане на метаданните (EXIF с GPS, XMP, коментари) без прекодиране.
// Работи върху структурата на файла, не върху пикселите: бързо, без загуба на качество и без тежки библиотеки.
// Единственото, което остава от EXIF на JPEG, е ориентацията, иначе снимките от телефон излизат завъртени.

export class PhotoError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface Processed {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

export const PHOTO_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxPixels: 40_000_000,
  minSide: 16,
};

const bad = () => new PhotoError("invalid_photo");

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function checkDims(w: number, h: number) {
  if (!(w >= PHOTO_LIMITS.minSide && h >= PHOTO_LIMITS.minSide) || w * h > PHOTO_LIMITS.maxPixels) throw bad();
}

// ===== JPEG =====

function exifOrientation(seg: Uint8Array): number {
  // seg започва от "Exif\0\0"
  if (seg.length < 14 || ascii(seg, 0, 4) !== "Exif" || seg[4] !== 0 || seg[5] !== 0) return 1;
  const t = seg.subarray(6);
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 1;
  const r16 = (i: number) => le ? t[i] | (t[i + 1] << 8) : (t[i] << 8) | t[i + 1];
  const r32 = (i: number) => le ? ((t[i] | (t[i + 1] << 8) | (t[i + 2] << 16) | (t[i + 3] << 24)) >>> 0) : u32be(t, i);
  if (t.length < 8 || r16(2) !== 42) return 1;
  const ifd = r32(4);
  if (ifd + 2 > t.length) return 1;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) return 1;
    if (r16(e) === 0x0112 && r16(e + 2) === 3) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function orientationSegment(o: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,       // Exif\0\0
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF, big-endian, IFD0 на отместване 8
    0x00, 0x01,                                // един запис
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00, // ориентация
    0x00, 0x00, 0x00, 0x00,                    // няма следващ IFD
  ]);
}

function processJpeg(b: Uint8Array): Processed {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw bad();
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let gotExif = false;
  let width = 0, height = 0;
  let sawSos = false, sawEoi = false;
  let i = 2;

  while (i < b.length) {
    if (b[i] !== 0xff) throw bad();
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) throw bad();
    const m = b[i];
    i++;
    if (m === 0xd9) { sawEoi = true; break; }
    if (m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) continue;
    if (i + 2 > b.length) throw bad();
    const len = u16be(b, i);
    if (len < 2 || i + len > b.length) throw bad();
    const data = b.subarray(i + 2, i + len);
    const whole = new Uint8Array(len + 2);
    whole[0] = 0xff; whole[1] = m;
    whole.set(b.subarray(i, i + len), 2);

    let keep = true;
    if (m >= 0xe0 && m <= 0xef) {
      if (m === 0xe0) keep = data.length >= 5 && ascii(data, 0, 5) === "JFIF\0";
      else if (m === 0xe1) {
        keep = false;
        if (!gotExif && data.length >= 6 && ascii(data, 0, 4) === "Exif") { orientation = exifOrientation(data); gotExif = true; }
      } else if (m === 0xe2) keep = data.length >= 12 && ascii(data, 0, 12) === "ICC_PROFILE\0";
      else if (m === 0xee) keep = data.length >= 5 && ascii(data, 0, 5) === "Adobe";
      else keep = false;
    } else if (m === 0xfe) keep = false;

    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (data.length < 6) throw bad();
      height = u16be(data, 1);
      width = u16be(data, 3);
    }
    if (keep) kept.push(whole);
    i += len;

    if (m === 0xda) {
      sawSos = true;
      const start = i;
      let j = i;
      while (j < b.length) {
        if (b[j] === 0xff) {
          const n = b[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) j += 2;
          else if (n === 0xff) j += 1;
          else break;
        } else j++;
      }
      if (j >= b.length - 1) throw bad();
      kept.push(b.slice(start, j));
      i = j;
    }
  }
  if (!sawEoi || !sawSos || width === 0 || height === 0) throw bad();
  checkDims(width, height);

  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  const insertAt = kept.length > 0 && kept[0][1] === 0xe0 ? 1 : 0;
  kept.forEach((p, idx) => {
    if (idx === insertAt && orientation > 1) parts.push(orientationSegment(orientation));
    parts.push(p);
  });
  if (insertAt >= kept.length && orientation > 1) parts.push(orientationSegment(orientation));
  parts.push(new Uint8Array([0xff, 0xd9]));
  return { bytes: concat(parts), contentType: "image/jpeg", ext: "jpg", width, height };
}

// ===== PNG =====

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP"]);

function processPng(b: Uint8Array): Processed {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || sig.some((v, k) => b[k] !== v)) throw bad();
  const parts: Uint8Array[] = [b.slice(0, 8)];
  let i = 8;
  let width = 0, height = 0, sawIdat = false, sawIend = false, first = true;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    if (len > b.length || i + 12 + len > b.length) throw bad();
    const type = ascii(b, i + 4, 4);
    const crc = u32be(b, i + 8 + len);
    if (crc32(b.subarray(i + 4, i + 8 + len)) !== crc) throw bad();
    if (first) {
      if (type !== "IHDR" || len !== 13) throw bad();
      width = u32be(b, i + 8);
      height = u32be(b, i + 12);
      first = false;
    }
    if (type === "IDAT") sawIdat = true;
    if (PNG_KEEP.has(type)) parts.push(b.slice(i, i + 12 + len));
    i += 12 + len;
    if (type === "IEND") { sawIend = true; break; }
  }
  if (!sawIdat || !sawIend) throw bad();
  checkDims(width, height);
  return { bytes: concat(parts), contentType: "image/png", ext: "png", width, height };
}

// ===== WebP =====

function processWebp(b: Uint8Array): Processed {
  if (b.length < 20 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") throw bad();
  const riffEnd = Math.min(8 + u32le(b, 4), b.length);
  const kept: Uint8Array[] = [];
  let width = 0, height = 0, sawImage = false, vp8x = false;
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    const padded = len + (len & 1);
    if (i + 8 + len > riffEnd) throw bad();
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === "VP8X") {
      if (len < 10) throw bad();
      if (data[0] & 0x02) throw bad();               // анимираните не се приемат
      const copy = b.slice(i, i + 8 + padded);
      copy[8] = copy[8] & ~0x0c;                     // без EXIF и XMP
      kept.push(copy);
      width = u24le(data, 4) + 1;
      height = u24le(data, 7) + 1;
      vp8x = true;
    } else if (type === "VP8 ") {
      if (len < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) throw bad();
      if (!vp8x) { width = u16le(data, 6) & 0x3fff; height = u16le(data, 8) & 0x3fff; }
      sawImage = true;
      kept.push(b.slice(i, i + 8 + padded));
    } else if (type === "VP8L") {
      if (len < 5 || data[0] !== 0x2f) throw bad();
      if (!vp8x) {
        const bits = u32le(data, 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      sawImage = true;
      kept.push(b.slice(i, i + 8 + padded));
    } else if (type === "ALPH" || type === "ICCP") {
      kept.push(b.slice(i, i + 8 + padded));
    } else if (type === "ANIM" || type === "ANMF") {
      throw bad();
    }
    // EXIF, XMP и всичко непознато се изхвърлят
    i += 8 + padded;
  }
  if (!sawImage) throw bad();
  checkDims(width, height);
  const body = concat(kept);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 4), 0);
  new DataView(head.buffer).setUint32(4, 4 + body.length, true);
  head.set(b.subarray(8, 12), 8);
  return { bytes: concat([head, body]), contentType: "image/webp", ext: "webp", width, height };
}

// ===== Вход =====

export function processPhoto(input: Uint8Array): Processed {
  if (input.length < 12 || input.length > PHOTO_LIMITS.maxBytes) throw bad();
  let out: Processed;
  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) out = processJpeg(input);
  else if (input[0] === 0x89 && input[1] === 0x50) out = processPng(input);
  else if (input[0] === 0x52 && input[1] === 0x49) out = processWebp(input);
  else throw bad();
  if (out.bytes.length > PHOTO_LIMITS.maxBytes) throw bad();
  return out;
}
