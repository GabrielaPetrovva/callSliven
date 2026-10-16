// lib.ts — чиста логика без мрежа и база: проверка на входа и пречистване на текст.

export const LIMITS = {
  titleMin: 5,
  titleMax: 100,
  descMin: 20,
  descMax: 2000,
  bodyMaxBytes: 20_000,
  maxPhotos: 3,
};

export interface SubmitInput {
  subcategoryId: number;
  title: string;
  description: string;
  lat: number;
  lng: number;
  idempotencyKey: string;
  turnstileToken: string;
  photoPaths: string[];
}

export type Validation =
  | { ok: true; value: SubmitInput }
  | { ok: false; code: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// управляващи знаци и невидими знаци, които променят посоката на текста
// deno-lint-ignore no-control-regex
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

export function cleanText(s: string, keepNewlines: boolean): string {
  let t = s.normalize("NFC").replace(INVISIBLE_RE, "").replace(/\r\n?/g, "\n");
  if (keepNewlines) {
    t = t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  } else {
    t = t.replace(/\s+/g, " ");
  }
  return t.trim();
}

export function validateInput(body: unknown): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, code: "invalid_request" };
  }
  const b = body as Record<string, unknown>;

  const sub = b.subcategory_id;
  if (typeof sub !== "number" || !Number.isInteger(sub) || sub < 1 || sub > 1_000_000) {
    return { ok: false, code: "invalid_subcategory" };
  }
  if (typeof b.title !== "string" || typeof b.description !== "string") {
    return { ok: false, code: "invalid_text" };
  }
  const title = cleanText(b.title, false);
  const description = cleanText(b.description, true);
  if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax) {
    return { ok: false, code: "invalid_title" };
  }
  if (description.length < LIMITS.descMin || description.length > LIMITS.descMax) {
    return { ok: false, code: "invalid_description" };
  }
  const { lat, lng } = b;
  if (
    typeof lat !== "number" || typeof lng !== "number" ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return { ok: false, code: "invalid_location" };
  }
  if (typeof b.idempotency_key !== "string" || !UUID_RE.test(b.idempotency_key)) {
    return { ok: false, code: "invalid_request" };
  }
  if (typeof b.turnstile_token !== "string" || b.turnstile_token.length < 1 || b.turnstile_token.length > 2048) {
    return { ok: false, code: "captcha_failed" };
  }
  let photoPaths: string[] = [];
  if (b.photo_paths !== undefined) {
    const p = b.photo_paths;
    if (
      !Array.isArray(p) || p.length > LIMITS.maxPhotos ||
      p.some((x) => typeof x !== "string" || x.length < 1 || x.length > 300) ||
      new Set(p).size !== p.length
    ) {
      return { ok: false, code: "invalid_photo" };
    }
    photoPaths = p as string[];
  }

  return {
    ok: true,
    value: {
      subcategoryId: sub,
      title,
      description,
      lat,
      lng,
      idempotencyKey: b.idempotency_key.toLowerCase(),
      turnstileToken: b.turnstile_token,
      photoPaths,
    },
  };
}

// Пречистване: личните данни в текста се заместват, а сигналът отива за ръчен преглед.
// Оригиналът остава само в report_private (виждат го собственикът и администраторите).
const EMAIL_RE = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/giu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/giu;
const BARE_DOMAIN_RE = /\b[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.(?:com|net|org|info|xyz|ru|eu|bg|io|me|tk|top)\b(?:\/\S*)?/giu;
// 9 или повече цифри, евентуално с интервали, тирета, точки или скоби: телефони и ЕГН
const NUMBER_RE = /(?:\+|00)?\d(?:[\s\-.()]?\d){8,}/g;

export interface Sanitized {
  text: string;
  reasons: string[];
}

export function sanitize(input: string): Sanitized {
  const reasons = new Set<string>();
  let t = input;

  t = t.replace(EMAIL_RE, () => { reasons.add("email"); return "[имейл]"; });
  t = t.replace(URL_RE, () => { reasons.add("url"); return "[връзка]"; });
  t = t.replace(BARE_DOMAIN_RE, () => { reasons.add("url"); return "[връзка]"; });
  t = t.replace(NUMBER_RE, () => { reasons.add("phone_or_id"); return "[номер]"; });

  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 30) {
    const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
    if (upper / letters.length > 0.7) reasons.add("caps");
  }
  if (/(.)\1{9,}/su.test(t)) reasons.add("repeat");

  return { text: t, reasons: [...reasons] };
}

export function buildPublicText(title: string, description: string) {
  const t = sanitize(title);
  const d = sanitize(description);
  return {
    title: t.text.slice(0, 100),
    description: d.text.slice(0, 2000),
    reasons: [...new Set([...t.reasons, ...d.reasons])],
  };
}

// Адреси от обратното геокодиране.
export interface GeoResult {
  formatted?: string;
  street?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
}

export function addressesFrom(r: GeoResult | null, hideExact: boolean) {
  if (!r) return { publicAddress: null, exactAddress: null };
  const settlement = r.city ?? r.town ?? r.village ?? r.hamlet ?? r.municipality;
  const area = hideExact ? [r.suburb, settlement] : [r.street, settlement];
  const pub = area.filter((x): x is string => !!x).join(", ");
  return {
    publicAddress: pub ? pub.slice(0, 200) : null,
    exactAddress: r.formatted ? r.formatted.slice(0, 300) : null,
  };
}

// Грешките на create_report -> HTTP статус и код, който сайтът превежда на български.
export const ERROR_MAP: Record<string, { status: number; code: string }> = {
  profile_not_found: { status: 403, code: "profile_not_found" },
  account_inactive: { status: 403, code: "account_inactive" },
  account_restricted: { status: 403, code: "account_restricted" },
  invalid_location: { status: 400, code: "invalid_location" },
  invalid_subcategory: { status: 400, code: "invalid_subcategory" },
  outside_municipality: { status: 422, code: "outside_municipality" },
  photo_required: { status: 422, code: "photo_required" },
  rate_limited: { status: 429, code: "rate_limited" },
  too_many_photos: { status: 400, code: "invalid_photo" },
};

export function mapDbError(message: string): { status: number; code: string } | null {
  for (const key of Object.keys(ERROR_MAP)) {
    if (message.includes(key)) return ERROR_MAP[key];
  }
  return null;
}
